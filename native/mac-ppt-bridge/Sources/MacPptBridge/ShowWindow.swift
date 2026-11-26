import Foundation
import AppKit
import CoreGraphics
import ScreenCaptureKit

enum ShowWindow {
  private static var asked = false

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

  private static func log(_ message: String) {
    FileHandle.standardError.write(Data("[mac-ppt-bridge] \(message)\n".utf8))
  }
}
