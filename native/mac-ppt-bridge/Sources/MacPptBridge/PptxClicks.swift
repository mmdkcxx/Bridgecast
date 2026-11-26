import Foundation
import BridgeCore

enum PptxClicks {
  /// Animation clicks per slide in show order, read from the .pptx (a zip) with `/usr/bin/unzip -p`.
  /// Any failure (not a zip, .ppt, missing part) returns [] and never throws.
  static func perSlide(file: String) -> [Int] {
    guard let presentation = part(file, "ppt/presentation.xml"),
          let rels = part(file, "ppt/_rels/presentation.xml.rels") else { return [] }
    let order = BridgeCore.slideOrder(presentationXml: presentation, relsXml: rels)
    return order.map { BridgeCore.clickCount(slideXml: part(file, $0) ?? "") }
  }

  /// Runs `/usr/bin/unzip -p <file> <part>` and returns stdout as UTF-8, or nil on non-zero exit/timeout.
  static func part(_ file: String, _ name: String) -> String? {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/unzip")
    process.arguments = ["-p", file, name]
    let stdout = Pipe()
    process.standardOutput = stdout
    process.standardError = FileHandle.nullDevice
    do {
      try process.run()
    } catch {
      return nil
    }

    // Drain stdout on a background queue so the pipe never blocks the child.
    let group = DispatchGroup()
    var data = Data()
    group.enter()
    DispatchQueue.global(qos: .userInitiated).async {
      data = stdout.fileHandleForReading.readDataToEndOfFile()
      group.leave()
    }

    if group.wait(timeout: .now() + 10) == .timedOut {
      process.terminate()
      return nil
    }

    process.waitUntilExit()
    guard process.terminationStatus == 0 else { return nil }
    return String(data: data, encoding: .utf8)
  }
}
