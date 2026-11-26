// Throwaway spike (not part of the app): can Bridgecast drive a native PowerPoint for Mac slide
// show the way ppt-bridge.exe does on Windows? It answers, on a real Mac:
//   1. Does the slide show run in a window (show type window), and which window id does it get?
//   2. Do next/prev run one animation click at a time, and does PowerPoint report the click index?
//   3. Can PowerPoint's own sound be recorded alone (ScreenCaptureKit, app filter)?
//   4. Can the slide show window be captured while it is behind other windows?
//   5. How long does each AppleScript command take?
// Build: swiftc -parse-as-library -O Spike.swift -o ppt-spike (see .github/workflows/mac-spike.yml)

import AVFoundation
import AppKit
import CoreGraphics
import CoreMedia
import Foundation
import ImageIO
import ScreenCaptureKit
import UniformTypeIdentifiers

let powerpointBundle = "com.microsoft.Powerpoint"
let outDir = FileManager.default.currentDirectoryPath

func log(_ s: String) {
  print(s)
  fflush(stdout)
}

func asText(_ d: NSAppleEventDescriptor) -> String {
  if let s = d.stringValue { return s }
  if d.numberOfItems > 0 {
    return "{" + (1...d.numberOfItems).compactMap { d.atIndex($0) }.map(asText).joined(separator: ", ") + "}"
  }
  return "<descriptor \(d.descriptorType)>"
}

/// Runs AppleScript in this process; returns (result, error, milliseconds).
@MainActor
func runScript(_ source: String) -> (String?, String?, Int) {
  let t0 = Date()
  var err: NSDictionary?
  guard let script = NSAppleScript(source: source) else { return (nil, "script did not compile", 0) }
  let out = script.executeAndReturnError(&err)
  let ms = Int(Date().timeIntervalSince(t0) * 1000)
  if let err {
    let msg = (err[NSAppleScript.errorMessage] as? String) ?? "\(err)"
    let num = (err[NSAppleScript.errorNumber] as? Int).map { " (\($0))" } ?? ""
    return (nil, msg + num, ms)
  }
  return (asText(out), nil, ms)
}

@discardableResult
@MainActor
func step(_ label: String, _ body: String) -> String? {
  let (out, err, ms) = runScript("tell application \"Microsoft PowerPoint\"\n\(body)\nend tell")
  if let err {
    log("[\(label)] ERROR after \(ms) ms: \(err)")
    return nil
  }
  log("[\(label)] OK in \(ms) ms: \(out ?? "")")
  return out ?? ""
}

/// `properties of <thing>` as readable text: coercing a record to text fails, and the error
/// message spells the record out with its property names.
@MainActor
func dump(_ label: String, _ thing: String) {
  step(label, """
    try
      return (properties of \(thing)) as text
    on error m
      return m
    end try
    """)
}

func quoted(_ s: String) -> String {
  "\"" + s.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"") + "\""
}

// MARK: - Windows

func listCGWindows() {
  log("--- CGWindowList: PowerPoint windows (names need Screen Recording permission) ---")
  guard let info = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as? [[String: Any]] else {
    log("  window list unavailable")
    return
  }
  for w in info where ((w[kCGWindowOwnerName as String] as? String) ?? "").contains("PowerPoint") {
    let id = w[kCGWindowNumber as String] as? Int ?? -1
    let name = w[kCGWindowName as String] as? String ?? "(no name)"
    let layer = w[kCGWindowLayer as String] as? Int ?? 0
    let onscreen = w[kCGWindowIsOnscreen as String] as? Bool ?? false
    let b = w[kCGWindowBounds as String] as? [String: Any] ?? [:]
    let size = "\(b["X"] ?? "?"),\(b["Y"] ?? "?") \(b["Width"] ?? "?")x\(b["Height"] ?? "?")"
    if (b["Width"] as? Double ?? 0) < 50 { continue }
    log("  id=\(id) layer=\(layer) onscreen=\(onscreen) bounds=\(size) name=\(name)")
  }
}

func powerpointSCWindows() async -> [SCWindow] {
  do {
    let c = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
    return c.windows.filter { $0.owningApplication?.bundleIdentifier == powerpointBundle && $0.frame.width >= 50 }
  } catch {
    log("  ScreenCaptureKit error: \(error) (allow Terminal in Privacy & Security > Screen Recording)")
    return []
  }
}

func listSCWindows() async {
  log("--- ScreenCaptureKit: PowerPoint windows (what Electron's desktopCapturer sees) ---")
  for w in await powerpointSCWindows() {
    log("  windowID=\(w.windowID) onScreen=\(w.isOnScreen) layer=\(w.windowLayer) frame=\(w.frame) title=\(w.title ?? "(none)")")
  }
}

func screenshots() async {
  guard #available(macOS 14.0, *) else {
    log("screenshot test needs macOS 14 or later")
    return
  }
  log("--- capturing every PowerPoint window to PNG (also windows behind others) ---")
  for w in await powerpointSCWindows() {
    let filter = SCContentFilter(desktopIndependentWindow: w)
    let cfg = SCStreamConfiguration()
    cfg.width = Int(w.frame.width)
    cfg.height = Int(w.frame.height)
    cfg.showsCursor = false
    do {
      let t0 = Date()
      let img = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: cfg)
      let url = URL(fileURLWithPath: outDir).appendingPathComponent("window-\(w.windowID).png")
      if let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) {
        CGImageDestinationAddImage(dest, img, nil)
        CGImageDestinationFinalize(dest)
      }
      log("  window \(w.windowID) -> \(url.lastPathComponent) (\(img.width)x\(img.height), \(Int(Date().timeIntervalSince(t0) * 1000)) ms)")
    } catch {
      log("  window \(w.windowID): capture failed: \(error)")
    }
  }
}

// MARK: - Sound

final class AudioRecorder: NSObject, SCStreamOutput, SCStreamDelegate {
  let url: URL
  var file: AVAudioFile?
  var frames: Int64 = 0
  var peak: Float = 0
  var formatText = "?"

  init(url: URL) { self.url = url }

  func stream(_ stream: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
    guard type == .audio, sb.isValid,
      let desc = sb.formatDescription,
      let asbdPtr = CMAudioFormatDescriptionGetStreamBasicDescription(desc)
    else { return }
    var asbd = asbdPtr.pointee
    guard let format = AVAudioFormat(streamDescription: &asbd) else { return }
    let n = AVAudioFrameCount(CMSampleBufferGetNumSamples(sb))
    guard n > 0, let pcm = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: n) else { return }
    pcm.frameLength = n
    guard CMSampleBufferCopyPCMDataIntoAudioBufferList(sb, at: 0, frameCount: Int32(n), into: pcm.mutableAudioBufferList) == noErr else { return }
    if file == nil {
      formatText = "\(format.sampleRate) Hz, \(format.channelCount) ch, interleaved=\(format.isInterleaved)"
      file = try? AVAudioFile(forWriting: url, settings: format.settings, commonFormat: format.commonFormat, interleaved: format.isInterleaved)
    }
    try? file?.write(from: pcm)
    frames += Int64(n)
    if let ch = pcm.floatChannelData {
      for c in 0..<Int(format.channelCount) {
        for i in 0..<Int(n) { peak = max(peak, abs(ch[c][i])) }
      }
    }
  }

  func stream(_ stream: SCStream, didStopWithError error: Error) {
    log("  sound stream stopped: \(error)")
  }
}

/// Records only PowerPoint's sound for `seconds`; runs off the main thread so the operator can
/// keep pressing next while it records.
func recordPowerpointSound(seconds: Double) async {
  do {
    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
    guard let app = content.applications.first(where: { $0.bundleIdentifier == powerpointBundle }) else {
      log("  PowerPoint is not in the ScreenCaptureKit app list")
      return
    }
    guard let display = content.displays.first else { return }
    let filter = SCContentFilter(display: display, including: [app], exceptingWindows: [])
    let cfg = SCStreamConfiguration()
    cfg.capturesAudio = true
    cfg.excludesCurrentProcessAudio = true
    cfg.sampleRate = 48000
    cfg.channelCount = 2
    cfg.width = 16
    cfg.height = 16
    cfg.minimumFrameInterval = CMTime(value: 1, timescale: 2)
    let stamp = Int(Date().timeIntervalSince1970)
    let rec = AudioRecorder(url: URL(fileURLWithPath: outDir).appendingPathComponent("powerpoint-sound-\(stamp).caf"))
    let stream = SCStream(filter: filter, configuration: cfg, delegate: rec)
    let queue = DispatchQueue(label: "sound")
    try stream.addStreamOutput(rec, type: .audio, sampleHandlerQueue: queue)
    try stream.addStreamOutput(rec, type: .screen, sampleHandlerQueue: queue)
    try await stream.startCapture()
    log("  recording PowerPoint sound for \(Int(seconds)) s ... (play the slide with the video now)")
    try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
    try await stream.stopCapture()
    log("  sound done: \(rec.frames) frames, \(rec.formatText), peak level \(String(format: "%.3f", rec.peak)) (0 = silence), file \(rec.url.lastPathComponent)")
  } catch {
    log("  sound recording failed: \(error)")
  }
}

// MARK: - Main

@main
struct Spike {
  @MainActor
  static func main() async {
    let args = CommandLine.arguments
    guard args.count >= 2 else {
      log("Usage: ./ppt-spike /path/to/presentation.pptx")
      exit(2)
    }
    let file = URL(fileURLWithPath: args[1]).standardizedFileURL.path
    log("=== Bridgecast PowerPoint for Mac spike ===")
    log("macOS \(ProcessInfo.processInfo.operatingSystemVersionString), file \(file)")
    log("output folder: \(outDir)")

    step("PowerPoint version", "return version")
    step("open", "open POSIX file \(quoted(file))\nreturn name of active presentation")
    dump("slide show settings (before)", "slide show settings of active presentation")

    // Windowed show (Windows: ppShowTypeWindow). Several spellings, since the dictionary is unknown.
    var windowed = false
    for term in ["slide show type window", "show type window", "slide show type browsed by individual"] {
      if step("set show type: \(term)", "set show type of slide show settings of active presentation to \(term)\nreturn show type of slide show settings of active presentation as text") != nil {
        windowed = true
        break
      }
    }
    log("windowed show set: \(windowed)")
    step("run slide show", "run slide show slide show settings of active presentation\nreturn count of slide show windows")
    Thread.sleep(forTimeInterval: 1.5)
    dump("slide show window 1", "slide show window 1")
    dump("slide show view", "slide show view of slide show window 1")
    listCGWindows()
    await listSCWindows()

    log("")
    log("Commands (type, then Enter). Terminal must be the active window to type:")
    log("  n = next     p = prev     g 3 = go to slide 3     i = show position")
    log("  a = record PowerPoint sound for 15 s (press n meanwhile to start the video)")
    log("  s = capture every PowerPoint window to PNG     w = list windows")
    log("  b = set slide show window bounds to 1280x720 at 100,100")
    log("  q = end the slide show and quit")
    let view = "slide show view of slide show window 1"
    while true {
      print("> ", terminator: "")
      fflush(stdout)
      guard let line = readLine()?.trimmingCharacters(in: .whitespaces) else { break }
      let parts = line.split(separator: " ")
      switch parts.first.map(String.init) ?? "" {
      case "n":
        step("next", "go to next slide \(view)")
        dump("view after next", view)
      case "p":
        step("prev", "go to previous slide \(view)")
        dump("view after prev", view)
      case "g":
        let n = parts.count > 1 ? String(parts[1]) : "1"
        step("goto \(n)", "go to slide \(view) number \(n)")
        dump("view after goto", view)
      case "i":
        dump("view", view)
      case "a":
        Task.detached { await recordPowerpointSound(seconds: 15) }
      case "s":
        await screenshots()
      case "w":
        listCGWindows()
        await listSCWindows()
      case "b":
        step("bounds", "set bounds of slide show window 1 to {100, 100, 1380, 820}\nreturn bounds of slide show window 1")
      case "q":
        step("end show", "exit slide show \(view)")
        step("close", "close active presentation saving no")
        log("bye")
        exit(0)
      case "":
        continue
      default:
        log("unknown command")
      }
    }
  }
}
