import Foundation
import AppKit

/// AppleScript failure with a message and an error number.
struct AppleScriptError: Error, CustomStringConvertible {
  let message: String
  let number: Int
  var description: String { "\(message) (\(number))" }
}

/// AppleScript bridge to Microsoft PowerPoint for Mac.
final class PowerPoint {
  /// Bundle identifier of Microsoft PowerPoint.
  static let bundleId = "com.microsoft.Powerpoint"

  /// Escapes and quotes a string for AppleScript source.
  private func quoted(_ s: String) -> String {
    let escaped = s
      .replacingOccurrences(of: "\\", with: "\\\\")
      .replacingOccurrences(of: "\"", with: "\\\"")
    return "\"\(escaped)\""
  }

  /// Parses an integer reply, throwing on anything unexpected.
  private func intValue(_ text: String) throws -> Int {
    guard let value = Int(text.trimmingCharacters(in: .whitespacesAndNewlines)) else {
      throw AppleScriptError(message: "Unexpected reply: \(text)", number: 0)
    }
    return value
  }

  /// Parses a real number reply, throwing on anything unexpected.
  private func doubleValue(_ text: String) throws -> Double {
    guard let value = Double(text.trimmingCharacters(in: .whitespacesAndNewlines)) else {
      throw AppleScriptError(message: "Unexpected reply: \(text)", number: 0)
    }
    return value
  }

  /// Runs a script body inside a PowerPoint tell block on the main thread.
  func run(_ body: String) throws -> String {
    var err: NSDictionary?
    let script = NSAppleScript(source: "tell application \"Microsoft PowerPoint\"\n" + body + "\nend tell")!
    func execute() -> NSAppleEventDescriptor {
      return script.executeAndReturnError(&err)
    }
    let out: NSAppleEventDescriptor
    if Thread.isMainThread {
      out = execute()
    } else {
      var result: NSAppleEventDescriptor!
      DispatchQueue.main.sync { result = execute() }
      out = result
    }
    if let e = err {
      let message = e[NSAppleScript.errorMessage] as? String ?? "AppleScript error"
      let number = e[NSAppleScript.errorNumber] as? Int ?? 0
      throw AppleScriptError(message: message, number: number)
    }
    return out.stringValue ?? ""
  }

  /// Whether PowerPoint is currently running.
  var isRunning: Bool {
    !NSRunningApplication.runningApplications(withBundleIdentifier: PowerPoint.bundleId).isEmpty
  }

  /// Process identifier of PowerPoint when running.
  var pid: pid_t? {
    NSRunningApplication.runningApplications(withBundleIdentifier: PowerPoint.bundleId).first?.processIdentifier
  }

  /// Opens a file and returns the name of the active presentation.
  func open(path: String) throws -> String {
    let body = "open POSIX file " + quoted(path) + "\nname of active presentation"
    return try run(body).trimmingCharacters(in: .whitespacesAndNewlines)
  }

  /// Forces a windowed show configuration and verifies PowerPoint accepted it.
  func prepareWindowedShow(presentation name: String) throws {
    let n = quoted(name)
    let body = """
    try
    set show type of slide show settings of presentation \(n) to slide show type window
    set show with presenter of slide show settings of presentation \(n) to false
    set loop until stopped of slide show settings of presentation \(n) to false
    end try
    show type of slide show settings of presentation \(n) as text
    """
    let reply = try run(body)
    guard reply.lowercased().contains("window") else {
      throw AppleScriptError(message: "PowerPoint did not accept a windowed slide show.", number: 0)
    }
  }

  /// Starts the slide show for a presentation.
  func runShow(presentation name: String) throws {
    _ = try run("run slide show slide show settings of presentation " + quoted(name))
  }

  /// Number of slides in a presentation.
  func slideCount(presentation name: String) throws -> Int {
    try intValue(try run("count of slides of presentation " + quoted(name)))
  }

  /// Slide width divided by slide height, defaulting to 16:9.
  func slideAspect(presentation name: String) -> Double {
    let n = quoted(name)
    let body = "(slide width of page setup of presentation \(n)) / (slide height of page setup of presentation \(n))"
    guard let text = try? run(body), let value = try? doubleValue(text), value > 0 else {
      return 16.0 / 9.0
    }
    return value
  }

  /// AppleScript reference to the slide show view of a window.
  private func view(_ title: String) -> String {
    "slide show view of (first slide show window whose name is \(quoted(title)))"
  }

  /// Advances the show by one slide.
  func next(title: String) throws {
    _ = try run("go to next slide " + view(title))
  }

  /// Moves the show back by one slide.
  func previous(title: String) throws {
    _ = try run("go to previous slide " + view(title))
  }

  /// Jumps the show to a 1-based slide number.
  func goTo(title: String, slide: Int) throws {
    _ = try run("go to slide " + view(title) + " number \(slide)")
  }

  /// Current 1-based show position of a window.
  func position(title: String) throws -> Int {
    try intValue(try run("current show position of " + view(title)))
  }

  /// Whether a slide show window with the given title exists.
  func showExists(title: String) -> Bool {
    let body = "exists (first slide show window whose name is \(quoted(title)))"
    guard let text = try? run(body) else { return false }
    return text.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "true"
  }

  /// Ends the slide show of a window, ignoring errors.
  func exitShow(title: String) {
    _ = try? run("exit slide show " + view(title))
  }

  /// Closes a presentation without saving, ignoring errors.
  func close(presentation name: String) {
    _ = try? run("close presentation " + quoted(name) + " saving no")
  }

  /// Number of open presentations, zero on error.
  func presentationCount() -> Int {
    guard let text = try? run("count of presentations") else { return 0 }
    return (try? intValue(text)) ?? 0
  }

  /// Quits PowerPoint, ignoring errors.
  func quit() {
    _ = try? run("quit")
  }
}
