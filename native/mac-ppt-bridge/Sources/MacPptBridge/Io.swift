import Foundation
import BridgeCore

/// stdout writer: one JSON object per line, serialized across threads.
enum Out {
  private static let lock = NSLock()

  /// Encodes the object and writes it as one line to stdout.
  static func send(_ object: [String: Any]) {
    let line = encode(object) + "\n"
    guard let data = line.data(using: .utf8) else { return }
    lock.lock()
    defer { lock.unlock() }
    FileHandle.standardOutput.write(data)
  }

  /// Success reply for a request id: {id, ok: true, ...fields}.
  static func reply(_ id: Int, _ fields: [String: Any] = [:]) {
    var object = fields
    object["id"] = id
    object["ok"] = true
    send(object)
  }

  /// Failure reply for a request id: {id, ok: false, code, message}.
  static func fail(_ id: Int, code: String, message: String) {
    send(["id": id, "ok": false, "code": code, "message": message])
  }

  /// Unsolicited event line: {event: name, ...fields}.
  static func event(_ name: String, _ fields: [String: Any] = [:]) {
    var object = fields
    object["event"] = name
    send(object)
  }

  /// Diagnostics to stderr with a "[mac-ppt-bridge] " prefix.
  static func log(_ message: String) {
    guard let data = ("[mac-ppt-bridge] " + message + "\n").data(using: .utf8) else { return }
    FileHandle.standardError.write(data)
  }
}

/// Hang detection (same rule as the Windows helper): ping is answered by the stdin thread itself, and NOT answered while a command has been running too long, so the app's heartbeat falls back to still slides.
final class PingPolicy {
  private let lock = NSLock()
  private var start: Date?
  private var limit: TimeInterval = 0

  /// A command starts on the main thread (`open` gets 20 s, everything else including the position poll 1 s).
  func begin(_ cmd: String) {
    lock.lock()
    defer { lock.unlock() }
    start = Date()
    limit = cmd == "open" ? 20 : 1
  }

  /// A command finished; clears the running state.
  func end() {
    lock.lock()
    defer { lock.unlock() }
    start = nil
  }

  /// true while a command is running (for the ping reply field `busy`).
  var busy: Bool {
    lock.lock()
    defer { lock.unlock() }
    return start != nil
  }

  /// true when the running command is over its limit (now - start > limit).
  func hung(now: Date = Date()) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    guard let started = start else { return false }
    return now.timeIntervalSince(started) > limit
  }
}
