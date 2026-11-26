# Mac Native Slideshow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PowerPoint decks play Native on macOS (animations, transitions, video with PowerPoint-only sound) through a Swift helper that speaks the `ppt-bridge` protocol.

**Architecture:** `native/mac-ppt-bridge` (Swift Package, macOS 13+) drives PowerPoint for Mac with in-process AppleScript, finds the slide show window's CGWindowID through ScreenCaptureKit, counts animation clicks itself, and streams PowerPoint's sound (ScreenCaptureKit app filter) over a Unix socket in the named-pipe PCM format. The app reuses `PowerPointEngine`, `SlideShowManager`, `SlideSound` and the `desktop` StreamLayer; new is the engine choice on `darwin`, the helper path, a crop of the window picture (title bar), and Mac imports stored as `pptx` decks.

**Tech Stack:** Swift 5.9+ (Foundation, AppKit NSAppleScript, ScreenCaptureKit, AVFoundation), XCTest; Electron 45, TypeScript, Vitest; GitHub Actions `macos-latest`.

**Spec:** `docs/superpowers/specs/2026-11-26-mac-native-slideshow-design.md`

## Global Constraints

- Helper protocol, request/reply fields, error codes and events: exactly `native/ppt-bridge/README.md` (Protocol, Hang detection), plus the Mac additions below. Parser: `src/main/slideshow/bridge-protocol.ts`.
- Mac additions to the `open` reply: `crop: {x, y, width, height}` (fractions 0..1 of the captured window), `audio: "pipe"`, `audioPipe` = Unix socket path.
- PCM on the socket: interleaved float32 little-endian, 48 kHz, stereo, no header (`PcmBlocker` in `audio-pipe.ts`).
- Minimum macOS 13.0; PowerPoint at `/Applications/Microsoft PowerPoint.app`, bundle id `com.microsoft.Powerpoint`.
- Slide show window title: `PowerPoint Slide Show - [<presentation name without extension>]` (spike: `[Presentation1]` for `Presentation1.pptx`).
- Never: show the "End of slide show" screen, capture the title bar, capture any sound but PowerPoint's, quit or kill a PowerPoint the helper did not launch.
- Operator copy (English), exact: `Allow Bridgecast in System Settings > Privacy & Security > Screen & System Audio Recording, then reopen Bridgecast. Showing still slides.`
- **Nothing builds or runs Electron on the user's Windows laptop** (it runs a live LED show): Swift builds/tests and the app build run in GitHub Actions only; locally only `npx vitest run <single file>` and `npm run typecheck`. No e2e locally.
- Test builds are "Bridgecast Beta": `appId` `com.bridgecast.app.beta`, `productName` `Bridgecast Beta`, package `name` `bridgecast-beta` (separate userData). Release config unchanged.
- Commits: `git -c user.name="Gerson Sebastian" -c user.email="sebastiangerson24@gmail.com" commit ...`, no attribution lines.

## Review Focus

1. The presentation name contains `[`, `]` or non-ASCII (e.g. `Rapat [final] – Ü.pptx`): the window is still found (match by PID + exact expected title, not a pattern) (Task 2 test `expectedTitle` + manual check).
2. The operator already has PowerPoint open with another file: the helper opens its own presentation read-only, closes only that one, never quits PowerPoint (Task 3 manual check; `owned` logic test in Task 3).
3. Next on the last click of the last slide: position stays on the last slide, reply `ended`, no end screen (Task 2 `ShowClamp` test).
4. Screen Recording not allowed: the open fails with code `screenrecording`, the deck shows still slides with the exact operator copy, no crash, no black (Task 5 test).
5. PowerPoint quits or crashes while live: helper emits `exited`, the manager falls back to the PNG (existing behavior; Task 6 checklist item).

---

### Task 1: CI builds and tests the helper; test builds are "Bridgecast Beta"

**Files:**
- Create: `native/mac-ppt-bridge/Package.swift`, `native/mac-ppt-bridge/Sources/MacPptBridge/main.swift` (prints `{"event":"hello"}` and exits for now), `native/mac-ppt-bridge/Sources/BridgeCore/Placeholder.swift`, `native/mac-ppt-bridge/Tests/BridgeCoreTests/PlaceholderTests.swift`
- Create: `scripts/build-mac-ppt-bridge.sh`
- Modify: `.github/workflows/mac.yml`, `electron-builder.yml` (mac `extraResources`)

**Interfaces:**
- Produces: package with library target `BridgeCore` (pure, testable logic) and executable target `MacPptBridge` (product name `mac-ppt-bridge`); script output `native/mac-ppt-bridge/dist/mac-ppt-bridge` (universal, ad-hoc signed); packaged at `resources/mac-ppt-bridge/mac-ppt-bridge`.

- [ ] **Step 1:** `Package.swift`: swift-tools 5.9, platform `.macOS(.v13)`, targets above, test target `BridgeCoreTests` depends on `BridgeCore`.
- [ ] **Step 2:** `scripts/build-mac-ppt-bridge.sh`: `swift test` then `swift build -c release --arch arm64 --arch x86_64`, copy the product to `dist/`, `codesign --force --sign - dist/mac-ppt-bridge`, `lipo -info`.
- [ ] **Step 3:** `mac.yml`: after `npm ci`, run `npm test` then `bash scripts/build-mac-ppt-bridge.sh` before `npm run build`. When `TAG` is empty (test build), package with `-c.appId=com.bridgecast.app.beta -c.productName="Bridgecast Beta" -c.extraMetadata.name=bridgecast-beta`; release builds unchanged. Keep the push trigger and artifact step for branch `test/mac-build`; add `feat/mac-native-slideshow` to the push branches.
- [ ] **Step 4:** `electron-builder.yml` mac `extraResources`: `from: native/mac-ppt-bridge/dist`, `to: mac-ppt-bridge`, `filter: [mac-ppt-bridge]`.
- [ ] **Step 5: Push and verify in CI** (`git push`, `gh run watch`). Expected: job green, `lipo -info` shows `x86_64 arm64`, artifact `Bridgecast Beta-*.dmg` names (or `bridgecast-beta-*`).
- [ ] **Step 6: Commit** `ci(mac): build mac-ppt-bridge and package test builds as Bridgecast Beta`.

### Task 2: Pure helper logic (BridgeCore)

**Files:**
- Create: `native/mac-ppt-bridge/Sources/BridgeCore/{StepCounter.swift,SlideClicks.swift,ShowClamp.swift,WindowMatch.swift,CropRect.swift,Pcm.swift,Protocol.swift}`
- Test: `native/mac-ppt-bridge/Tests/BridgeCoreTests/*.swift` (remove the placeholder)

**Interfaces:**
- Produces:
  - `final class StepCounter { init(index: Int = 0, clicks: Int = 0); private(set) var index, clicks, step: Int; func onNextEffect(); func onPrevEffect(); func onSlideChanged(index: Int, clicks: Int) }` — exact port of `native/lo-bridge/steps.py` (`on_next_effect`, `on_prev_effect`, `on_slide_changed`, `_backwards`).
  - `func clickCount(slideXml: String) -> Int` — number of `<p:par>` whose `<p:cTn ... nodeType="clickEffect"` (count `nodeType="clickEffect"` occurrences inside `<p:timing>`; 0 when no timing).
  - `func slideOrder(presentationXml: String, relsXml: String) -> [String]` — slide part paths (`ppt/slides/slideN.xml`) in show order from `p:sldIdLst` r:ids resolved through `ppt/_rels/presentation.xml.rels`.
  - `enum ShowClamp { static func afterNext(position: Int, slideCount: Int) -> (clampTo: Int?, ended: Bool) }` — `position` 1-based from PowerPoint; `position > slideCount` → `(slideCount, true)`, else `(nil, false)`.
  - `func expectedTitle(fileName: String) -> String` → `"PowerPoint Slide Show - [" + name without last extension + "]"`.
  - `struct CropRect: Equatable { x, y, width, height: Double }`; `func slideCrop(window: CGSize, titleBar: Double, slideAspect: Double) -> CropRect` — content = window minus `titleBar` points at the top, slide letter/pillar-boxed centred inside it; result as fractions of the whole window.
  - `func interleave(left: UnsafePointer<Float>, right: UnsafePointer<Float>, frames: Int) -> Data` — float32 LE LRLR.
  - `Protocol`: `parseRequest(_ line: String) -> Request?` (`id`, `cmd`, args dictionary) and `encode(_ object: [String: Any]) -> String` (one line, no newline inside).
- [ ] **Step 1: Write failing tests** (XCTest), values pinned:
  - StepCounter: the cases of `native/lo-bridge/test_steps.py`, one XCTest each, same numbers.
  - `clickCount`: slide with three `nodeType="clickEffect"` and one `nodeType="afterEffect"` → 3; no `<p:timing>` → 0.
  - `slideOrder`: sldIdLst `rId3, rId2` with rels `rId2→slides/slide1.xml`, `rId3→slides/slide2.xml` → `["ppt/slides/slide2.xml", "ppt/slides/slide1.xml"]`.
  - `ShowClamp.afterNext(position: 3, slideCount: 2)` → `(2, true)`; `(2, 2)` → `(nil, false)`.
  - `expectedTitle("Presentation1.pptx")` → `"PowerPoint Slide Show - [Presentation1]"`; `"Rapat [final] – Ü.v2.ppt"` → `"PowerPoint Slide Show - [Rapat [final] – Ü.v2]"`.
  - `slideCrop(window: 1600x900, titleBar: 28, slideAspect: 16/9)`: content 1600x872 → slide 1550.2x872 centred: `x ≈ 0.0156`, `y ≈ 0.0311`, `width ≈ 0.9689`, `height ≈ 0.9689` (accuracy 0.001).
  - `interleave` of L=[1,2], R=[3,4] → bytes of float32 LE `1,3,2,4`.
  - `parseRequest("{\"id\":4,\"cmd\":\"goto\",\"deckId\":\"d\",\"index\":2}")` → id 4, cmd `goto`, index 2; malformed line → nil.
- [ ] **Step 2: Push, CI runs `swift test`.** Expected: FAIL (symbols missing).
- [ ] **Step 3: Implement** the files above (Foundation only, no PowerPoint calls).
- [ ] **Step 4: Push, CI.** Expected: all BridgeCore tests PASS.
- [ ] **Step 5: Commit** `feat(mac-bridge): click counting, end clamp, window title, crop and PCM helpers`.

### Task 3: Helper executable (PowerPoint, window, sound, protocol loop)

**Files:**
- Create: `native/mac-ppt-bridge/Sources/MacPptBridge/{main.swift,PowerPoint.swift,ShowWindow.swift,SoundTap.swift,Ping.swift}`, `native/mac-ppt-bridge/README.md`

**Interfaces:**
- Consumes: Task 2 BridgeCore.
- Produces: the executable implementing the protocol. Requests: `open` (args as Windows; reply `windowId` CGWindowID decimal string, `slides`, `crop`, `audio`, `audioPipe`), `next`, `prev`, `goto`, `close`, `edit` (reply error code `unsupported`), `setVolume` (reply `applied: "ignored"`), `ping` (`busy`). Events: `app {pid, owned}`, `position {deckId, index, step, clicks}`, `error {deckId, message}`, `exited`. Argument `--restore-audio` exits 0 at once. Error code `screenrecording` when ScreenCaptureKit is refused.

- [ ] **Step 1: `PowerPoint.swift`** — all AppleScript through one serial queue on the main thread (`NSAppleScript`), each call timed. `open`: record whether PowerPoint was running (`owned`), open the file, set `show type ... to slide show type window`, read it back (fail `open` if not window), presenter view and loop off, `run slide show`; read slide count; `next`/`prev`/`goto` with `go to next slide`, `go to previous slide`, `go to slide <view> number n` on the show's view; position = `current show position`. After `next`, apply `ShowClamp` (go to the last slide, reply error code `ended`). Clicks per slide come from the file once at open: `/usr/bin/unzip -p <file> ppt/presentation.xml`, `.rels`, each slide XML → `slideOrder` + `clickCount` (failures → 0 clicks, never fail the open). Poll position every 50 ms; emit `position` on change (StepCounter).
- [ ] **Step 2: `ShowWindow.swift`** — after `run slide show`, up to 5 s: `SCShareableContent` windows of PowerPoint's PID whose `title == expectedTitle(file)`; reply its `windowID`. Then send the slide show window behind (AppleScript `set index of slide show window 1` to the back is not available: use `NSRunningApplication(processIdentifier: <caller>)?.activate()` with the caller PID from env `BRIDGECAST_PID`) so Bridgecast keeps the keyboard. `crop` = `slideCrop(window: frame.size, titleBar: 28, slideAspect: slide width/height of the presentation)`.
- [ ] **Step 3: `SoundTap.swift`** — Unix domain socket server at `$TMPDIR/bridgecast-ppt-<pid>.sock` (remove a stale file first), one client at a time; `SCStream` with `SCContentFilter(display:, including: [PowerPoint app], exceptingWindows: [])`, `capturesAudio`, `excludesCurrentProcessAudio`, 48000 Hz, 2 ch, 16x16 video at 2 fps (ignored); each audio buffer → `interleave` → write to the client (drop when no client). A refused ScreenCaptureKit → `open` fails with code `screenrecording`.
- [ ] **Step 4: `Ping.swift` + `main.swift`** — stdin reader thread parses requests; `ping` answered on that thread unless a command has been running > 1 s or `open` > 20 s (PingPolicy). stdout writes serialized. stdin EOF: close shows the helper opened, `close` presentations it opened (`saving no`), quit PowerPoint only when `owned` and no presentation remains, stop the sound tap, exit; force exit after 8 s. PowerPoint terminating (`NSWorkspace.didTerminateApplicationNotification` for its PID) → `{"event":"exited"}` and exit.
- [ ] **Step 5: README** — protocol differences from Windows (crop, audio socket, `ended`, `screenrecording`, `edit` unsupported, no click index from PowerPoint).
- [ ] **Step 6: Push, CI green** (build + BridgeCore tests). Behavior is checked on the Mac in Task 7.
- [ ] **Step 7: Commit** `feat(mac-bridge): PowerPoint for Mac slide show helper`.

### Task 4: App picks the Mac engine and helper

**Files:**
- Modify: `src/main/platform.ts` (`PlatformProbe` gets `hasPowerPoint?: boolean`, `macosMajor?: number`; `detectEngine`), `src/main/slideshow/powerpoint-engine.ts` (`bridgeExePath` gets `platform`; spawn env `BRIDGECAST_PID`), `src/main/index.ts` (probe on darwin; pass platform)
- Test: `src/main/platform.test.ts`, `src/main/slideshow/powerpoint-engine.test.ts`

**Interfaces:**
- Produces: `detectEngine({ platform: 'darwin', hasPowerPoint: true, macosMajor: 13, ... })` → `{ engine: 'powerpoint', canCapture: true }`; `darwin` without PowerPoint or `macosMajor < 13` → `{ engine: 'none', canCapture: false, message: NO_POWERPOINT_ENGINE }` (message text unchanged). `bridgeExePath({ platform, packaged, resourcesPath, appPath }): string` — darwin packaged `resources/mac-ppt-bridge/mac-ppt-bridge`, darwin dev `native/mac-ppt-bridge/dist/mac-ppt-bridge`, win32 unchanged.

- [ ] **Step 1: Failing tests** for the three `detectEngine` cases above and both darwin `bridgeExePath` paths (use `path.join` in expectations).
- [ ] **Step 2: Run** `npx vitest run src/main/platform.test.ts src/main/slideshow/powerpoint-engine.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `index.ts` probes darwin with `fs.existsSync('/Applications/Microsoft PowerPoint.app')` and `Number(os.release().split('.')[0]) - 9` (Darwin 22 = macOS 13). The helper start-failure text stays generic (`HELPER_START_FAILED`); log names the real path instead of `ppt-bridge.exe`.
- [ ] **Step 4: Run** the same tests and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(slideshow): use mac-ppt-bridge on macOS with PowerPoint`.

### Task 5: Crop the window picture; Screen Recording message

**Files:**
- Modify: `src/main/slideshow/engine.ts` (`EngineSession.crop?: CropRect`), `src/main/slideshow/powerpoint-engine.ts` (read `res.crop`), `src/main/slideshow/manager.ts` (`crop(deckId): CropRect | null` next to `windowId`), `src/shared/ipc.ts` + `src/preload/index.ts` + `src/main/index.ts` (Invoke `slideshowCrop: 'slideshow:crop'`, `{ args: [deckId: string]; result: CropRect | null }`, `appHandle` like `slideshowSourceId`), `src/renderer/src/components/StreamLayer.tsx`
- Create: `src/shared/crop.ts` (`CropRect`, `isCropRect`, `cropStyle`), test `src/shared/crop.test.ts`
- Test: `src/main/slideshow/powerpoint-engine.test.ts`

**Interfaces:**
- Produces: `interface CropRect { x: number; y: number; width: number; height: number }` (fractions 0..1); `isCropRect(v: unknown): v is CropRect` (finite, `width,height > 0`, `x+width <= 1.0001`, `y+height <= 1.0001`); `cropStyle(c: CropRect | null): { width: string; height: string; left: string; top: string } | null` — the `<video>` is sized `100/width %` x `100/height %` and offset `-x/width*100 %`, `-y/height*100 %` inside an `overflow: hidden` box; null → no crop (Windows, Linux unchanged).

- [ ] **Step 1: Failing tests:**
  - `cropStyle({x:0.0156,y:0.0311,width:0.9689,height:0.9689})` → `width '103.21%'`, `height '103.21%'`, `left '-1.61%'`, `top '-3.21%'` (2 decimals); `cropStyle(null)` → null.
  - `isCropRect({x:0,y:0,width:1,height:1})` true; `{x:0.5,y:0,width:0.6,height:1}` false; `{x:NaN,...}` false; `'x'` false.
  - PowerPointEngine: open reply with `crop` gives `session.crop`; a reply with an invalid crop gives `undefined`.
  - PowerPointEngine: open rejected with code `screenrecording` → `onStartFailure`/helper error is exactly the Global Constraints copy and the open rejects (deck stays on stills).
- [ ] **Step 2: Run** `npx vitest run src/shared/crop.test.ts src/main/slideshow/powerpoint-engine.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** StreamLayer: for `source === 'desktop'` call `window.api.slideshowCrop(id)` when the stream opens and apply `cropStyle` to the `<video>` and the held-frame canvas (wrapper `overflow: hidden`). Export the copy as `SCREEN_RECORDING_NEEDED` in `powerpoint-engine.ts`.
- [ ] **Step 4: Run** the tests and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(slideshow): crop the Mac slide show window and explain Screen Recording`.

### Task 6: Mac imports become native-capable PowerPoint decks

**Files:**
- Modify: `src/main/index.ts` (`decksAddRendered` for a converted PowerPoint file), `src/main/library.ts` only if `addRendered` cannot already store `source: 'pptx'` with `source.pdf`
- Test: `src/main/library.test.ts` (or the existing add-rendered test file)

**Interfaces:**
- Produces: on darwin with engine `powerpoint`, a deck imported from a converted PowerPoint file is stored like a Windows PowerPoint deck: `source: 'pptx'`, `source.<ext>` = the PowerPoint file, `source.pdf` = the converted PDF, `original.<ext>`, PNG pages, `playback: defaultPlayback('pptx', false)` (= `native`). Without the Mac engine: unchanged (`source: 'pdf'`, Vector).

- [ ] **Step 1: Failing test:** add-rendered with a converted `.pptx` and `engine: 'powerpoint'` → deck `source === 'pptx'`, `playbackOf(deck) === 'native'`, files `source.pptx`, `source.pdf`, `original.pptx` exist; with `engine: 'none'` → `source === 'pdf'`, `playback 'vector'`.
- [ ] **Step 2: Run** that test file. Expected: FAIL.
- [ ] **Step 3: Implement** (pass the engine kind into the add path; no change for Windows/Linux imports).
- [ ] **Step 4: Run** it and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(import): Mac PowerPoint imports can play native`.

### Task 7: Docs, Beta build, field check on the Mac

**Files:**
- Modify: `PRODUCT.md`, `CHANGELOG.md` (Unreleased, "Not verified on a real Mac yet" until the user confirms), `docs/test-checklist.md` (new section "Putar PPT asli di Mac"), `electron-builder.yml` mac `extendInfo` (`NSScreenCaptureUsageDescription`-style text if electron-builder accepts it; the system prompt text for Screen Recording is not customizable, so only add what is valid)

- [ ] **Step 1: Write** the checklist (Indonesian): first native deck asks Screen & System Audio Recording; allow and reopen Bridgecast Beta; animations step per clicker click; transition plays; video moves with sound on Local / OMT / Both; WhatsApp notification not heard on output; no title bar or black bands; last click of last slide stays, no end screen; PowerPoint window never in front of the operator window and keyboard stays in Bridgecast; operator's own PowerPoint file stays open after quitting Bridgecast Beta; Force Quit PowerPoint while live → still slide, Resume after PowerPoint is back.
- [ ] **Step 2: Merge into `test/mac-build`, push, wait for the Beta artifact** (CI only).
- [ ] **Step 3: Commit** `docs(mac): native slide show behavior and field checks`.
