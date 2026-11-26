import Foundation

/// A single request line received from the host.
public struct Request {
  /// Request identifier.
  public let id: Int
  /// Command name.
  public let cmd: String
  /// Command arguments.
  public let args: [String: Any]

  /// Creates a request.
  public init(id: Int, cmd: String, args: [String: Any]) {
    self.id = id
    self.cmd = cmd
    self.args = args
  }
}

/// Parses a JSON request line, returning nil on any failure.
public func parseRequest(_ line: String) -> Request? {
  guard let data = line.data(using: .utf8),
        let json = try? JSONSerialization.jsonObject(with: data),
        let obj = json as? [String: Any] else {
    return nil
  }
  guard let number = obj["id"] as? NSNumber,
        CFGetTypeID(number) != CFBooleanGetTypeID() else {
    return nil
  }
  let value = number.doubleValue
  guard value == value.rounded(),
        value >= Double(Int.min),
        value <= Double(Int.max) else {
    return nil
  }
  guard let cmd = obj["cmd"] as? String, !cmd.isEmpty else {
    return nil
  }
  var args = obj
  args.removeValue(forKey: "id")
  args.removeValue(forKey: "cmd")
  return Request(id: number.intValue, cmd: cmd, args: args)
}

/// Encodes a dictionary as a JSON line, falling back to an error object.
public func encode(_ object: [String: Any]) -> String {
  guard JSONSerialization.isValidJSONObject(object),
        let data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys, .withoutEscapingSlashes]),
        let s = String(data: data, encoding: .utf8) else {
    return "{\"code\":\"error\",\"message\":\"encode failed\",\"ok\":false}"
  }
  return s
}
