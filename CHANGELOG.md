# Changelog

Versions restart at 0.x because the app is in development.

## [Unreleased]

### Added

- Settings > Clicker in the background: when turned on, a presentation clicker's PageDown and PageUp keep moving the live slide while another app is in front (for example while you reply to a message or prepare the next session's files). Off by default. "Clicker keys" chooses PageDown / PageUp (default) or the Right / Left arrows for clickers that send arrows, such as Perfect Cue. While it is on, the two chosen keys move slides from any keyboard on this PC and do not reach other apps. Not verified with a real clicker on Windows yet.

### Changed

- macOS: when Microsoft PowerPoint is installed, Bridgecast uses it first to turn an imported PowerPoint file into a PDF, so fonts and layout match what the speaker made. Keynote and then LibreOffice are still used when PowerPoint is missing or fails. The first import asks for permission to control PowerPoint (System Settings > Privacy & Security > Automation), and PowerPoint asks once to grant access to its working folder (Library/Application Support/bridgecast/PowerPoint export): choose Select…, then Grant Access. It is still a Vector deck without animations. Not verified on a real Mac yet.

## [0.1.15] - 2026-11-24

### Fixed

- macOS: the app no longer opens as "damaged". The build is now signed ad-hoc (there is no Apple certificate yet), so the first open shows the usual "cannot verify the developer" prompt instead: right-click the app and choose Open, or on macOS 15 use System Settings > Privacy & Security > Open Anyway.

### Added

- macOS: PowerPoint files (.pptx, .ppt) can be imported. Bridgecast converts them to PDF with Keynote (free from the App Store) or, when Keynote is missing or fails, LibreOffice, then imports the PDF as a Vector deck. There are no animations or native slide show on a Mac, and the converted deck keeps the PowerPoint file as its original. The first import asks for permission to control Keynote (System Settings > Privacy & Security > Automation). Not verified on a real Mac yet.

## [0.1.14] - 2026-11-24

### Changed

- Output and Network settings moved into the header. HDMI, OMT, NDI, Sound and Canvas are now chips at the top of the window; each opens a popover with its settings. Frame rate and "Send content only" are shared by OMT and NDI and shown in both popovers. The Output tab of the right panel is gone (Controls and Info remain).
- An uploaded KV keeps its full width in the library, and its Replace and Remove buttons appear on hover.

## [0.1.13] - 2026-11-20

### Added

- Realtime zoom for the live slide on the HDMI output. Under the Program monitor: zoom in and out (1x to 4x), four arrows to move the zoomed area, a Reset button, and a small map that shows which part is zoomed (click it or drag its rectangle to move the zoom). The audience sees the zoom at once, and the monitor shows the same picture. Zoom goes back to 1x on every take (next slide, jump, other deck) and on Off air. The KV is never zoomed and the controls rest while it is on air. Network outputs (OMT, NDI) do not zoom yet. Picture quality: image slides and PDF pages get softer at high zoom; a live page or PowerPoint show is as sharp as its capture.

## [0.1.12] - 2026-11-19

### Added

- Web decks on Linux run in the built-in Electron page window (the same webview Windows uses when WebView2 is missing): no Chrome/Chromium helper, nothing extra to install, and no screen-cast permission. Google sign-in is not available in that window; on Windows the WebView2 helper still provides it.
- Linux, optional: Settings > "Use Chrome for web pages" (off by default) hosts web decks in the PC's Google Chrome so sites that refuse embedded browsers work. "Sign in to Google" opens Chrome on Bridgecast's own profile with no automation (Google refuses sign-in while DevTools is attached); web pages then reuse that sign-in. Your personal Chrome profile is never used. The choice applies after a restart, Snap Chromium is not supported (the built-in browser is used, with a message), and a helper that keeps failing moves the pages back to the built-in browser.
- The Off air button uses a fixed alert red in both themes, distinct from the user's accent (and so does its confirm).

### Changed

- Linux: animated PowerPoint slides (LibreOffice) now play in a Wayland session too, through Xwayland; logging in with "GNOME on Xorg" is no longer needed. Chromium's window capture asked the PipeWire portal whenever the session said Wayland, and that never listed the slide show window; the app now tells its own capture that the session is X11 (LibreOffice and the other programs it starts still see Wayland). Only a Wayland session without Xwayland keeps still slides. A video inside a slide still plays its sound without its picture in the output.
- The LibreOffice slide show is reported ready about a second later, once its editing view has gone, so the first captured frame is the slide.
- The `.deb` also recommends `gstreamer1.0-plugins-good` and `gstreamer1.0-libav`, which LibreOffice needs to play the H.264/AAC videos PowerPoint saves.

## [0.1.11] - 2026-11-18

### Added

- Web decks on Linux can use the PC's own Chrome or Chromium through a helper (`native/web-bridge-linux`), so pages that reject embedded browsers and "Sign in with Google" work there like on Windows. Without one of those browsers (or with `PPT_WEB_BACKEND=electron`) web decks keep using the built-in Electron window; a helper that stops is replaced and, as a last resort, the pages move back to Electron.
- Images can be added as decks (PNG, JPG, WebP, GIF, BMP, AVIF): one image becomes one deck with one slide, converted to PNG on import. Videos may now be MOV or MKV as well as MP4, M4V and WebM; a codec Chromium cannot play is still refused at import with a message.
- Releasing is two builds on two machines and the release is not complete until both are attached: `node scripts/release.mjs --check X.Y.Z` fails and names what is missing until the Windows installer and the Linux AppImage/.deb are on the same tag.

### Fixed

- A key visual (KV) belongs to one event again: creating or switching to another event no longer shows the previous event's KV, and Remove releases the image (the file is deleted, so it can never be reused). Remove also works while the KV is on air — the output falls back to the live slide, or to black at STANDBY.

## [0.1.10] - 2026-11-17

### Fixed

- The mouse pointer no longer shows up inside the page image on HDMI, OMT or in the preview. Windows' window capture paints the pointer into the frame when it is inside the captured window, and Chromium's `cursor` constraint does not stop it (measured). The helper window is now parked outside every display, where the pointer can never be inside it; the capture still delivers live frames from the parked window (verified with an animated page). The deck snapshot now comes from WebView2's own `CapturePreviewAsync`, so it has no pointer or window frame either.

## [0.1.9] - 2026-11-17

### Changed

- The mouse pointer over a preview hides while it rests and comes back as soon as it moves: on the Prepare page image and on the operator's Program monitor, so the picture stays clean while you watch it.

### Fixed

- The desktop window capture now asks for no mouse pointer in the frame (`cursor: 'never'`), so a pointer cannot be baked into the page image on Chromium builds that add one. Measured on Windows with this Electron: neither the live capture nor the deck thumbnail contains the pointer.

## [0.1.8] - 2026-11-17

### Fixed

- A web deck could stay on "Loading" forever and never show anything: the WebView2 page window was owned by a hidden owner window (WinForms `ShowInTaskbar = false`), and Chromium's window capture does not list owned windows, so no frame ever reached the output. The page window is now a normal top-level window (no owner, no tool-window style) with its taskbar button removed, and capture delivers the page at the Canvas size.
- Web decks now write a diagnostic log to `<userData>/web.log` (`[web]` lines: open, navigation, helper status, capture, HOLD). It also names the reasons that used to be silent: a page that stays loading, a loaded page whose window cannot be captured, and Google's "unusual traffic" verification page (the deck shows an error with that explanation instead of an endless Loading chip).
- The helper's page-hang probe no longer reports a slow navigation as a hung page.

## [0.1.7] - 2026-11-17

### Fixed

- "Sign in with Google" in a web deck: the WebView2 page no longer replaces itself with the sign-in target. While the deck is off air the helper opens a real popup in the same profile, so popup-based sign-in can finish and hand the result back to the page; while the deck is on air the page cannot open a window or navigate itself away.
- If the WebView2 browser process exits, the helper now leaves, so the app restarts it and reopens the pages at their last address instead of leaving dead windows behind (Resume web used to resume a black window).
- A web page stuck in JavaScript raises HOLD after about five seconds instead of leaving the output silently frozen.
- A helper that cannot start at all (missing file or DLL, blocked exe) falls back to the built-in browser for the session and shows one notice, instead of leaving every web deck in Error until a restart.
- Stop in the Prepare toolbar works for web pages; a mouse release and the arrow keys from Prepare are sent to the page correctly.
- The helper end-to-end suite runs on Linux and macOS too (fake helper), and the release script always rebuilds the helper so an old exe cannot be shipped under a new version.

### Known

- The page on air also plays on the PC's default device at the Windows volume; muting it there would silence it for the outputs too (measured), so deck level and Mute apply to the output path only.

## [0.1.6] - 2026-11-17

### Added

- Web decks on Windows run in a real WebView2 (Microsoft Edge) page hosted by a small helper, so sites that reject embedded browsers work, including "Sign in with Google" on Canva. Sign-ins live in a profile folder under the app's data folder and survive a restart.
- A web page can have its own sign-in profile (one deck signed in to one account, another deck to another), and "Sign out of all websites" clears the profiles of the open pages.
- If the helper hangs or is killed, the output holds the last good frame (never black), the helper restarts by itself and reopens every page at the address it was on. After three failed restarts the session switches to the built-in browser instead of leaving the output without a page.
- Web page sound keeps the same deck-volume and master rules, now fed from the helper's audio pipe through the outputs' gain.

### Fixed

- A web page that failed to load loads again after Reload (the error state is cleared when the new document starts), in both the built-in browser and the WebView2 helper.

## [0.1.5] - 2026-11-17

### Added

- Video files (MP4, M4V, WebM) can be added to the library directly, from Add files, drag and drop or the New event dialog: one file becomes one deck with one video slide, named after the file.
- A Bridgecast installed from the `.deb` updates itself: Settings > About > "Check for updates" finds a newer version, downloads it in the background and installs it on "Restart and install" or when Bridgecast is closed. The install asks for the administrator password. A `.deb` of 0.1.4 or older has no updater: install this version by hand once.
- Web decks block ads and trackers (Ghostery filter lists, cached in the data folder, best effort: with no network on the first run the pages load unblocked). It only applies to the web deck profile. `PPT_ADBLOCK=0` turns it off.

### Fixed

- A file added as a video is imported as one slide deck with a poster taken from the video; a file Chromium cannot play is refused with a message and leaves no deck behind.
- The app builds again: the Dark-theme About logo uses its tracked SVG instead of a PNG that was never committed.

## [0.1.4] - 2026-11-17

### Added

- New event sets the event's Canvas (the default, a preset, the HDMI display's size or a custom size) and its Outputs (HDMI, OMT, NDI), so the event is ready when it is used. The outputs are switched when the event takes the output, and a switch changed in the Output panel is remembered by that event.

## [0.1.3] - 2026-11-17

### Added

- A middle click on an event tab closes it. The on-air tab still cannot be closed.

### Changed

- The key visual (KV) box is an upload area: drag and drop an image onto it or click to browse, with a preview, Replace and Remove once an image is set.
- Off air moved from the Controls tab to the top bar, left of the Light / Dark switch. It still asks before it takes the show off air.
- Labels, tabs and buttons can no longer be selected by dragging or double-clicking. Text fields, speaker notes and the OMT source name can still be selected.

### Fixed

- After a click on Cut / Fade (or another switch of that kind) the arrow keys take the next or previous slide again, instead of moving inside the switch.

## [0.1.2] - 2026-11-17

### Added

- New event takes decks at once: drop PPTX, PPT or PDF files or a whole folder into the dialog, or pick them with "Choose files" / "Choose folder". They are imported into the event as soon as it is created.

### Changed

- Bridgecast always starts on Home with no event tab open, and the Home button only opens Home.
- Development runs keep their library in a separate `bridgecast-dev` folder, so test decks no longer appear in an installed Bridgecast on the same PC.

## [0.1.1] - 2026-11-17

### Changed

- Updates no longer wait for a click: a newer version downloads by itself while nothing is on air and installs when Bridgecast is closed. Nothing downloads by itself or installs during a show, "Restart and install" still installs at once, and "Skip this version" also works after the download.
- The update chip in the header reopens the update popover after "Later".

### Fixed

- "Restart and install" is refused while the key visual is on air, not only while a slide is shown.
- Holding Space, or Space with Ctrl/Alt, on a focused update button no longer moves the Program.
- "Check for updates" reports a failed check instead of "You're up to date."
- Release notes from GitHub show as plain text instead of HTML tags.
- A background check no longer hides "Try again" after a failed download.
- `npm run release` works on Windows (npm and npx are run through a shell there).

## [0.1.0] - 2026-11-16

### Added

- Bridgecast keeps every deck of an event in one library and shows the live slide ("Program") fullscreen on a second display over HDMI, with LIVE / FROZEN / BLACK / KV / STANDBY states, Cut and Fade, Freeze, key visuals and a clicker-friendly keyboard map.
- Imports .pptx, .ppt and .pdf decks as native PowerPoint slides, vector PDF pages or still images, with speaker notes and a PNG fallback so the audience never sees the desktop or a black frame.
- Adds sections, video slides, web decks, a per-machine canvas size, OMT and NDI network output, per-deck sound, light and dark themes and a first-run tour.
- Auto-update checks for a newer stable release at startup and every six hours, announces it with a header chip, a popover and a Settings > About block, downloads and installs only when the operator asks, refuses to install while something is on air, and can skip a version.
