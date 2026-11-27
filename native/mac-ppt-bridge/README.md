# mac-ppt-bridge

`mac-ppt-bridge` drives Microsoft PowerPoint for Mac for Bridgecast's native slide show (spec
`docs/superpowers/specs/2026-11-26-mac-native-slideshow-design.md`). Swift Package, macOS 13+,
universal (arm64 + x86_64).

**Status: built and unit tested in CI only. It has NOT been run against PowerPoint on a Mac by the app.**

## Build

```bash
scripts/build-mac-ppt-bridge.sh   # macOS only: swift test, release universal build into dist/mac-ppt-bridge, ad-hoc sign
```

CI: `.github/workflows/mac-bridge.yml`; `mac.yml` runs it before packaging. The macOS electron-builder
target ships the output as `resources/mac-ppt-bridge/mac-ppt-bridge`; in dev the app starts it from
`dist/mac-ppt-bridge`.

## Layout

- `BridgeCore`: pure, unit tested. `StepCounter.swift` (port of `lo-bridge/steps.py`), slide XML click
  counting, end clamp, window title, crop, PCM interleave, JSON lines.
- `MacPptBridge`: `PowerPoint.swift` (AppleScript), `ShowWindow.swift` (ScreenCaptureKit window lookup,
  gives the focus back), `SoundTap.swift`, `PptxClicks.swift`, `Bridge.swift` (commands), `Io.swift`,
  `main.swift`.

## Protocol

One JSON object per line on stdin/stdout, UTF-8. Same requests, replies, events and hang detection as
the Windows `ppt-bridge` README (position poll every 50 ms, ping answered by the reader thread). The
differences:

- `open` takes an optional `workDir`: the deck file is copied to `<workDir>/show-<deckId>.<ext>` and
  opened from there. Every deck file is named `source.pptx`, PowerPoint cannot open two files with one
  name, and its sandbox asks once per folder; the app passes the folder the import already granted.
- `open` reply: `windowId` = CGWindowID (decimal), `slides`, `crop` {x, y, width, height} = the slide
  inside the captured window as fractions (the capture includes the title bar; title bar taken as
  28 pt), `audio: "pipe"`, `audioPipe` = Unix socket path `$TMPDIR/bridgecast-ppt-<pid>.sock`.
- Sound: ScreenCaptureKit, PowerPoint only (app filter, the current process excluded), raw float32 LE
  stereo 48 kHz interleaved on the socket, one client.
- Position: PowerPoint for Mac reports only the slide (`current show position`), no click index.
  `step`/`clicks` come from a click counter; the clicks per slide are read from the .pptx
  (`nodeType="clickEffect"` in `p:timing`). After Previous / triggers are not counted.
- End: `next` after the last click of the last slide replies `ended` and never shows PowerPoint's end
  screen.
- Errors: also `screenrecording` (Screen & System Audio Recording not allowed) and `unsupported`
  (`edit`). `setVolume` replies `applied: "ignored"` (the app applies the level to the PCM).
  `--restore-audio` exits at once.
- Shutdown: closing stdin closes the shows and presentations the helper opened; PowerPoint is quit only
  if the helper launched it and no presentation remains; force exit after 8 s. PowerPoint quitting ->
  `exited` event.

## Permissions

The helper needs Automation (PowerPoint) and Screen & System Audio Recording; both are attributed to
Bridgecast, the parent app. Ad-hoc builds may have to ask again after an update.
