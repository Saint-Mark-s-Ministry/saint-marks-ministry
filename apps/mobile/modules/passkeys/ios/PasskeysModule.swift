import AuthenticationServices
import ExpoModulesCore
import UIKit

/// Passkeys through the system sheet. Nothing here is logged, stored or cached: the credential fields go
/// straight back to JavaScript as base64url strings, which is what the server's WebAuthn library expects.
public class PasskeysModule: Module {
  // The controller and its delegate must outlive the request.
  private var inFlight: PasskeyRequest?

  public func definition() -> ModuleDefinition {
    Name("StMarkPasskeys")

    Function("isSupported") { () -> Bool in
      if #available(iOS 16.0, *) { return true }
      return false
    }

    AsyncFunction("createPasskey") { (request: [String: Any]) async throws -> [String: String] in
      guard #available(iOS 16.0, *) else { throw PasskeyFailure.unsupported.exception }
      guard
        let rpId = request["rpId"] as? String,
        let challenge = (request["challenge"] as? String).flatMap(Self.decode),
        let userId = (request["userId"] as? String).flatMap(Self.decode),
        let userName = request["userName"] as? String
      else { throw PasskeyFailure.invalidRequest.exception }
      let displayName = request["displayName"] as? String
      let excluded = ((request["excludeCredentialIds"] as? [String]) ?? []).compactMap(Self.decode)

      let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
      let registration = provider.createCredentialRegistrationRequest(challenge: challenge, name: userName, userID: userId)
      registration.userVerificationPreference = .required
      registration.attestationPreference = .none
      if #available(iOS 17.4, *) {
        if let displayName, !displayName.isEmpty { registration.displayName = displayName }
        if !excluded.isEmpty {
          registration.excludedCredentials = excluded.map {
            ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: $0)
          }
        }
      }

      let authorization = try await self.perform(registration)
      guard
        let credential = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialRegistration,
        let attestation = credential.rawAttestationObject
      else { throw PasskeyFailure.invalidResponse.exception }
      return [
        "credentialId": Self.encode(credential.credentialID),
        "clientDataJSON": Self.encode(credential.rawClientDataJSON),
        "attestationObject": Self.encode(attestation),
      ]
    }

    AsyncFunction("getPasskey") { (request: [String: Any]) async throws -> [String: String] in
      guard #available(iOS 16.0, *) else { throw PasskeyFailure.unsupported.exception }
      guard
        let rpId = request["rpId"] as? String,
        let challenge = (request["challenge"] as? String).flatMap(Self.decode)
      else { throw PasskeyFailure.invalidRequest.exception }

      let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
      let assertion = provider.createCredentialAssertionRequest(challenge: challenge)
      assertion.userVerificationPreference = .required

      let authorization = try await self.perform(assertion)
      guard let credential = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialAssertion
      else { throw PasskeyFailure.invalidResponse.exception }
      return [
        "credentialId": Self.encode(credential.credentialID),
        "clientDataJSON": Self.encode(credential.rawClientDataJSON),
        "authenticatorData": Self.encode(credential.rawAuthenticatorData),
        "signature": Self.encode(credential.signature),
        "userHandle": Self.encode(credential.userID),
      ]
    }
  }

  @MainActor
  @available(iOS 16.0, *)
  private func perform(_ request: ASAuthorizationRequest) async throws -> ASAuthorization {
    // Only one system sheet at a time.
    if inFlight != nil { throw PasskeyFailure.busy.exception }
    let pending = PasskeyRequest()
    inFlight = pending
    defer { inFlight = nil }
    do {
      return try await pending.run(request)
    } catch {
      throw PasskeyFailure.from(error)
    }
  }

  private static func encode(_ data: Data) -> String {
    data.base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }

  private static func decode(_ value: String) -> Data? {
    var base64 = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    while base64.count % 4 != 0 { base64.append("=") }
    return Data(base64Encoded: base64)
  }
}

@available(iOS 16.0, *)
private final class PasskeyRequest: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
  private var continuation: CheckedContinuation<ASAuthorization, Error>?
  private var controller: ASAuthorizationController?

  @MainActor
  func run(_ request: ASAuthorizationRequest) async throws -> ASAuthorization {
    try await withCheckedThrowingContinuation { continuation in
      self.continuation = continuation
      let controller = ASAuthorizationController(authorizationRequests: [request])
      controller.delegate = self
      controller.presentationContextProvider = self
      self.controller = controller
      controller.performRequests()
    }
  }

  func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    let scene = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first { $0.activationState == .foregroundActive } ?? UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
    return scene?.windows.first(where: { $0.isKeyWindow }) ?? scene?.windows.first ?? ASPresentationAnchor()
  }

  func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
    continuation?.resume(returning: authorization)
    continuation = nil
  }

  func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
    continuation?.resume(throwing: error)
    continuation = nil
  }
}

/// The codes JavaScript branches on (src/data/passkeys.ts `classifyPasskeyError`). Messages never carry credential data.
private enum PasskeyFailure: Error {
  case unsupported, invalidRequest, invalidResponse, busy, cancelled, duplicate, notAssociated, failed

  static func from(_ error: Error) -> Exception {
    if let known = error as? PasskeyFailure { return known.exception }
    let ns = error as NSError
    guard ns.domain == ASAuthorizationError.errorDomain, let code = ASAuthorizationError.Code(rawValue: ns.code) else {
      return PasskeyFailure.failed.exception
    }
    switch code {
    case .canceled: return PasskeyFailure.cancelled.exception
    case .notInteractive: return PasskeyFailure.cancelled.exception
    case .invalidResponse: return PasskeyFailure.invalidResponse.exception
    default:
      if #available(iOS 18.0, *), code == .matchedExcludedCredential { return PasskeyFailure.duplicate.exception }
      // "Application with identifier … is not associated with domain …" arrives as .failed or .unknown.
      let detail = (ns.localizedDescription + " " + ((ns.userInfo[NSUnderlyingErrorKey] as? NSError)?.localizedDescription ?? "")).lowercased()
      if detail.contains("not associated") || detail.contains("associated domain") { return PasskeyFailure.notAssociated.exception }
      return PasskeyFailure.failed.exception
    }
  }

  var exception: Exception {
    switch self {
    case .unsupported: return Exception(name: "PasskeyUnsupported", description: "Passkeys need iOS 16 or later.", code: "ERR_PASSKEY_UNSUPPORTED")
    case .invalidRequest: return Exception(name: "PasskeyInvalidRequest", description: "The passkey request was not valid.", code: "ERR_PASSKEY_REQUEST")
    case .invalidResponse: return Exception(name: "PasskeyInvalidResponse", description: "The passkey response was not valid.", code: "ERR_PASSKEY_RESPONSE")
    case .busy: return Exception(name: "PasskeyBusy", description: "A passkey request is already in progress.", code: "ERR_PASSKEY_BUSY")
    case .cancelled: return Exception(name: "PasskeyCancelled", description: "The passkey request was cancelled.", code: "ERR_PASSKEY_CANCELLED")
    case .duplicate: return Exception(name: "PasskeyDuplicate", description: "This device already has a passkey for the account.", code: "ERR_PASSKEY_DUPLICATE")
    case .notAssociated: return Exception(name: "PasskeyNotAssociated", description: "This app is not associated with the passkey domain.", code: "ERR_PASSKEY_NOT_ASSOCIATED")
    case .failed: return Exception(name: "PasskeyFailed", description: "The passkey request failed.", code: "ERR_PASSKEY_FAILED")
    }
  }
}
