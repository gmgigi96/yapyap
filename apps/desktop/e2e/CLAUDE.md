# End-to-end tests: notes for agents and contributors

These add to the repository's root `CLAUDE.md`, which applies here too.

- E2E tests start the app through `launchApp` in `e2e/fixtures.ts`, which
  gives each test a throwaway `--user-data-dir`. Never launch Electron in a
  spec without it, or tests write to the developer's real profile.
- Playwright's Electron launcher emulates a light color scheme unless told
  otherwise; `launchApp` passes `colorScheme: null` so tests see YapYap's
  real theme. Visual baselines are per OS and come from CI artifacts (see
  CONTRIBUTING), never from a local run.
- On a Linux desktop, run E2E tests under `dbus-run-session` as well as
  `xvfb-run`: Xvfb hides the windows, but tray icons and notifications go
  through the session bus and would appear on the developer's desktop.
- E2E runs drop `WAYLAND_DISPLAY` and set `XDG_SESSION_TYPE=x11` so local
  runs use the virtual X11 display like CI; Chromium otherwise reaches a
  desktop's Wayland compositor through its default socket.
  `YAPYAP_E2E_WAYLAND_DISPLAY` passes a compositor socket through instead;
  CI runs `display.spec.ts` that way on a headless Weston. Under it no
  window manager focuses windows, so tests that need a focused window focus
  it and poll `isFocused()`.
- WhatsApp runs in an account view inside the main window, a `BaseWindow`
  with no page of its own, so no renderer runs for it (ADR 0009). In E2E
  tests, get its page with `whatsAppPage(app)` from `e2e/fixtures.ts` and
  its web contents with `webContents.getAllWebContents()` by URL;
  `BrowserWindow.fromWebContents` gives its window. `BrowserWindow.getAllWindows()`
  leaves the main window out; `BaseWindow.getAllWindows()` has it, in no
  stable order once a chrome window is open, so never pick a window by index.
- YapYap refuses to start with `--no-sandbox` or `ELECTRON_DISABLE_SANDBOX`.
  Playwright passes `--no-sandbox` to Electron unless `chromiumSandbox: true`
  is set, which `launchApp` does. Linux runs need unprivileged user
  namespaces for the sandbox: CI lifts Ubuntu's restriction, and VS Code's
  AppArmor profile grants them to terminals inside it.
- SonarQube Cloud runs every rule as it ships (ADR 0010), so a test that
  means nothing on some systems gets a tag (`@linux`,
  `@not-macos`, `@not-windows`) or its file goes in `playwright.config.ts`'s
  lists, never a conditional `test.skip`; and checks that retry use
  `expect(...).toPass()` or a web-first assertion, never `expect.poll`.
- E2E tests give the assistant's private model a tiny model through
  `YAPYAP_TEST_BUILT_IN_MODEL`, and fake model servers through
  `YAPYAP_TEST_MODEL_PORTS`; a packaged build ignores both.
- Packaged builds disable the Node inspector fuse, so Playwright's Electron
  launcher cannot drive them. The smoke test connects over CDP through the
  `DevToolsActivePort` file in the profile directory instead.
