# Security review

Reviewed on 2026-10-25 (#112), against
[Electron's security checklist](https://www.electronjs.org/docs/latest/tutorial/security),
and brought up to date on 2026-11-02, when YapYap dropped extensions
([ADR 0018](/adr/0018-no-extensions)).
Each answer names the code that enforces it and the tests that prove it.
Repeat the review before each release that changes a trust boundary.

## Electron's checklist

| #   | Item                                     | Status | How YapYap meets it                                                                                                                                                                                                         |
| --- | ---------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Only load secure content                 | Met    | WhatsApp loads from `https://web.whatsapp.com` (`app/whatsapp-origin.ts`); YapYap's pages and the private model's engine from `app://`. The test-only origin override takes loopback only (ADR 0008, C2).                   |
| 2   | No Node.js integration for remote pages  | Met    | `nodeIntegration`, in workers and subframes too, is off in `rendererPreferences`; `e2e/launch.spec.ts` checks WhatsApp has no `require` or `process`.                                                                       |
| 3   | Context isolation                        | Met    | On for every renderer; preloads expose only typed `contextBridge` APIs.                                                                                                                                                     |
| 4   | Process sandboxing                       | Met    | `sandbox: true` everywhere and `app.enableSandbox()`; YapYap refuses to start unsandboxed (`security/sandbox-check.ts`). `e2e/launch.spec.ts` and the packaged smoke test check every renderer.                             |
| 5   | Handle permission requests               | Met    | Deny by default; WhatsApp's own origin gets an allowlist, screen capture needs a user pick (`permissions/`, ADR 0001, 0008 C6 and C15). Tested in `permission-policy.test.ts`, `session-guard.test.ts` and E2E.             |
| 6   | Keep `webSecurity`                       | Met    | `createSecureWindow` applies the hardened preferences last, and lint forbids creating windows anywhere else; `windows.test.ts` shows smuggled preferences are ignored.                                                      |
| 7   | Content Security Policy                  | Met    | Strict CSP headers on `app://chrome` (`chrome/assets.ts`) and `app://engine` (`assistant/private/engine-files.ts`). WhatsApp keeps its own.                                                                                 |
| 8   | No `allowRunningInsecureContent`         | Met    | Off in `rendererPreferences`.                                                                                                                                                                                               |
| 9   | No experimental features                 | Met    | Off in `rendererPreferences`.                                                                                                                                                                                               |
| 10  | No `enableBlinkFeatures`                 | Met    | Never set; `RendererOptions` only takes a preload, a partition and spell checking.                                                                                                                                          |
| 11  | `<webview>` `allowpopups`                | N/A    | `webviewTag` is off and every `will-attach-webview` is refused (`security/web-contents-guards.ts`).                                                                                                                         |
| 12  | `<webview>` options                      | N/A    | As above.                                                                                                                                                                                                                   |
| 13  | Limit navigation                         | Met    | The main frame stays on its home origin; other links go through the link policy, and redirects off the origin are stopped (`navigation/`). Subframes are left to WhatsApp's CSP and the sandbox, by design (ADR 0008, C14). |
| 14  | Limit new windows                        | Met    | `setWindowOpenHandler` on every web contents: WhatsApp opens only its own-origin call windows (ADR 0008, C21), and everything else goes through the link policy.                                                            |
| 15  | `shell.openExternal` with untrusted URLs | Met    | Untrusted links pass `classifyLink`, which allows only `http(s)`, a checked `mailto:` and a digits-only `tel:`; every other call builds its URL from a constant.                                                            |
| 16  | Current Electron                         | Met    | Pinned to the latest stable release; Renovate proposes updates weekly.                                                                                                                                                      |
| 17  | Validate IPC senders                     | Met    | Every chrome handler checks the sender's zone, frame origin and payload (`ipc/chrome.ts`); every message from WhatsApp's preload checks the account, origin and payload (`ipc/whatsapp.ts`).                                |
| 18  | Custom protocols, not `file://`          | Met    | `app://`, refusing paths outside its folder; the file-protocol fuse is off.                                                                                                                                                 |
| 19  | Fuses                                    | Met    | `RunAsNode`, `NODE_OPTIONS` and the inspector are off; cookie encryption, ASAR integrity and ASAR-only loading are on. `verify-fuses.ts` checks every package in CI.                                                        |
| 20  | No Electron APIs for web content         | Met    | Bridges wrap fixed channels and never pass the IPC event.                                                                                                                                                                   |

## Findings

| #   | Finding                                                                                                 | Disposition                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | The screen-share "ended" message skipped the sender check that "started" makes.                         | Fixed: both now hear only WhatsApp's own page of an account (`capture/shares.ts`).                         |
| 2   | The extension CSP lacked `base-uri`, `form-action` and `frame-ancestors`, which YapYap's own pages set. | Gone: YapYap has no extensions (ADR 0018).                                                                 |
| 3   | Packaged builds honour `YAPYAP_TEST_WHATSAPP_ORIGIN`.                                                   | Accepted: loopback HTTP only, logged when used, and environment variables are trusted (C2).                |
| 4   | Subframes may navigate anywhere.                                                                        | Accepted: WhatsApp plays link previews in third-party iframes; the sandbox and its CSP confine them (C14). |
| 5   | With `composer:insert-draft`, an extension may replace the user's draft, not only add to it.            | Gone: YapYap has no extensions (ADR 0018).                                                                 |
