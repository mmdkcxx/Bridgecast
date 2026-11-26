// swift-tools-version:5.9
// mac-ppt-bridge: drives PowerPoint for Mac for Bridgecast's native slide show
// (spec docs/superpowers/specs/2026-11-26-mac-native-slideshow-design.md).
import PackageDescription

let package = Package(
  name: "MacPptBridge",
  platforms: [.macOS(.v13)],
  products: [
    .executable(name: "mac-ppt-bridge", targets: ["MacPptBridge"])
  ],
  targets: [
    // Pure logic, no PowerPoint or system calls: unit tested.
    .target(name: "BridgeCore"),
    .executableTarget(name: "MacPptBridge", dependencies: ["BridgeCore"]),
    .testTarget(name: "BridgeCoreTests", dependencies: ["BridgeCore"])
  ]
)
