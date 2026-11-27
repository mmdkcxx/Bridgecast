import Foundation
import ScreenCaptureKit
import CoreMedia
import AVFoundation
import Darwin
import BridgeCore

/// PowerPoint's sound for the app over a Unix domain socket: raw PCM (interleave output), one client at a time, dropped when none.
final class SoundTap: NSObject, SCStreamOutput, SCStreamDelegate {
  /// Error reported when PowerPoint is not running.
  static let noPowerPoint = NSError(domain: "SoundTap", code: 1, userInfo: [NSLocalizedDescriptionKey: "PowerPoint is not running."])

  /// Path of the Unix domain socket the PCM is written to.
  let socketPath: String

  private let lock = NSLock()
  private let queue = DispatchQueue(label: "SoundTap.audio")
  private var stream: SCStream?
  private var serverFd: Int32 = -1
  private var clientFd: Int32 = -1

  /// Creates a tap that serves PCM on the socket at the given path.
  init(socketPath: String) {
    self.socketPath = socketPath
    super.init()
  }

  /// Starts capturing PowerPoint audio and serving it on the socket.
  func start(bundleId: String, completion: @escaping (Error?) -> Void) {
    do {
      try openServer()
    } catch {
      completion(error)
      return
    }
    SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: false) { content, error in
      if let error {
        completion(error)
        return
      }
      guard let content,
            let app = content.applications.first(where: { $0.bundleIdentifier == bundleId }),
            let display = content.displays.first else {
        completion(Self.noPowerPoint)
        return
      }
      let filter = SCContentFilter(display: display, including: [app], exceptingWindows: [])
      let cfg = SCStreamConfiguration()
      cfg.capturesAudio = true
      cfg.excludesCurrentProcessAudio = true
      cfg.sampleRate = 48000
      cfg.channelCount = 2
      cfg.width = 16
      cfg.height = 16
      cfg.minimumFrameInterval = CMTime(value: 1, timescale: 2)
      let stream = SCStream(filter: filter, configuration: cfg, delegate: self)
      do {
        try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: self.queue)
        try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: self.queue)
      } catch {
        completion(error)
        return
      }
      self.stream = stream
      stream.startCapture { error in
        completion(error)
      }
    }
  }

  /// Stops capture and closes the socket.
  func stop() {
    stream?.stopCapture(completionHandler: nil)
    stream = nil
    lock.lock()
    if clientFd >= 0 {
      Darwin.close(clientFd)
      clientFd = -1
    }
    if serverFd >= 0 {
      Darwin.close(serverFd)
      serverFd = -1
    }
    lock.unlock()
    Darwin.unlink(socketPath)
  }

  /// Handles audio sample buffers; screen buffers are ignored.
  func stream(_ stream: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
    guard type == .audio, sb.isValid, let desc = sb.formatDescription,
          let asbdPtr = CMAudioFormatDescriptionGetStreamBasicDescription(desc) else { return }
    var asbd = asbdPtr.pointee
    guard let format = AVAudioFormat(streamDescription: &asbd) else { return }
    let n = AVAudioFrameCount(CMSampleBufferGetNumSamples(sb))
    guard n > 0, let pcm = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: n) else { return }
    pcm.frameLength = n
    guard CMSampleBufferCopyPCMDataIntoAudioBufferList(sb, at: 0, frameCount: Int32(n), into: pcm.mutableAudioBufferList) == noErr else { return }
    guard let channels = pcm.floatChannelData else { return }
    let frames = Int(n)
    let data: Data
    if format.channelCount >= 2 {
      data = interleave(left: channels[0], right: channels[1], frames: frames)
    } else {
      data = interleave(left: channels[0], right: channels[0], frames: frames)
    }
    write(data)
  }

  /// Logs an unexpected stream stop to stderr.
  func stream(_ stream: SCStream, didStopWithError error: Error) {
    FileHandle.standardError.write(Data("SoundTap: \(error.localizedDescription)\n".utf8))
  }

  /// Opens the Unix domain socket server, removing any stale socket file.
  private func openServer() throws {
    Darwin.unlink(socketPath)
    let fd = Darwin.socket(AF_UNIX, SOCK_STREAM, 0)
    guard fd >= 0 else { throw Self.error(2) }
    var addr = sockaddr_un()
    addr.sun_family = sa_family_t(AF_UNIX)
    let pathBytes = Array(socketPath.utf8)
    guard pathBytes.count < MemoryLayout.size(ofValue: addr.sun_path) else {
      Darwin.close(fd)
      throw Self.error(2)
    }
    withUnsafeMutablePointer(to: &addr.sun_path) { ptr in
      ptr.withMemoryRebound(to: CChar.self, capacity: pathBytes.count + 1) { dst in
        for (i, byte) in pathBytes.enumerated() { dst[i] = CChar(bitPattern: byte) }
        dst[pathBytes.count] = 0
      }
    }
    let size = socklen_t(MemoryLayout<sockaddr_un>.size)
    let bound = withUnsafePointer(to: &addr) { ptr in
      ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.bind(fd, $0, size) }
    }
    guard bound == 0 else {
      Darwin.close(fd)
      throw Self.error(2)
    }
    guard Darwin.listen(fd, 1) == 0 else {
      Darwin.close(fd)
      throw Self.error(2)
    }
    serverFd = fd
    Thread { [weak self] in self?.acceptLoop() }.start()
  }

  /// Accepts clients until the server socket is closed.
  private func acceptLoop() {
    while true {
      let fd = Darwin.accept(serverFd, nil, nil)
      if fd < 0 { return }
      var one: Int32 = 1
      Darwin.setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &one, socklen_t(MemoryLayout<Int32>.size))
      lock.lock()
      if clientFd >= 0 { Darwin.close(clientFd) }
      clientFd = fd
      lock.unlock()
    }
  }

  /// Writes all bytes to the current client, dropping it on error.
  private func write(_ data: Data) {
    lock.lock()
    defer { lock.unlock() }
    guard clientFd >= 0 else { return }
    var offset = 0
    let ok = data.withUnsafeBytes { raw -> Bool in
      guard let base = raw.baseAddress else { return true }
      while offset < data.count {
        let n = Darwin.write(clientFd, base.advanced(by: offset), data.count - offset)
        if n <= 0 { return false }
        offset += n
      }
      return true
    }
    if !ok {
      Darwin.close(clientFd)
      clientFd = -1
    }
  }

  /// Builds a SoundTap domain error with the given code.
  private static func error(_ code: Int) -> NSError {
    NSError(domain: "SoundTap", code: code, userInfo: [NSLocalizedDescriptionKey: "Socket error \(code)."])
  }
}
