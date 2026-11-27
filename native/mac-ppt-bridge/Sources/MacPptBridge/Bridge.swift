import Foundation
import AppKit
import BridgeCore

/// Command handler that drives PowerPoint for Mac for the live-event app.
final class Bridge {
  /// Persistent state of one open deck and its slide show.
  private final class Session {
    let deckId: String
    let presentation: String
    let title: String
    let workFile: String
    let slideCount: Int
    let clicks: [Int]
    let clicksKnown: Bool
    let counter: StepCounter
    var lastSent: (Int, Int, Int)?

    /// Creates a session for a deck that is already showing.
    init(deckId: String, presentation: String, title: String, workFile: String, slideCount: Int, clicks: [Int], clicksKnown: Bool, counter: StepCounter) {
      self.deckId = deckId
      self.presentation = presentation
      self.title = title
      self.workFile = workFile
      self.slideCount = slideCount
      self.clicks = clicks
      self.clicksKnown = clicksKnown
      self.counter = counter
    }
  }

  private let ping: PingPolicy
  private let pp = PowerPoint()
  private var sessions: [String: Session] = [:]
  private var owned: Bool?
  private var appSent = false
  private var tap: SoundTap?
  private let socketPath = NSTemporaryDirectory() + "bridgecast-ppt-\(getpid()).sock"
  private var timer: Timer?
  private var pollTicks = 0

  /// Creates the handler and watches for PowerPoint terminating.
  init(ping: PingPolicy) {
    self.ping = ping
    _ = NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didTerminateApplicationNotification, object: nil, queue: .main) { [weak self] note in
      guard let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
            app.bundleIdentifier == PowerPoint.bundleId else { return }
      Out.event("exited")
      self?.tap?.stop()
      exit(0)
    }
  }

  /// Dispatches one request; everything runs on the main thread.
  func handle(_ req: Request) {
    ping.begin(req.cmd)
    defer { ping.end() }
    switch req.cmd {
    case "open": handleOpen(req)
    case "next": handleNext(req)
    case "prev": handlePrev(req)
    case "goto": handleGoto(req)
    case "close": handleClose(req)
    case "edit": Out.fail(req.id, code: "unsupported", message: "Edit in PowerPoint is not available on Mac yet.")
    case "setVolume": Out.reply(req.id, ["applied": "ignored"])
    default: Out.fail(req.id, code: "args", message: "Unknown command.")
    }
  }

  /// Closes every session and quits PowerPoint when we started it.
  func shutdown() {
    for deckId in Array(sessions.keys) {
      closeSession(deckId)
    }
    tap?.stop()
    tap = nil
    if owned == true && pp.isRunning && pp.presentationCount() == 0 {
      pp.quit()
    }
  }

  /// Reads a required non-empty string argument.
  private func stringArg(_ req: Request, _ key: String) -> String? {
    guard let value = req.args[key] as? String, !value.isEmpty else { return nil }
    return value
  }

  /// Opens a deck file and starts a windowed show.
  private func handleOpen(_ req: Request) {
    guard let deckId = stringArg(req, "deckId"), let file = stringArg(req, "file") else {
      Out.fail(req.id, code: "args", message: "Missing or invalid arguments.")
      return
    }
    guard ShowWindow.recordingAllowed() else {
      Out.fail(req.id, code: "screenrecording", message: "Screen recording is not allowed for Bridgecast.")
      return
    }
    guard FileManager.default.fileExists(atPath: file) else {
      Out.fail(req.id, code: "notfound", message: "The presentation file was not found.")
      return
    }
    if sessions[deckId] != nil { closeSession(deckId) }
    let dir = (req.args["workDir"] as? String) ?? (NSTemporaryDirectory() + "bridgecast-show")
    let work = dir + "/show-\(deckId)." + (file as NSString).pathExtension
    var name: String?
    do {
      try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
      try? FileManager.default.removeItem(atPath: work)
      try FileManager.default.copyItem(atPath: file, toPath: work)
      if owned == nil { owned = !pp.isRunning }
      let opened = try pp.open(path: work)
      name = opened
      try pp.prepareWindowedShow(presentation: opened)
      try pp.runShow(presentation: opened)
      guard let pid = pp.pid else {
        pp.exitShow(title: expectedTitle(fileName: opened))
        pp.close(presentation: opened)
        Out.fail(req.id, code: "noapp", message: "PowerPoint is not running.")
        return
      }
      if !appSent {
        Out.event("app", ["pid": Int(pid), "owned": owned ?? false])
        appSent = true
      }
      let title = expectedTitle(fileName: opened)
      guard let win = ShowWindow.find(pid: pid, title: title, timeout: 5) else {
        pp.exitShow(title: title)
        pp.close(presentation: opened)
        Out.fail(req.id, code: "open", message: "The slide show window did not appear.")
        return
      }
      ShowWindow.activate(pid: getppid())
      let count = try pp.slideCount(presentation: opened)
      let parsed = PptxClicks.perSlide(file: work)
      let clicksKnown = parsed.count == count
      let clicks = (0..<count).map { $0 < parsed.count ? parsed[$0] : 0 }
      let crop = slideCrop(window: win.frame.size, titleBar: 28, slideAspect: pp.slideAspect(presentation: opened))
      if tap == nil {
        let t = SoundTap(socketPath: socketPath)
        tap = t
        t.start(bundleId: PowerPoint.bundleId) { err in
          if let err { Out.log("sound capture failed: \(err)") }
        }
      }
      let session = Session(deckId: deckId, presentation: opened, title: title, workFile: work, slideCount: count, clicks: clicks, clicksKnown: clicksKnown, counter: StepCounter(index: 0, clicks: clicks.first ?? 0))
      sessions[deckId] = session
      Out.reply(req.id, [
        "windowId": String(win.id),
        "slides": count,
        "crop": ["x": crop.x, "y": crop.y, "width": crop.width, "height": crop.height],
        "audio": "pipe",
        "audioPipe": socketPath
      ])
      emitPosition(session)
      startTimer()
    } catch let err as AppleScriptError {
      cleanup(name)
      Out.fail(req.id, code: "open", message: err.message)
    } catch {
      cleanup(name)
      Out.fail(req.id, code: "open", message: error.localizedDescription)
    }
  }

  /// Abandons a half-open presentation after a failed open.
  private func cleanup(_ name: String?) {
    guard let name = name else { return }
    pp.exitShow(title: expectedTitle(fileName: name))
    pp.close(presentation: name)
  }

  /// Advances the show by one effect or slide.
  private func handleNext(_ req: Request) {
    guard let deckId = stringArg(req, "deckId") else {
      Out.fail(req.id, code: "args", message: "Missing or invalid arguments.")
      return
    }
    guard let s = sessions[deckId] else {
      Out.fail(req.id, code: "nosession", message: "No slide show is open for this deck.")
      return
    }
    if s.clicksKnown && s.counter.index == s.slideCount - 1 && s.counter.step >= s.counter.clicks {
      Out.fail(req.id, code: "ended", message: "The slide show is at its end.")
      return
    }
    do {
      try pp.next(title: s.title)
      s.counter.onNextEffect()
      let pos = try pp.position(title: s.title)
      let clamp = ShowClamp.afterNext(position: pos, slideCount: s.slideCount)
      if clamp.ended {
        // Back to the end state of the last slide; going to slide N would undo its animations.
        try? pp.previous(title: s.title)
        emitPosition(s)
        Out.fail(req.id, code: "ended", message: "The slide show is at its end.")
      } else {
        sync(s, pos)
        Out.reply(req.id)
      }
    } catch let err as AppleScriptError {
      Out.fail(req.id, code: "error", message: err.message)
    } catch {
      Out.fail(req.id, code: "error", message: error.localizedDescription)
    }
  }

  /// Steps the show back by one effect or slide.
  private func handlePrev(_ req: Request) {
    guard let deckId = stringArg(req, "deckId") else {
      Out.fail(req.id, code: "args", message: "Missing or invalid arguments.")
      return
    }
    guard let s = sessions[deckId] else {
      Out.fail(req.id, code: "nosession", message: "No slide show is open for this deck.")
      return
    }
    do {
      try pp.previous(title: s.title)
      s.counter.onPrevEffect()
      let pos = try pp.position(title: s.title)
      sync(s, pos)
      Out.reply(req.id)
    } catch let err as AppleScriptError {
      Out.fail(req.id, code: "error", message: err.message)
    } catch {
      Out.fail(req.id, code: "error", message: error.localizedDescription)
    }
  }

  /// Jumps to a 0-based slide index.
  private func handleGoto(_ req: Request) {
    guard let deckId = stringArg(req, "deckId") else {
      Out.fail(req.id, code: "args", message: "Missing or invalid arguments.")
      return
    }
    guard let s = sessions[deckId] else {
      Out.fail(req.id, code: "nosession", message: "No slide show is open for this deck.")
      return
    }
    guard let index = req.args["index"] as? Int else {
      Out.fail(req.id, code: "args", message: "Missing or invalid arguments.")
      return
    }
    guard index >= 0 && index < s.slideCount else {
      Out.fail(req.id, code: "range", message: "There is no such slide.")
      return
    }
    do {
      try pp.goTo(title: s.title, slide: index + 1)
      s.counter.onSlideChanged(index: index, clicks: s.clicks[index])
      emitPosition(s)
      Out.reply(req.id)
    } catch let err as AppleScriptError {
      Out.fail(req.id, code: "error", message: err.message)
    } catch {
      Out.fail(req.id, code: "error", message: error.localizedDescription)
    }
  }

  /// Closes the session for a deck.
  private func handleClose(_ req: Request) {
    guard let deckId = stringArg(req, "deckId") else {
      Out.fail(req.id, code: "args", message: "Missing or invalid arguments.")
      return
    }
    if sessions[deckId] != nil { closeSession(deckId) }
    Out.reply(req.id)
  }

  /// Aligns the counter with an absolute PowerPoint slide position.
  private func sync(_ s: Session, _ pos: Int) {
    let idx = pos - 1
    if idx >= 0 && idx < s.slideCount && idx != s.counter.index {
      s.counter.onSlideChanged(index: idx, clicks: s.clicks[idx])
    }
    emitPosition(s)
  }

  /// Emits a position event when the counter actually changed.
  private func emitPosition(_ s: Session) {
    let p = s.counter.position()
    let now = (p.index, p.step, p.clicks)
    if let last = s.lastSent, last == now { return }
    s.lastSent = now
    Out.event("position", ["deckId": s.deckId, "index": p.index, "step": p.step, "clicks": p.clicks])
  }

  /// Keeps the session's slide show window drawable (not minimized, PowerPoint not hidden),
  /// then gives the focus back to Bridgecast when something had to be restored.
  private func keepVisible(_ s: Session) {
    guard let pid = pp.pid else { return }
    if ShowWindow.restoreIfNeeded(pid: pid, title: s.title) {
      ShowWindow.activate(pid: getppid())
    }
  }

  /// Starts the position polling timer once.
  private func startTimer() {
    if timer != nil { return }
    timer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { [weak self] _ in
      self?.poll()
    }
  }

  /// Polls PowerPoint for the current slide of every session.
  private func poll() {
    ping.begin("poll")
    pollTicks += 1
    for s in Array(sessions.values) {
      if let pos = try? pp.position(title: s.title) {
        sync(s, pos)
      } else if !pp.showExists(title: s.title) {
        Out.event("error", ["deckId": s.deckId, "message": "The slide show closed."])
        closeSession(s.deckId, exitShow: false)
      }
      if pollTicks % 5 == 0 && sessions[s.deckId] != nil {
        keepVisible(s)
      }
    }
    ping.end()
    if sessions.isEmpty {
      timer?.invalidate()
      timer = nil
    }
  }

  /// Closes a session, its show and its work file.
  private func closeSession(_ deckId: String, exitShow: Bool = true) {
    guard let s = sessions[deckId] else { return }
    if exitShow { pp.exitShow(title: s.title) }
    pp.close(presentation: s.presentation)
    try? FileManager.default.removeItem(atPath: s.workFile)
    sessions.removeValue(forKey: deckId)
    if sessions.isEmpty {
      timer?.invalidate()
      timer = nil
    }
  }
}
