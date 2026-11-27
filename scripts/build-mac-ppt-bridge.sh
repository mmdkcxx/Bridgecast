#!/usr/bin/env bash
# Builds native/mac-ppt-bridge on macOS (GitHub Actions): tests, then a universal release binary
# in native/mac-ppt-bridge/dist/mac-ppt-bridge, ad-hoc signed. electron-builder (mac) packs it.
set -euo pipefail
cd "$(dirname "$0")/../native/mac-ppt-bridge"
swift test
swift build -c release --arch arm64 --arch x86_64
mkdir -p dist
cp "$(swift build -c release --arch arm64 --arch x86_64 --show-bin-path)/mac-ppt-bridge" dist/
codesign --force --sign - dist/mac-ppt-bridge
lipo -info dist/mac-ppt-bridge
