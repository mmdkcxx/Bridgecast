# Background Clicker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PageDown/PageUp from a presentation clicker run Next/Prev while no Bridgecast window has focus, behind a Settings switch that is off by default.

**Architecture:** A pure `BackgroundClicker` class in main owns the register/unregister rules over an injected shortcut port (Electron `globalShortcut` in the app, a fake in tests). Main feeds it the saved setting and app focus, and forwards each press as a broadcast to the operator window only. The renderer runs the same guards as its `keydown` handler and dispatches `next`/`prev`, so every existing rule (auto advance, sections, frozen, web ready gate) still applies.

**Tech Stack:** Electron 45 (`globalShortcut`, `app` `browser-window-focus`/`browser-window-blur`), React, TypeScript, Vitest (node environment, no jsdom).

**Spec:** `docs/superpowers/specs/2026-11-26-background-clicker-design.md`

## Global Constraints

- Keys: only `PageDown` (= `next`) and `PageUp` (= `prev`). No arrows, Space, `.`, F, K, B, N, D.
- Active only when the setting is on **and** no Bridgecast window is focused (`BrowserWindow.getFocusedWindow() === null`).
- Setting `clickerBackground: boolean`, default `false`, stored in `settings.json`, applies at once (no restart).
- A failed registration never throws; it is logged once per key with `console.warn('[clicker] ...')`.
- User-facing copy is English. Prettier: no semicolons, single quotes, width 100. Do not add lint errors (8 known ones exist).
- Do not touch the dark palette, keyboard map in `keyToAction`, or output/Prepare window behavior.
- Commits: `git -c user.name="Gerson Sebastian" -c user.email="sebastiangerson24@gmail.com" commit ...`, stage only this plan's files.

## Review Focus

1. Focus moves between two Bridgecast windows (operator -> Prepare): the blur fires before the focus. The focus check is deferred one tick so the shortcuts are not registered in between (Task 3 wiring; Task 1 test "repeated focus changes register once").
2. A clicker press from the background while the operator window shows Home, the first-run tour, or Interact on the monitor: nothing happens, same as a keydown (Task 4 shares one guard function).
3. Another app already owns PageDown, or Linux Wayland: `register` returns false. No crash, one warning per key, the other key still works (Task 1 test "failed register").
4. The operator turns the switch off while Bridgecast is in the background (from a second Bridgecast window): both keys are released at once so other apps get PageDown back (Task 1 test "disable while unfocused").
5. Quit while the keys are registered: they are released in `will-quit` (Task 3).

---

### Task 1: `BackgroundClicker` rules (pure module)

**Files:**
- Create: `src/main/background-clicker.ts`
- Modify: `src/shared/types.ts` (append `ClickerDirection`)
- Test: `src/main/background-clicker.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // src/shared/types.ts (append): shared by main, ipc.ts and the renderer
  export type ClickerDirection = 'next' | 'prev'
  // src/main/background-clicker.ts
  export type { ClickerDirection } from '../shared/types'
  export const CLICKER_KEYS: Readonly<Record<'PageDown' | 'PageUp', ClickerDirection>>
  export interface ShortcutPort {
    register(accelerator: string, callback: () => void): boolean
    unregister(accelerator: string): void
  }
  export class BackgroundClicker {
    constructor(port: ShortcutPort, onPress: (d: ClickerDirection) => void, warn?: (msg: string) => void)
    setEnabled(on: boolean): void
    setAppFocused(focused: boolean): void
    /** Accelerators registered right now (for tests and logs). */
    registered(): string[]
    /** Releases every key; later calls to setEnabled/setAppFocused do nothing. */
    dispose(): void
  }
  ```
- Initial state: `enabled = false`, `appFocused = true`. Desired = `enabled && !appFocused && !disposed`. Each setter recomputes and registers/unregisters only on a change. Only keys whose `register` returned `true` are later unregistered. `warn` defaults to `console.warn`; each accelerator warns at most once for the object's lifetime: `[clicker] could not register ${accel} while Bridgecast is in the background`.

- [ ] **Step 1: Write the failing tests** with a fake port (`{ register: vi.fn(() => true), unregister: vi.fn() }` storing callbacks in a `Map`):
  - `off by default`: new instance, `setAppFocused(false)` -> `registered()` is `[]`, `register` not called.
  - `registers PageDown and PageUp when enabled and unfocused`: `setEnabled(true)`, `setAppFocused(false)` -> `registered()` equals `['PageDown', 'PageUp']`; calling the stored PageDown callback calls `onPress('next')`, PageUp -> `onPress('prev')`.
  - `releases on focus`: then `setAppFocused(true)` -> `unregister` called with `'PageDown'` and `'PageUp'`, `registered()` is `[]`.
  - `disable while unfocused releases`: enabled+unfocused, then `setEnabled(false)` -> both unregistered.
  - `repeated focus changes register once`: `setAppFocused(false)` twice -> `register` called exactly 2 times total (once per key).
  - `failed register`: `register` returns false for `'PageDown'` only -> `registered()` is `['PageUp']`, `warn` called once; focus true -> `unregister` called only with `'PageUp'`; unfocus again -> `warn` still called once in total.
  - `dispose releases and stays off`: enabled+unfocused, `dispose()` -> both unregistered; `setAppFocused(true)`, `setAppFocused(false)` -> no new `register` calls.

- [ ] **Step 2: Run** `npx vitest run src/main/background-clicker.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `src/main/background-clicker.ts` per Interfaces. No Electron import in this file.
- [ ] **Step 4: Run** the same command. Expected: PASS (7 tests).
- [ ] **Step 5: Commit** `feat(clicker): rules for background PageDown/PageUp`.

### Task 2: Setting `clickerBackground`

**Files:**
- Modify: `src/shared/settings.ts` (add `DEFAULT_CLICKER_BACKGROUND = false`, `sanitizeClickerBackground(raw: unknown): boolean`, field `clickerBackground: boolean` in `Settings` with a doc comment, and in `sanitizeSettings`)
- Modify: `src/main/settings.ts` (`DEFAULT_SETTINGS.clickerBackground`)
- Modify: `src/main/index.ts` `SettingsStore` (add `saveClickerBackground(clickerBackground: boolean): Settings`)
- Test: `src/main/settings.test.ts`

**Interfaces:**
- Produces: `Settings.clickerBackground: boolean`, `SettingsStore.saveClickerBackground(on: boolean): Settings`.

- [ ] **Step 1: Write the failing test** in `settings.test.ts`: `loadSettings` of a missing file gives `clickerBackground === false`; a file with `"clickerBackground": true` gives `true`; `"clickerBackground": "yes"` gives `false`.
- [ ] **Step 2: Run** `npx vitest run src/main/settings.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the four additions above, following `webChrome`.
- [ ] **Step 4: Run** `npx vitest run src/main/settings.test.ts` and `npm run typecheck`. Expected: PASS (fix any other `Settings` literal the typecheck reports, e.g. test fixtures).
- [ ] **Step 5: Commit** `feat(clicker): clickerBackground setting`.

### Task 3: IPC and main wiring

**Files:**
- Modify: `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/index.ts`

**Interfaces:**
- Consumes: Task 1 `BackgroundClicker`, `ClickerDirection`; Task 2 `saveClickerBackground`.
- Produces:
  - `Invoke.clickerSetBackground: 'clicker:setBackground'`, map entry `{ args: [on: boolean]; result: Settings }`.
  - `Broadcast.clickerPress: 'clicker:press'`, `BroadcastMap['clicker:press']: ClickerDirection` (type imported from `./types`).
  - `Api.setClickerBackground(on: boolean): Promise<Settings>`, `Api.onClickerPress(cb: (d: ClickerDirection) => void): () => void`.

- [ ] **Step 1: Add** the channel, broadcast and Api entries; preload uses `invoke(Invoke.clickerSetBackground, on)` and `subscribe(Broadcast.clickerPress, cb)`.
- [ ] **Step 2: Wire main** in `app.whenReady` after `settings` and the operator window exist:
  - `const clicker = new BackgroundClicker({ register: (a, cb) => globalShortcut.register(a, cb), unregister: (a) => globalShortcut.unregister(a) }, (d) => broadcastToOperator(Broadcast.clickerPress, d))`
  - `clicker.setEnabled(settings.get().clickerBackground)`; `clicker.setAppFocused(BrowserWindow.getFocusedWindow() !== null)`.
  - `app.on('browser-window-focus', () => clicker.setAppFocused(true))`; `app.on('browser-window-blur', () => setImmediate(() => clicker.setAppFocused(BrowserWindow.getFocusedWindow() !== null)))`.
  - `app.on('will-quit', () => clicker.dispose())`.
  - `handle(Invoke.clickerSetBackground, (on) => { if (typeof on !== 'boolean') throw new Error('Clicker setting must be on or off'); const s = settings.saveClickerBackground(on); clicker.setEnabled(on); return s })`.
- [ ] **Step 3: Run** `npm run typecheck` and `npm test`. Expected: PASS.
- [ ] **Step 4: Commit** `feat(clicker): forward background PageDown/PageUp to the operator window`.

### Task 4: Renderer: guard, dispatch and Settings switch

**Files:**
- Modify: `src/renderer/src/App.tsx` (keyboard effect near line 366)
- Create: `src/renderer/src/components/ClickerSection.tsx`
- Modify: `src/renderer/src/components/SettingsDialog.tsx` (render `<ClickerSection />` right before `<WebChromeSection />`)

**Interfaces:**
- Consumes: Task 3 `window.api.onClickerPress`, `window.api.setClickerBackground`, `window.api.getSettings`.

- [ ] **Step 1: App.tsx**: extract the three pauses into `const consoleKeysPaused = (): boolean => viewRef.current === 'home' || tourRef.current || keysClaimed()` inside the same effect; `onKey` uses it (behavior unchanged). In the same effect subscribe `const off = window.api.onClickerPress((d) => { if (!consoleKeysPaused()) dispatch({ type: d }) })` and call `off()` in the cleanup.
- [ ] **Step 2: ClickerSection.tsx**: same structure and classes as `WebChromeSection` (`set-section`, `set-row`, `Switch`, `hint`, error with `role="alert"`), always shown. Loads `getSettings().clickerBackground`; switch calls `setClickerBackground(on)` and shows the returned value. Ids/test ids: section `aria-labelledby="set-clicker"`, `data-testid="settings-clicker"`, switch `id="clicker-background"`, `testId="settings-clicker-background"`. Exact copy:
  - Heading: `Clicker in the background`
  - Hint: `PageDown and PageUp move the live slide even when another app is in front, so a speaker's clicker keeps working while you reply to a message or prepare files. These two keys then move slides from every keyboard on this PC and stop working in other apps. Clickers that send arrow keys only work while Bridgecast is in front.`
- [ ] **Step 3: Run** `npm run typecheck`, `npm test`, `npm run lint` (no new errors). Expected: PASS.
- [ ] **Step 4: Run** `npm run test:e2e:settings` (the dialog still opens and other switches still work). Expected: PASS.
- [ ] **Step 5: Commit** `feat(clicker): Settings switch and background Next/Prev in the console`.

### Task 5: Docs and field check

**Files:**
- Modify: `PRODUCT.md` (clicker behavior line), `CHANGELOG.md` (Unreleased: Added), `docs/test-checklist.md` (new items under the clicker items, Indonesian like the rest)

- [ ] **Step 1: Write** the docs. Checklist items: (a) setting off: focus Notepad, clicker does nothing to Bridgecast; (b) on: focus Notepad/WhatsApp, PageDown/PageUp move the live slide, auto advance and sections still stop the clicker; (c) on, Bridgecast in front: one press = one slide (no double); (d) on, Prepare window in front: behaves as before; (e) on, operator on Home: nothing moves; (f) switch off: PageDown scrolls Notepad again; (g) quit Bridgecast: PageDown works everywhere.
- [ ] **Step 2: Commit** `docs(clicker): background clicker behavior and field checks`.
