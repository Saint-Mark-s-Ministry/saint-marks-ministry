import ExpoModulesCore
import UIKit

/// Reports what iOS 27.1 says about a foldable iPhone (the iPhone Duo): the hinge angle and status,
/// the edge of the vertical bar, and any reserved regions (the crease). Every call is guarded for iOS 27.1,
/// so on any other iPhone or iOS the module answers "not foldable" and nothing here runs.
public class DuoLayoutModule: Module {
  private var interaction: AnyObject?
  private weak var host: UIView?
  private var hingeStatus = "unavailable"
  private var hingeAngle: Double = 0

  public func definition() -> ModuleDefinition {
    Name("DuoLayout")
    Events("onChange")

    OnStartObserving { [weak self] in
      DispatchQueue.main.async { self?.attach() }
    }
    OnStopObserving { [weak self] in
      DispatchQueue.main.async { self?.detach() }
    }

    AsyncFunction("getState") { () -> [String: Any] in
      await MainActor.run { self.snapshot() }
    }
  }

  // MARK: hinge

  private func keyView() -> UIView? {
    let scene = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first { $0.activationState == .foregroundActive } ?? UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
    return scene?.windows.first(where: { $0.isKeyWindow })?.rootViewController?.view ?? scene?.windows.first?.rootViewController?.view
  }

  private func attach() {
    guard #available(iOS 27.1, *), interaction == nil, let view = keyView() else { return }
    let hingeInteraction = UIHingeInteraction { [weak self] _, update in
      guard let self else { return }
      if let hinge = update.hinge {
        switch hinge.status {
        case .closed: self.hingeStatus = "closed"
        case .partiallyOpen: self.hingeStatus = "partial"
        case .fullyOpen: self.hingeStatus = "open"
        default: self.hingeStatus = "unknown"
        }
        self.hingeAngle = Double(hinge.angle)
      } else {
        self.hingeStatus = "unavailable"
      }
      self.sendEvent("onChange", self.snapshot())
    }
    view.addInteraction(hingeInteraction)
    interaction = hingeInteraction
    host = view
    sendEvent("onChange", snapshot())
  }

  private func detach() {
    guard #available(iOS 27.1, *) else { return }
    if let existing = interaction as? UIHingeInteraction { host?.removeInteraction(existing) }
    interaction = nil
    host = nil
  }

  // MARK: state

  private func snapshot() -> [String: Any] {
    var state: [String: Any] = [
      "supported": false,
      "hinge": hingeStatus,
      "angle": hingeAngle,
      "verticalBarEdge": "none",
      "insets": ["top": 0, "left": 0, "bottom": 0, "right": 0],
      "occlusions": [[String: Double]](),
      "divisions": [[String: Double]](),
    ]
    guard #available(iOS 27.1, *), let view = host ?? keyView() else { return state }
    state["supported"] = true
    switch view.traitCollection.verticalBarEdge {
    case .leading: state["verticalBarEdge"] = "leading"
    case .trailing: state["verticalBarEdge"] = "trailing"
    default: state["verticalBarEdge"] = "none"
    }
    let safe = view.safeAreaInsets
    state["insets"] = ["top": safe.top, "left": safe.left, "bottom": safe.bottom, "right": safe.right]
    func frames(_ regions: [UIView.ReservedRegion]) -> [[String: Double]] {
      regions.filter { $0.isActive }.map {
        ["x": $0.frame.origin.x, "y": $0.frame.origin.y, "width": $0.frame.size.width, "height": $0.frame.size.height]
      }
    }
    state["occlusions"] = frames(view.reservedRegions(kind: .occlusion))
    state["divisions"] = frames(view.reservedRegions(kind: .division))
    return state
  }
}
