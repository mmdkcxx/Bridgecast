import Foundation
import AppKit
import BridgeCore

if CommandLine.arguments.contains("--restore-audio") {
  exit(0)
}

let ping = PingPolicy()
let bridge = Bridge(ping: ping)

let reader = Thread {
  while let line = readLine() {
    if line.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      continue
    }
    guard let req = parseRequest(line) else {
      Out.log("bad request: \(line)")
      continue
    }
    if req.cmd == "ping" {
      if !ping.hung() {
        Out.reply(req.id, ["busy": ping.busy])
      }
    } else {
      DispatchQueue.main.async {
        bridge.handle(req)
      }
    }
  }
  DispatchQueue.main.async {
    bridge.shutdown()
    exit(0)
  }
  Thread.sleep(forTimeInterval: 8)
  exit(0)
}

reader.start()

RunLoop.main.run()
