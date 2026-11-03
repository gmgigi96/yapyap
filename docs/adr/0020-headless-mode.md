# 0020. Headless mode

- Status: Accepted
- Date: 2026-11-03

## Context

The MCP server (ADR 0019) lets scripts and AI agents reach WhatsApp through
YapYap, but YapYap needs a desktop to run: a window, a tray, dialogs, and on
Linux an X11 or Wayland display. People want to run it where there is none,
such as on a home server or in a container, and drive it from scripts (#587).

WhatsApp Web needs a real Chromium page, so a YapYap without Electron is not
possible. Chromium can, however, run with no display at all. A probe on
Electron 45 found, with `DISPLAY` and `WAYLAND_DISPLAY` unset:

- `--ozone-platform=headless --disable-gpu` starts with no error, the
  sandbox on, and loads WhatsApp Web in a hidden window.
- Without `--disable-gpu`, the GPU process looks for an X display and quits;
  SwiftShader works too, but needs `--enable-unsafe-swiftshader`.
- Chromium takes that backend only from its real command line. On Ubuntu
  it picks its display before the app's code runs, so a switch appended
  with `app.commandLine.appendSwitch` comes too late: Chromium looks for
  X11 and crashes or quits. Passed on the command line, it starts every
  time; `--disable-gpu` can still be appended.
- `capturePage` gives no picture under this backend: a hidden window
  captures as 1×1, and a shown one never answers.
- WhatsApp draws its login QR code on a `<canvas>` inside the `loginCode`
  landmark, whose pixels `getImageData` reads from the adapter's world.

An account must be linked by scanning that code with the phone, and without
a screen the only place to show it is the terminal that started YapYap.

## Decision

### 1. Starting headless

`yapyap --headless` starts YapYap with no window on screen. Everything else
is the same app: the same profile, accounts, settings, single-instance lock
and security settings (ADR 0001). The sandbox is still required.

- **Display.** On Linux with no display server, the user starts
  `yapyap --headless --ozone-platform=headless`, since only the command line
  can choose that backend, and YapYap adds `--disable-gpu` to it. It needs
  no X11, Wayland or GPU. Unsafe SwiftShader is never turned on. Given
  `--headless` with neither that backend nor `DISPLAY` or `WAYLAND_DISPLAY`,
  YapYap says how to start it and exits with status 1 before Chromium looks
  for a display. With a display, and on macOS and Windows, YapYap uses the
  usual display and simply never shows the main window.
- **Nothing on screen.** The main window opens hidden and stays hidden, as
  with **Start minimized**. There is no tray, welcome, update check or crash
  review: each would show a window or dialog nobody can answer. Updates
  come from whatever installed YapYap.
- **The MCP server is on** for the whole run, whatever Settings › Agents
  says, and the setting is not changed. Once it listens, the terminal shows
  its address. Ctrl+C, `SIGTERM` or a system shutdown quits YapYap, which
  closes it; nothing else stops it.
- **One YapYap per profile.** A headless launch while YapYap already runs
  on the same profile hands over to it and quits, as any second launch
  does. `--user-data-dir` gives a headless YapYap its own profile.

### 2. Linking an account

While an account is logged out, YapYap shows WhatsApp's QR code in the
terminal, and the user scans it from **Linked devices** on their phone.

- **Reading the code.** An adapter probe (`adapter/login-code.ts`) reads the
  canvas inside the `loginCode` landmark, finds its module size from the
  top-left finder pattern, and returns the code as rows of dark and light
  modules. It returns no text and no picture. The main process checks the
  result is a QR code's shape (21 to 177 modules a side, in steps of 4)
  before anything uses it.
- **Showing it.** The terminal shows the code with Unicode half blocks,
  two modules a character, black on white with a quiet zone, whatever the
  terminal's colors. YapYap looks every 2 seconds while the account is
  logged out, shows the code again each time WhatsApp changes it, and says
  so once the account is linked. With several accounts, each code is headed
  by its account's name.
- **Only a terminal sees it.** The code goes to standard output only when
  it is a terminal. Piped or redirected, as under a service manager,
  YapYap shows no code and says to start it from a terminal to link. The
  code is never logged. Scanning it links the scanner's WhatsApp to this
  YapYap, so it is treated like a secret even though it is valid for only
  about 20 seconds.
- **No other way.** We do not read WhatsApp's pairing string from the
  `data-ref` attribute and encode it ourselves: that would bring in a QR
  encoder, and would break when WhatsApp's markup changes just as the
  canvas reading would.

### 3. Terminal text

What headless mode writes to the terminal is UI text, in `en.json` under
`headless` (ADR 0012). Log lines still go to standard error and the log
file, as before.

### Out of scope

Creating, narrowing and revoking agent tokens from the terminal, and a
command-line client for the MCP server: each is a later change. Until then
tokens are created in Settings › Agents, and scripts call the server over
HTTP like any MCP client. Headless mode adds no new tool, scope or
listener: the server, its tokens and its checks are the ones of ADR 0019.

## Consequences

- YapYap runs on Linux machines with no display, and agents and scripts
  reach it through the MCP server alone.
- An adapter probe returns more than flags for the first time: the login
  code's modules (C48 in ADR 0008). It stays a probe of the logged-out page,
  which holds no chats.
- The MCP server runs without the Settings toggle or the tray's **Stop AI
  Agents**: quitting is the only way to stop it during a headless run. It
  still only answers holders of a valid token (ADR 0019, §3).
- Until tokens can be created from the terminal, the first token is created
  in a desktop session on the same profile.
- New code tested to 100%: the switches, the probe against fixtures, the
  terminal rendering and its checks, and an E2E test that starts YapYap
  headless and finds no window shown.
