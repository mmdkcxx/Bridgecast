import Foundation
import AppKit
import CoreGraphics
import ApplicationServices
import ScreenCaptureKit

enum ShowWindow {
  private static var asked = false
  private static var askedAccessibility = false

  /// Screen recording allowed; when not, asks once per process (the prompt adds the app to
  /// System Settings > Privacy & Security > Screen & System Audio Recording; it applies after a reopen).
  static func recordingAllowed() -> Bool {
    if CGPreflightScreenCaptureAccess() {
      return true
    }
    if !asked {
      asked = true
      _ = CGRequestScreenCaptureAccess()
    }
    return false
  }

  /// Polls for a window owned by `pid` with an exact `title` match.
  static func find(pid: pid_t, title: String, timeout: TimeInterval) -> (id: CGWindowID, frame: CGRect)? {
    let deadline = Date().addingTimeInterval(timeout)
    while true {
      let semaphore = DispatchSemaphore(value: 0)
      var match: (id: CGWindowID, frame: CGRect)?
      var failure: Error?

      SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: false) { content, error in
        if let error = error {
          failure = error
        } else if let window = content?.windows.first(where: {
          $0.owningApplication?.processID == pid && $0.title == title
        }) {
          match = (id: window.windowID, frame: window.frame)
        }
        semaphore.signal()
      }

      let remaining = deadline.timeIntervalSinceNow
      guard remaining > 0 else { return nil }
      if semaphore.wait(timeout: .now() + remaining) == .timedOut {
        return nil
      }
      if let failure = failure {
        log("ScreenCaptureKit error: \(failure)")
        return nil
      }
      if let match = match {
        return match
      }

      let sleep = min(0.1, deadline.timeIntervalSinceNow)
      guard sleep > 0 else { return nil }
      Thread.sleep(forTimeInterval: sleep)
    }
  }

  /// Brings process `pid` to the front.
  static func activate(pid: pid_t) {
    guard let app = NSRunningApplication(processIdentifier: pid) else {
      log("No running application for pid \(pid)")
      return
    }
    _ = app.activate(options: [.activateAllWindows])
  }

  /// Brings the slide show window back when the operator minimized it or hid PowerPoint
  /// (macOS stops drawing such windows, so the capture freezes). Returns true when it changed something.
  static func restoreIfNeeded(pid: pid_t, title: String) -> Bool {
    guard let app = NSRunningApplication(processIdentifier: pid) else { return false }
    var changed = false
    if app.isHidden {
      _ = app.unhide()
      changed = true
      log("PowerPoint was hidden; unhid it")
    }

    guard let windows = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as? [[String: Any]] else {
      return changed
    }
    guard let info = windows.first(where: {
      ($0[kCGWindowOwnerPID as String] as? Int) == Int(pid) &&
      ($0[kCGWindowName as String] as? String) == title
    }) else {
      return changed
    }
    let onScreen = info[kCGWindowIsOnscreen as String] as? Bool ?? false
    if onScreen {
      return changed
    }

    if !AXIsProcessTrusted() {
      if !askedAccessibility {
        askedAccessibility = true
        let opts = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        _ = AXIsProcessTrustedWithOptions(opts)
        log("Accessibility permission is needed to restore a minimized slide show window")
      }
      return changed
    }

    let axApp = AXUIElementCreateApplication(pid)
    var value: CFTypeRef?
    if AXUIElementCopyAttributeValue(axApp, kAXWindowsAttribute as CFString, &value) == .success,
       let axWindows = value as? [AXUIElement] {
      for win in axWindows {
        var titleValue: CFTypeRef?
        if AXUIElementCopyAttributeValue(win, kAXTitleAttribute as CFString, &titleValue) == .success,
           let axTitle = titleValue as? String,
           axTitle == title {
          var minimizedValue: CFTypeRef?
          if AXUIElementCopyAttributeValue(win, kAXMinimizedAttribute as CFString, &minimizedValue) == .success,
             let minimized = minimizedValue as? Bool,
             minimized {
            if AXUIElementSetAttributeValue(win, kAXMinimizedAttribute as CFString, kCFBooleanFalse) == .success {
              changed = true
              log("Slide show window was minimized; restored it")
            }
          }
        }
      }
    }

    return changed
  }

  private static func log(_ message: String) {
    FileHandle.standardError.write(Data("[mac-ppt-bridge] \(message)\n".utf8))
  }
}
