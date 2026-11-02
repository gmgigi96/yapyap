# 0001. Electron process model and security boundaries

- Status: Accepted
- Date: 2026-10-18

## Context

YapYap loads a remote, third-party web application (WhatsApp Web) that we do
not control, renders its own trusted UI around it, and later hosts third-party
extensions. Each of these has a different trust level, and they must never share
privileges. WhatsApp builds and tests for current Chromium, so the engine must
be a stock, current Chromium with a matching user agent.

## Decision

### Trust zones

| Zone       | Process                                   | Trust                         | Content                                                                                                |
| ---------- | ----------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| Main       | Electron main (Node)                      | Trusted                       | App logic, settings, IPC validation, extension host, capability checker                                |
| App chrome | Renderer, `app://chrome/`                 | Trusted code, untrusted input | Account switcher, settings, dialogs, recovery UI, extension UI rendered from declarative contributions |
| WhatsApp   | One renderer per account                  | Untrusted (remote)            | `https://web.whatsapp.com` plus the WhatsApp adapter preload in an isolated world                      |
| Extension  | One hidden renderer per enabled extension | Untrusted (third party)       | Extension bundle served from `extension://<id>/`                                                       |

### Window composition

One `BaseWindow` holds a chrome `WebContentsView` (sidebar and overlays) and
one `WebContentsView` per account. Only the active account's view is attached;
inactive accounts stay loaded so they keep receiving notifications. Full-window
chrome screens, such as recovery, are chrome views laid over the account view
(`createSecureOverlay`). Each
account uses its own persistent session partition `persist:account-<uuid>`, so
cookies, IndexedDB, service workers and cache never cross accounts.

### Web preferences (all web content, no exceptions)

`sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`,
`nodeIntegrationInWorker: false`, `nodeIntegrationInSubFrames: false`,
`webviewTag: false`, `webSecurity: true`, `allowRunningInsecureContent: false`,
`experimentalFeatures: false`, `enableBlinkFeatures` unset,
`navigateOnDragDrop: false`, `spellcheck` only on WhatsApp views. A single
factory function produces web preferences; a unit test asserts every field,
and an ESLint restriction forbids constructing `BrowserWindow` or
`WebContentsView` elsewhere.

### IPC

- Preloads expose a minimal, typed API with `contextBridge`, one function per
  operation. They never expose `ipcRenderer` itself or any generic
  send/invoke.
- Every IPC handler in main validates the sender frame (its origin and its
  `webContents` role) and validates the payload against a schema before it
  acts. A payload that fails validation is dropped and logged without its
  content.
- The WhatsApp adapter sends only plain data objects (unread count,
  notification fields, active-chat metadata). It never sends DOM nodes or HTML.
  Its probes return flags, never page text. The readers that return text,
  the open chat's latest messages (#100), the unread chats in the chat list
  (#100) and the draft in its composer (#105), run only when an extension
  holding `chat:read-active`, `chat:read-unread-summary` or
  `composer:read-draft` for the account on screen asks. They return as
  many messages as the user allows, or at most 20 unread chats with one
  preview each, checked against a schema, and nothing logs them (C26 and
  C39 in ADR 0008). The unread reader never opens a chat, which would mark
  it read.
  One probe reads the address of the account's own profile photo (#87),
  when the page title changes and at most every 30 minutes once found.
  Until found, it also reads once a minute on its own, at most ten times
  in a row (#381), since the first read often comes before WhatsApp shows
  the photo. The
  main process fetches it only over HTTPS from `*.whatsapp.net`, or from
  WhatsApp's own origin, on the account's session, reads at most 2 MB, and
  keeps only a 64-pixel copy in memory for the sidebar. Nothing stores or
  logs the photo or its address.
  A chat's picture in a notification follows the same rules (ADR 0011).
- WhatsApp's views have one preload, for notifications, whose design is in
  ADR 0011, and screen shares. It also gives the assistant bar's five
  actions and the chat list divider's two to the adapter's isolated world
  only, never to WhatsApp's own. The main process hears the bar only from
  the active account's page (ADR 0013), and the divider only from a
  WhatsApp view of an account, for that account.
- Two pieces of YapYap's interface live inside WhatsApp's page. The
  assistant bar (ADR 0013, C35 in ADR 0008): the adapter renders it from
  its isolated world into a closed shadow root right above the message
  box, writes extension text only as text, acts only on trusted events,
  and puts it back on a timer while it shows, never with observers.
- The chat list divider (#79, C40 in ADR 0008), with the same safeguards.
  The adapter keeps it right after the chat list's column, in a closed
  shadow root, and sets that column's inline `flex` to the account's width,
  kept between 240 pixels and 60% of WhatsApp's width. It is a keyboard
  separator (`role="separator"`, arrows, Home, End, and Enter for
  WhatsApp's own width) and a mouse drag, acting only on trusted events.
  Its bridge sends only `resize`, with whole pixels from 240 to 4,800, and
  `reset`; the main process keeps the width for the account of the view
  that sent it, in `chat-list.json`, and drops anything else. The active
  account's page gets the width when it comes on screen and about once a
  second while the window shows, never through observers, and the render
  reports only whether the divider is on the page.

### Navigation, windows and permissions

- `will-navigate` and `will-redirect` allow the main frame to navigate only
  within the view's home origin. A cancelled click goes through the link
  policy below; a cancelled redirect is simply dropped. Subframes are left to
  the page's own CSP and the sandbox, because WhatsApp plays some link
  previews inline in iframes (ADR 0008, C14). Web contents YapYap did not
  create have no home origin, so none of their main-frame navigations stay.
- `setWindowOpenHandler` denies every request after routing its URL through
  the link policy: `http(s)` URLs open in the default browser, and `mailto:`
  and `tel:` are parsed, validated and re-serialized before
  `shell.openExternal` (phone numbers keep only digits and a leading `+`).
  `whatsapp://send` deep links load the matching WhatsApp Web URL in the
  view. All other schemes are dropped.
- YapYap holds a single-instance lock per profile. Chat links handed over by
  the operating system (a second launch's command line, or macOS
  `open-url`) are the only input taken from outside: `https://wa.me/…` and
  `https://api.whatsapp.com/send` are rewritten as `whatsapp://send` and go
  through the same link policy, keeping only the phone number and text.
  Every other argument is ignored, and links are never logged (#45).
  The one other link YapYap accepts is `yapyap://extensions/install/<id>`,
  which only opens the extension marketplace on that extension (ADR 0014).
- The main process makes two kinds of requests of its own besides update
  checks. One is the signed extension index from `packages.guita.org`, only
  when the user opens the marketplace, follows an install link or checks
  for extension updates (ADR 0014). The other looks for AI models on this
  computer (#456, C37). It runs only when an extension holding
  `local-network` calls `host.localModels.find()` and the user allowed that
  extension to look. It is a `GET /v1/models` to `127.0.0.1` on four fixed
  ports (Ollama's 11434, Alpaca's 11435, LM Studio's 1234 and llama.cpp's
  8080), all at once, each with a 1.5-second timeout and a 256 KiB cap on
  the answer. It uses Node's `fetch`, which keeps no cookies, follows no
  redirect and sends no credentials. Nothing about the answers is logged.
- The exceptions are popups WhatsApp opens for itself: an empty
  `about:blank` popup, which it opens before setting its location, and a
  window on its own origin, such as a call (#67). Either is created hidden
  with the hardened preferences, on the opener's session, and takes the
  opener's zone and home origin, so its own guards treat it like the
  account. A popup that reaches WhatsApp's origin is shown as a window of
  that account; any other first navigation goes through the link policy and
  the popup is destroyed then, or after five seconds if it never navigates.
  An account's windows close, letting their pages unload, when the account's
  page goes away, since WhatsApp's calls do not survive being destroyed.
- `setPermissionRequestHandler` and `setPermissionCheckHandler` use a
  per-zone allowlist, applied to every session. The WhatsApp zone, from its
  own origin only, gets `notifications`, `clipboard-sanitized-write`,
  `fullscreen`, `speaker-selection` (so calls can use the chosen output
  device) and `media`. `media` asks first, naming the account, and the answer
  lasts until the app quits. Its permission check answers yes, since
  Electron reports a refused check as `denied` and WhatsApp then never asks
  (C30); the request still asks. Checks compare origins with
  `isSameOrigin`, as Electron passes them with a trailing slash. Chrome and
  extension zones get nothing, and neither do web contents YapYap did not
  create.
- Downloads from WhatsApp are saved straight into the real downloads folder
  (resolved through symlinks), under a name stripped of path parts,
  characters Windows forbids, reserved device names and leading dots. An
  existing entry, including a planted symlink, is never replaced: the name is
  numbered instead. File names never reach the log (#50).
- The clipboard: WhatsApp can never read it (`clipboard-read` is not on the
  allowlist). Its sanitized write follows Chromium's rule, which allows it
  only while WhatsApp's window is focused, so copying inside WhatsApp works.
  Pasting needs no permission: images and, on Linux, files copied in a file
  manager reach the page as files (#49). YapYap itself writes the clipboard
  only from an explicit Copy button in its own windows.
- `openExternal` permission requests (external-app launches from any frame)
  are always refused to Chromium; their URL goes through the link policy
  instead, so it opens at most once and only for allowed schemes.
- `setDevicePermissionHandler` denies by default (no WebHID, WebUSB or
  WebSerial), and every Web Bluetooth device chooser is cancelled, because
  Electron otherwise picks the first nearby device.
- **Screen sharing** keeps consent explicit while calls work:
  - Electron reports screen capture to the permission handler as a `media`
    request that names no device, whether it comes from `getDisplayMedia` or
    the legacy desktop `getUserMedia`, and the legacy path captures without
    ever reaching `setDisplayMediaRequestHandler`. So the user picks the
    source in the permission step, before anything is granted, and the
    display-media handler only hands over that pick, once (#146).
  - It is accepted only from a WhatsApp frame (an account view or that
    account's call window) on its own origin whose window is visible and
    focused. Requests from hidden accounts, chrome or extensions are rejected.
  - While a share runs, the tray and the account's sidebar entry show it,
    with a Stop action, until it ends, however it ends (#161, ADR 0011).
  - The source is always chosen by the user, never preselected. On macOS 15+
    this uses the system picker (`useSystemPicker: true`), and the request is
    granted for the OS picker to handle. On Linux Wayland it uses the
    xdg-desktop-portal ScreenCast picker over PipeWire, which also guards the
    legacy path. On Windows, X11 and older macOS it uses YapYap's own
    accessible picker, a modal chrome window built from
    `desktopCapturer.getSources` with screen and window thumbnails. Its IPC
    answers only the picker window of the pending request, and only with a
    source it offered.
  - System audio (`loopback`) is offered on Windows only, as an explicit,
    unchecked checkbox in the picker.
  - Cancelling or closing the picker rejects the request cleanly, so WhatsApp
    sees a normal "permission denied". While sharing, the tray and the
    account's sidebar entry show a persistent "sharing" indicator with a stop
    action (#161).
  - We do not require a page user gesture, because WhatsApp can request
    capture asynchronously inside a call. The picker choice is the consent.
- A `web-contents-created` hook attaches all of the above to every new
  `webContents`, including ones we did not create ourselves.

### Content Security Policy

- App chrome: `default-src 'none'; script-src 'self'; style-src 'self';
img-src 'self' data:; font-src 'self'; connect-src 'none';
frame-ancestors 'none'; base-uri 'none'; form-action 'none'`, served
  from a custom `app://` protocol, not `file://`.
- Extensions: `default-src 'none'; script-src 'self'`, plus `style-src 'self'`
  and `img-src 'self' data:` for panels. See [ADR 0004](0004-extension-isolation-and-trust-model.md).
- WhatsApp keeps its own CSP. We do not weaken it.

### User agent

`app.userAgentFallback` and every session use Chrome's reduced desktop UA for
the bundled `process.versions.chrome` (`Chrome/<major>.0.0.0`, with Chrome's
frozen OS token per platform), with no `Electron/` or `YapYap/` tokens. The
`sec-ch-ua` and `sec-ch-ua-full-version-list` request headers gain the
`"Google Chrome"` brand. Without this, WhatsApp may show its "unsupported
browser" page. `navigator.userAgentData.brands` in the page still lists only
Chromium, because rewriting it would mean running code in WhatsApp's main
world, which this ADR rules out.

### Custom CSS and JS

User CSS is applied with `webContents.insertCSS`. User JS runs only through
`webContents.executeJavaScriptInIsolatedWorld` in its own world
(`CUSTOM_CODE_WORLD_ID`, apart from the adapter's), never in the main world,
and each snippet runs in a function and a call of its own, so one that fails
stops nothing else. The feature is labelled "Advanced", warns that the code
can read chats, and stays off until the user enables it. The code lives in
`custom-code.json`, not in settings, so an imported settings file can never
bring code that runs in WhatsApp, and logs only ever say that a script
failed, never what it holds.

### Electron fuses (applied at package time with `@electron/fuses`)

`RunAsNode: off`, `EnableCookieEncryption: on`,
`EnableNodeOptionsEnvironmentVariable: off`,
`EnableNodeCliInspectArguments: off`,
`EnableEmbeddedAsarIntegrityValidation: on`, `OnlyLoadAppFromAsar: on`,
`LoadBrowserProcessSpecificV8Snapshot: off`,
`GrantFileProtocolExtraPrivileges: off`. A packaging test reads the fuses
back from every build and asserts them.

### Electron security checklist compliance

| #   | Checklist item                                         | How YapYap complies                                                                                 |
| --- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| 1   | Only load secure content                               | WhatsApp is HTTPS. Chrome and extensions use custom privileged protocols. Mixed content is blocked. |
| 2   | No Node.js integration for remote content              | `nodeIntegration: false` everywhere                                                                 |
| 3   | Context isolation                                      | `contextIsolation: true` everywhere                                                                 |
| 4   | Process sandboxing                                     | `sandbox: true` everywhere, plus `app.enableSandbox()`; never starts with `--no-sandbox` (#134)     |
| 5   | Permission request handler                             | Per-zone allowlists, see above                                                                      |
| 6   | Do not disable `webSecurity`                           | Never set                                                                                           |
| 7   | Define a CSP                                           | Chrome and extension CSPs set as response headers                                                   |
| 8   | Do not enable `allowRunningInsecureContent`            | Never set                                                                                           |
| 9   | Do not enable experimental features                    | Never set                                                                                           |
| 10  | Do not use `enableBlinkFeatures`                       | Never set                                                                                           |
| 11  | `<webview>`: do not use `allowpopups`                  | `webviewTag: false`; `<webview>` is not used                                                        |
| 12  | Verify WebView options before creation                 | `will-attach-webview` always prevented                                                              |
| 13  | Disable or limit navigation                            | Navigation guards, see above                                                                        |
| 14  | Disable or limit creation of new windows               | `setWindowOpenHandler` denies                                                                       |
| 15  | Do not use `shell.openExternal` with untrusted content | Scheme allowlist, URL re-serialization, `http(s)`, `mailto` and `tel` only                          |
| 16  | Use a current version of Electron                      | Latest stable, kept current by Dependabot, nightly beta run                                         |
| 17  | Validate the `sender` of all IPC messages              | Sender frame origin and role checked in every handler                                               |
| 18  | Avoid the `file://` protocol                           | `app://` and `extension://` custom protocols                                                        |
| 19  | Check which fuses you can change                       | Fuses table above, asserted in CI                                                                   |
| 20  | Do not expose Electron APIs to untrusted web content   | Minimal typed bridges only                                                                          |

## Consequences

- Each account costs one renderer process. Idle memory per account becomes a
  tracked budget (M2).
- WhatsApp-specific DOM knowledge lives only in the adapter module (see
  [ADR 0005](0005-test-strategy.md) for how it is tested). A WhatsApp UI change
  becomes a one-file fix.
- Some conveniences are lost by design: no `<webview>`, no remote modules, no
  Node in any renderer.

## Amendments

- 2026-11-01 (ADR 0017): two new parts. The AI assistant's requests leave
  from the main process, through an in-memory session of its own,
  `yapyap-assistant`, whose `fetch` and `webRequest` guard allow only
  the providers, Hugging Face and the one model server on this computer
  the user chose. The private model runs in a hidden engine window, made
  with `createSecureWindow` on the in-memory `yapyap-engine` partition,
  on `app://engine`, with its own CSP (WebAssembly and `blob:` workers,
  `connect-src 'self'`), COOP and COEP, and a preload with two fixed
  channels whose events the main process checks for sender, origin and
  shape. It is registered as a chrome view of its own origin, so it may
  not navigate away nor call the chrome API. The `app` scheme gained
  `supportFetchAPI` for it; chrome pages still allow no `connect-src`.
  The `extension` scheme lost it.

## Never without the sandbox

YapYap refuses to start when Chromium's sandbox is turned off, by
`--no-sandbox` or `ELECTRON_DISABLE_SANDBOX`. It explains why in a dialog and
quits, before any session or window exists. electron-builder's AppImage
launcher adds `--no-sandbox` on its own when user namespaces are
unavailable, and Playwright adds it to every Electron it launches, so both
would otherwise run YapYap unsandboxed without anyone noticing. E2E tests
launch with `chromiumSandbox: true` (#134).
