# YapYap: agent and contributor guide

YapYap is an MIT-licensed, unofficial desktop client for WhatsApp Web on Linux,
Windows and macOS. It wraps `https://web.whatsapp.com` in a hardened Electron
shell, so WhatsApp runs on the stock Chromium it is built for. It adds isolated
multi-account sessions, native notifications, a tray, and recovery tools. Its
main feature is a built-in AI writing assistant, with a private model on the
user's computer or the provider they choose (ADR 0017). AI agents can
connect to it over MCP, when the user allows it (ADR 0019). It has no
extension system (ADR 0018), no telemetry, and it is not affiliated with
WhatsApp or Meta.

Start every session by reading this file, `docs/progress.md`, and the ADRs
under `docs/adr/`.

## Commands

Use pnpm (version pinned in `package.json`) on Node.js 26 LTS.

| Task                              | Command                                                                                             |
| --------------------------------- | --------------------------------------------------------------------------------------------------- |
| Install                           | `pnpm install` (CI: `pnpm install --frozen-lockfile`)                                               |
| Run the app (hot reload)          | `pnpm dev`                                                                                          |
| Build all packages                | `pnpm build`                                                                                        |
| Lint (ESLint + Prettier + knip)   | `pnpm lint`                                                                                         |
| Format                            | `pnpm format`                                                                                       |
| Typecheck                         | `pnpm typecheck`                                                                                    |
| Unit + integration tests          | `pnpm test`                                                                                         |
| Coverage (100% gate)              | `pnpm test:coverage`                                                                                |
| E2E tests                         | `dbus-run-session -- xvfb-run -a pnpm test:e2e` on Linux, else `pnpm test:e2e`                      |
| Mutation tests (≥ 90%)            | `pnpm test:mutation` (PR CI mutates changed in-scope files only)                                    |
| Performance benchmark             | `xvfb-run -a pnpm test:bench` (nightly; budgets in `apps/desktop/e2e/bench/`, ADR 0009)             |
| Website screenshots (Linux)       | `dbus-run-session -- xvfb-run -a -s "-screen 0 3840x2400x24" pnpm screenshots`                      |
| Commit messages                   | `pnpm commitlint`                                                                                   |
| Regenerate the message types      | `node scripts/src/bin/i18n-types.ts` (after changing `locales/en.json`)                             |
| Check translation catalogs        | `node scripts/src/bin/check-catalogs.ts` (part of `pnpm lint`)                                      |
| Check chrome CSS is logical       | `node scripts/src/bin/check-logical-css.ts` (part of `pnpm lint`; no physical left/right, ADR 0012) |
| Validate the Renovate config      | Run the `docker run` command of the `renovate` job in `.github/workflows/ci.yml`                    |
| License compatibility             | `pnpm check:licenses`                                                                               |
| Vulnerability audit               | `pnpm audit --audit-level high`                                                                     |
| Docs site (dev / build)           | `pnpm docs:dev` / `pnpm docs:build`                                                                 |
| Package installers for this OS    | `pnpm package` (output in `apps/desktop/release/`)                                                  |
| Smoke-test an installed package   | `YAPYAP_PACKAGED_EXECUTABLE=<path> pnpm test:smoke`                                                 |
| Verify hardened fuses             | `node scripts/src/bin/verify-fuses.ts <executable or .app>`                                         |
| AUR PKGBUILD and .SRCINFO         | `node scripts/src/bin/aur.ts <version> <amd64 .deb> <arm64 .deb> <output dir>`                      |
| Homebrew, winget, Scoop manifests | `node scripts/src/bin/distribution.ts <version> <SHA256SUMS> <output dir>`                          |
| Check those manifests             | `bash packaging/distribution/test.sh` (needs podman or docker; runs `brew style` and `brew audit`)  |
| Test the apt/dnf/pacman repos     | `bash packaging/repository/test.sh` (needs podman or docker)                                        |
| Flatpak bundle (Linux)            | See the `flatpak` job in `.github/workflows/package.yml`; it runs in Flathub's container            |

Update this table in the PR that adds a command.

## Architecture map

| Part             | Path                                                                              | Notes                                                                                   |
| ---------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Main process     | `apps/desktop/src/main/`                                                          | One folder per feature; app lifecycle in `app/`, shared chrome plumbing in `chrome/`    |
| Preloads         | `apps/desktop/src/preload/`                                                       | Minimal typed `contextBridge` APIs, one per zone                                        |
| Chrome renderer  | `apps/desktop/src/renderer/`                                                      | YapYap's own UI (Preact), served from `app://`                                          |
| WhatsApp adapter | `apps/desktop/src/adapter/`                                                       | **The only place** with WhatsApp DOM knowledge; versioned selectors; returns plain data |
| AI assistant     | `apps/desktop/src/main/assistant/`, `src/renderer/engine/`, `src/preload/engine/` | Setup, providers, bar, private model and its engine window (ADR 0017)                   |
| MCP server       | `apps/desktop/src/main/agents/`                                                   | Opt-in server for AI agents on 127.0.0.1, its tokens and tools (ADR 0019)               |
| Docs             | `docs/`                                                                           | VitePress site, ADRs in `docs/adr/`                                                     |
| Repo automation  | `scripts/`                                                                        | Tested automation such as catalog and license checks; entries in `scripts/src/bin/`     |
| Packaging        | `apps/desktop/electron-builder.yml`, `packaging/`                                 | electron-builder targets, fuses, desktop entry, AppStream metainfo                      |
| Release pipeline | `.github/workflows/{package,smoke,release}.yml`                                   | CI and releases share packaging and smoke tests; releases add signing, SBOM, provenance |

## Non-negotiable rules

1. **Priority order.** When rules conflict: security > correctness > user
   privacy > confidentiality > tests and coverage > performance > code style.
   Log every conflict in `docs/adr/0008-requirement-conflicts.md`.
2. **Confidentiality.** Never mention or link to the reference project in any
   committed or public artifact. That includes code, comments, tests,
   fixtures, docs, commit messages, branch names, issues, PRs and release
   notes. Describe feature choices as based on "common needs of WhatsApp Web
   desktop users".
3. **Never automate a real WhatsApp account.** Tests use the local fake
   WhatsApp page and anonymized fixtures only.
4. **Comments explain why, never what.** Good reasons are constraints,
   WhatsApp quirks, security reasoning, and workarounds (with a link to the
   YapYap issue). No commented-out code, and no TODOs: open an issue.
5. **Coverage.** 100% lines and branches. `istanbul`, `c8` and `v8` ignore
   comments are forbidden (enforced by lint). Coverage exclusions live only in
   `vitest.config.ts` and must be justified in ADR 0005.
6. **Lint.** `strict-type-checked` + `stylistic-type-checked`, complexity ≤ 8,
   functions ≤ 40 lines, no `any`, no non-null assertions, no unused exports
   (knip).
7. **Security settings.** All web content runs with `sandbox: true`,
   `contextIsolation: true`, `nodeIntegration: false` and no `webviewTag`.
   Other requirements: strict CSP for app UI, minimal typed preloads, sender
   and payload validation on every IPC call, deny-by-default permissions,
   navigation and `window.open` guards, hardened fuses. No remote code except
   WhatsApp itself. See ADR 0001.
8. **No extensions.** YapYap runs no third-party code beside WhatsApp, and
   has no extension host, marketplace or call recorder (ADR 0018). A
   feature goes into YapYap itself. Nothing sends a message for the user
   but an AI agent whose token has `messages:send`, to the chats it lists
   (ADR 0019): the assistant inserts drafts only.
9. **Privacy.** No telemetry. Never log or persist message content, phone
   numbers or secrets. Secrets go through `safeStorage`.
10. **Versions.** Latest stable releases only, pinned exactly. Justify new
    dependencies. Install scripts must be allowlisted in `allowBuilds` in
    `pnpm-workspace.yaml`.

## Branch, PR and merge flow

- The default branch is `master`. Never commit to it directly.
- Branches are named `type/short-description`. Commits follow Conventional
  Commits and are **signed**. Never disable or bypass signing.
- Every commit builds and passes tests on its own.
- Open PRs with `gh pr create`, including `Closes #N` and test evidence.
  Update `docs/progress.md` in every PR, adding a short note in issue-number
  order (never at the top, so PRs don't conflict), and this file when it is
  affected.
- Watch checks with `gh pr checks --watch`. Fix failures with new commits.
  Never skip, weaken or disable a check or test.
- Merge once the required checks are green with
  `gh pr merge --merge --delete-branch`. Branches need not be up to date
  (ADR 0007); rebase onto `master` and push with `--force-with-lease` only
  when the PR conflicts. Squash and rebase merges are disabled.
- Releases happen only by merging the release-please PR.

## Common pitfalls

- pnpm 12 configures dependency install scripts with `allowBuilds` in
  `pnpm-workspace.yaml`; the old `onlyBuiltDependencies` key no longer applies.
- `typescript-eslint` deprecates `tseslint.config()`. Use `defineConfig` from
  `eslint/config`.
- Relative imports use explicit `.ts` extensions (`allowImportingTsExtensions`).
- The CI workflow's only required check is `CI result`. A new CI job must be
  added to its `needs`, or its failures will not block merging. A job that
  only matters for code or packaging gets `needs: changes` and a condition on
  `needs.changes.outputs` (ADR 0007). Required checks of other workflows
  live in `.github/rulesets/master.json`; re-apply it after changing it (see
  CONTRIBUTING). SonarQube Cloud's own check is required too, so the
  `SonarQube Cloud` job analyzes every pull request. Forks get no secrets,
  so their analysis fails until their branch is pushed here (CONTRIBUTING,
  ADR 0010).
- CI jobs set up pnpm, Node.js and the install with the local
  `.github/actions/setup` action after checkout; bump its action pins there.
  Vitest projects and the mutation config's test files both come from
  `vitest.projects.ts`.
- Terminals inside VS Code export `ELECTRON_RUN_AS_NODE=1`. The E2E fixture
  strips it; strip it yourself before running `electron` by hand.
- Electron (44 and later) has no postinstall step. It downloads its binary
  on first use, so no `allowBuilds` entry is needed.
- Never use top-level `await` in the main entry. Playwright holds back the
  `ready` event until the entry module finishes evaluating, so the app hangs.
- Stryker's Vitest runner silently tests nothing under Vitest 5. We use the
  `command` runner and `vitest.mutation.config.ts`. A suspicious score means
  checking "tests per mutant" in the output.
- Mutation runs give each Vitest suite one worker and stop fast-check at the
  first failure (`vitest.mutation.setup.ts`). Undoing either makes killed
  mutants show up as timeouts.
- Stryker runs on half the CPUs (`stryker.config.mjs`). If a local run reports
  mostly timeouts, the machine is busy: lower `--concurrency` rather than
  trusting the score.
- Inside a fast-check property, don't `return expect(...)`. fast-check treats
  the returned value as the property's result.
- Scripts run under Node's type stripping, so only erasable TypeScript is
  allowed (no enums, no constructor parameter properties). `erasableSyntaxOnly`
  enforces this.
- electron-builder skips code signing on `pull_request` events but treats any
  defined `CSC_LINK`, even an empty string, as a certificate path elsewhere.
  Never set signing variables to `''`; export them only when the secret exists.
  PR checks cannot catch this, so watch the first `master` run after changing
  packaging.
- Package and smoke workflows take a `scope` input: `representative` runs
  the always-on jobs, `full` adds the `*-full` jobs, which share their steps
  through YAML anchors. Add a new format or architecture to the right half.
- Flatpak lint exceptions live in `packaging/flatpak/lint-exceptions.json`,
  each with its reason and issue. Remove an entry as soon as its issue lands.
- `pnpm dev` serves chrome pages from `out/renderer` too, never from the
  Vite dev server: `watchChromePages` in `electron.vite.config.ts`
  watch-builds them there. They have no hot reload; reopen a window to see
  an edit.
- App chrome pages are served from `app://chrome/` on the in-memory
  `yapyap-chrome` partition. Add an operation by extending `ChromeApi` in
  `src/shared/api/chrome-api.ts`, the preload bridge, and a handler registered
  through `registerChromeHandlers`, which checks the sender and payload. Node's
  URL parser treats `app:` as opaque, so compare origins with `isSameOrigin`.
  A window's handlers live in its feature's folder as `<page>-handlers.ts`;
  `src/main/chrome/` keeps only what every chrome window shares. Contracts
  between processes (`*-api.ts`) live in `src/shared/api/`, and the main
  process answers each in a `<name>-ipc.ts` or a handlers file.
  `src/main/` holds only `index.ts` beside its folders: lifecycle code goes
  in `app/`, small utilities in `support/`.
- A setting appears in the settings window only once YapYap acts on it: add
  it to `SETTING_FIELDS` in `src/shared/settings-fields.ts` in the PR that
  implements it. The `settings:set` handler accepts only listed fields and
  checks the whole result against the schema. A setting that changes the
  system, such as login items, goes through a `SettingEffect`
  (`settingEffects` of `createChromeFeature`), which runs before saving and
  returns the text Settings shows when the system refuses.
- UI text, setting labels, menus, dialogs and notifications included, lives
  in `src/shared/messages/locales/en.json` (ADR 0012). After changing it,
  run `node scripts/src/bin/i18n-types.ts`; `pnpm lint` fails while the
  generated `Messages` type is stale. Text with `{{placeholders}}` or plural
  keys (`_one`, `_other`) is a function of named values:
  `en.tray.unread({ count })`. Lint (`yapyap/no-literal-ui-text`) rejects
  literal text in renderer JSX and in `aria-label`, `title`, `placeholder`,
  `alt` and `label`, and, in the main process, in `label`, `title`,
  `message`, `detail`, `body` and `buttons` properties.
- SonarQube Cloud runs every rule as it ships (ADR 0010), so code meets
  them instead of turning them off. In E2E specs, a test that means nothing
  on some systems gets a tag (`@linux`, `@not-macos`, `@not-windows`) or
  its file goes in `playwright.config.ts`'s lists, never a conditional
  `test.skip`; and checks that retry use `expect(...).toPass()` or a
  web-first assertion, never `expect.poll`. Scripts in `scripts/src/bin/`
  take other programs' output on stdin instead of running them from `PATH`.
- E2E tests start the app through `launchApp` in `e2e/fixtures.ts`, which
  gives each test a throwaway `--user-data-dir`. Never launch Electron in a
  spec without it, or tests write to the developer's real profile.
- Playwright's Electron launcher emulates a light color scheme unless told
  otherwise; `launchApp` passes `colorScheme: null` so tests see YapYap's
  real theme. Visual baselines are per OS and come from CI artifacts (see
  CONTRIBUTING), never from a local run.
- Screen capture reaches the permission handler as `display-capture` (since
  Electron 45), and the legacy desktop `getUserMedia` as a `media` request with
  no device types that never reaches `setDisplayMediaRequestHandler`. Never
  grant either without a user pick; see `allowScreenCapture` in
  `src/main/permissions/session-guard.ts` and ADR 0001.
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
- WhatsApp never runs in the default session: each account has its own
  `persist:account-<uuid>` partition (`partitionOf`, ADR 0001), listed in
  `accounts.json`. Per-session guards such as downloads go on the account's
  session; in E2E tests, reach it through the WhatsApp page's web contents.
- Window geometry lives in `window-state.json`, not in settings: it is state,
  not a preference, and never goes in `settings.json`.
- No backward compatibility before 1.0 (C45 in ADR 0008): no settings
  migrations, no importers for older data. A new setting just gets its
  default in the schema, and a settings file of another version is set
  aside like a damaged one.
- YapYap refuses to start with `--no-sandbox` or `ELECTRON_DISABLE_SANDBOX`.
  Playwright passes `--no-sandbox` to Electron unless `chromiumSandbox: true`
  is set, which `launchApp` does. Linux runs need unprivileged user
  namespaces for the sandbox: CI lifts Ubuntu's restriction, and VS Code's
  AppArmor profile grants them to terminals inside it.
- WhatsApp's views have one preload, `src/preload/whatsapp/`, which replaces
  the page's `Notification` (ADR 0011). `installNotificationShim` runs in
  WhatsApp's main world as source text, so it may use nothing from outside
  its body; check `out/preload/whatsapp.cjs` after changing it. Its bridge
  has three operations, and the main process checks everything it sends.
- Code that inspects WhatsApp's page lives in `src/adapter/` and runs in the
  adapter's isolated world (`ADAPTER_WORLD_ID`). Probes return plain flags,
  never page text, which can contain chats. They run on demand and never add
  observers. Selectors live only in `LANDMARKS` (`src/adapter/page-state.ts`):
  change one together with the fake page, and bump `LANDMARKS_VERSION`.
- Phone numbers in fixtures and E2E tests come from Ofcom's fictional range
  (`+44 7700 900xxx`); the fixture linter rejects any other.
- Never let a rejected `loadURL` end startup. Load failures are reported by
  the recovery monitor (`src/main/recovery/`), which shows the recovery
  screen.
- Create windows only with `createSecureWindow` (or `createMainWindow`, for
  the page-less main window) in `apps/desktop/src/main/window/windows.ts`.
  Lint rejects `new BrowserWindow`, `BaseWindow`, `BrowserView` and
  `WebContentsView` anywhere else, and new per-web-contents guards go in
  `security/web-contents-guards.ts`.
- Import wllama from `@wllama/wllama/esm/index.js`: the package's `main`
  names a file it does not ship, and its TypeScript sources do not pass our
  checks. Keep `setCompat(null)`, or wllama fetches a build from a CDN.
  E2E tests give the assistant's private model a tiny model through
  `YAPYAP_TEST_BUILT_IN_MODEL`, and fake model servers through
  `YAPYAP_TEST_MODEL_PORTS`; a packaged build ignores both.
- The assistant's network requests go only through its confined `fetch`
  (`src/main/assistant/net.ts`) on the in-memory `yapyap-assistant`
  session, whose request guard allows only the providers, Hugging Face and
  the chosen loopback server. Never use `globalThis.fetch` or another
  session for them. Provider output is plain text, never markup.
- The private model's engine window opens only on first use and closes when
  idle. Never open it at startup: the startup bench budgets renderer
  processes (ADR 0009). It runs on `app://engine` under its own CSP; serve
  nothing else there.
- The `assistant` and `agents` settings sections are local: never exported
  or imported (`LOCAL_SECTIONS` in `settings/transfer.ts`). The
  assistant's state that is no preference lives in `assistant.json` and
  `assistant-chats.json`, its keys and chat names in `secrets.json`.
- The assistant never sends a message: it puts drafts in the message box.
  Only the user's click on a suggestion's send button sends, after the bar
  checks the chat is unchanged. Its UI text, including the bar's, lives in
  `en.json` under `assistant`.
- YapYap listens on no port but the MCP server's (ADR 0019):
  `src/main/agents/listener.ts`, on `127.0.0.1`, only while **Let AI
  agents connect** is on. `no-endpoint.test.ts` fails if any other file
  opens a server. Every request passes `request-checks.ts` and a token
  before the official SDK (`@modelcontextprotocol/server`) sees it; each
  tool checks the token's accounts, scopes and chats again before it
  touches WhatsApp. The `agents` settings section is local like
  `assistant`, tokens live in `agent-tokens.json` as hashes, and their
  chat names in `secrets.json`.
- The Homebrew tap is its own repository, `vascoguita/homebrew-yapyap`,
  with its own checks; its casks come from `scripts/src/release/homebrew.ts`,
  never from edits there. The Distribute workflow proposes them as a pull
  request through the automation App, committed through GitHub's API so
  they are signed.
- Renovate (ADR 0020) updates every pinned version from
  `.github/renovate.json`, on the automation App's token, here and in the
  Homebrew tap. A pin it cannot
  find on its own, such as the Flatpak runtime or `engines.node`, needs a
  custom manager there. Dependabot only raises security alerts and updates.
- Packaged builds disable the Node inspector fuse, so Playwright's Electron
  launcher cannot drive them. The smoke test connects over CDP through the
  `DevToolsActivePort` file in the profile directory instead.
