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

    // Development: where the tab bar and vertical bar actually are, read from the live view hierarchy.
    AsyncFunction("describeBars") { () -> String in
      await MainActor.run { self.describeBars() }
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

  // MARK: bars

  private func describeBars() -> String {
    guard let root = keyView() else { return "no key view" }
    var lines: [String] = []
    var seen = Set<ObjectIdentifier>()
    func walk(_ controller: UIViewController, _ depth: Int) {
      guard seen.insert(ObjectIdentifier(controller)).inserted else { return }
      let pad = String(repeating: " ", count: depth)
      var line = "\(pad)\(type(of: controller)) view=\(controller.view.frame)"
      if #available(iOS 27.1, *) {
        line += " vbar=\(controller.preferredVerticalBarBehavior.rawValue) edge=\(controller.traitCollection.verticalBarEdge.rawValue)"
      }
      if let tabs = controller as? UITabBarController {
        line += " TABBAR frame=\(tabs.tabBar.frame) hidden=\(tabs.tabBar.isHidden) alpha=\(tabs.tabBar.alpha) items=\(tabs.tabBar.items?.count ?? -1)"
      }
      lines.append(line)
      for child in controller.children { walk(child, depth + 1) }
      if let presented = controller.presentedViewController { walk(presented, depth + 1) }
    }
    if let controller = root.window?.rootViewController { walk(controller, 0) }
    func views(_ view: UIView, _ depth: Int) {
      let name = String(describing: type(of: view))
      if depth < 40, name.localizedCaseInsensitiveContains("bar") && !name.contains("Scroll") {
        lines.append("view \(name) frame=\(view.convert(view.bounds, to: nil)) hidden=\(view.isHidden)")
      }
      for sub in view.subviews { views(sub, depth + 1) }
    }
    if let window = root.window { views(window, 0) }
    return lines.joined(separator: "\n")
  }

  // MARK: state

  private func snapshot() -> [String: Any] {
    var state: [String: Any] = [
      "supported": false,
      "hinge": hingeStatus,
      "angle": hingeAngle,
      "verticalBarEdge": "none",
      "insets": ["top": 0, "left": 0, "bottom": 0, "right": 0],
      "occlusions": [[String: Any]](),
      "divisions": [[String: Any]](),
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
    // Inactive regions are included on purpose: a hinge that is flat may report its crease as inactive,
    // but the crease is still where the two halves of the display meet.
    func frames(_ regions: [UIView.ReservedRegion]) -> [[String: Any]] {
      regions.map {
        [
          "x": $0.frame.origin.x, "y": $0.frame.origin.y, "width": $0.frame.size.width, "height": $0.frame.size.height,
          "active": $0.isActive,
          "margins": ["top": $0.margins.top, "left": $0.margins.left, "bottom": $0.margins.bottom, "right": $0.margins.right],
        ]
      }
    }
    state["occlusions"] = frames(view.reservedRegions(kind: .occlusion, options: .includeInactive))
    state["divisions"] = frames(view.reservedRegions(kind: .division, options: .includeInactive))
    return state
  }
}
