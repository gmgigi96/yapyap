# Progress

This page holds the project's current state, the conventions that do not fit
elsewhere, and short notes on what each pull request changed. Decisions and
their reasons belong in the ADRs (`docs/adr/`), and released changes in
`CHANGELOG.md`. Git history keeps the long versions of older notes.

## Current state (2026-11-01)

- **Latest stable release:** v0.2.0 (2026-10-29). **Latest beta:**
  v0.2.1-beta.2 (2026-10-31). The release-please PR for 0.2.1 is open.
  Releases happen only by merging it, and a release needs a published beta
  of its version first (#184).
- **On `master`, unreleased:** the AI assistant is part of YapYap itself
  (ADR 0017, #505). It is YapYap's main feature and no longer an extension.
- **Next:** M7 (#210, the full packaging matrix and the up-to-date rule on
  pull requests) and M8 (#119 Flathub, #118 the final audit and v1.0.0).
- **Waiting on the maintainer:** #24 (Windows code signing), #25 (AUR
  credentials), #402 (renew the macOS certificate before 2027-11-25), #419
  (where reviewed third-party extension archives are hosted).
- **Open outside milestones:** #345 and #346 (winget, Scoop and Homebrew),
  #477 (the SDK and signing CLI on npm), #507 (a slow welcome window in
  Windows E2E).
  See `gh issue list` for the live list.

| Milestone                                            | Status                           |
| ---------------------------------------------------- | -------------------------------- |
| M0 · Research and ADRs                               | Done                             |
| M1 · Bootstrap                                       | Done, except #24 and #25         |
| M2 · Single-account shell                            | Done                             |
| M3 · Accounts, tray, notifications, updates (v0.1.0) | Done                             |
| M4 · Remaining desktop features (v0.1.x)             | Done                             |
| M5 · Extension platform                              | Done                             |
| M6 · AI writing assistant (v0.2.0)                   | Done; made part of YapYap (#505) |
| M7 · Hardening                                       | In progress (#210)               |
| M8 · Docs and v1.0.0                                 | In progress (#118, #119)         |

## Conventions

- **Notes go in issue-number order.** Add a note where its first issue
  number belongs, never at the top, so pull requests for different issues
  do not edit the same lines. Keep it to a few lines: what changed and
  where to look. Put the reasons in an ADR (ADR 0008 for conflicts).
- **Planned features.** The website marks unshipped features as planned.
  When a feature ships, drop its "(planned)" marker and add its settings,
  files and flags to `docs/guide/reference.md`.
- **Settings sections.** A new section must be listed in
  `EXPORTED_SECTIONS` or `LOCAL_SECTIONS` (`settings/transfer.ts`); a test
  fails until it is.
- **Advisories.** A build-only advisory without an upstream fix is resolved
  with an `override` in `pnpm-workspace.yaml`, with a comment saying why and
  when to remove it.
- **Test-only switches.** `YAPYAP_TEST_*` variables (marketplace origin and
  anchor, model ports, the built-in model) point E2E tests at local fakes.
  Packaged builds ignore them.
- **Releases.** release-please runs only while the `RELEASES_ENABLED`
  variable is `true`. The release workflow merges each change's commit and
  merge-commit entries into one changelog entry (`merge-changelog.ts`,
  #358). Extensions have their own release-please components and
  `<name>-vX.Y.Z` tags (#474).
- **Identity.** The site is https://yapyap.guita.org (a GitHub Pages custom
  domain), and the app ID is `org.guita.YapYap`. Ensita supports YapYap's
  development and is credited in the README, the site footer and the About
  window. Sponsorships go through GitHub Sponsors (#196).

## Notes

- macOS signing (#23): release builds with the Developer ID certificate turn
  `CSC_IDENTITY_AUTO_DISCOVERY` on, since electron-builder skips signing
  while it is off, even with `CSC_LINK`. Notarizing uses an App Store
  Connect API key (#400). Windows stays unsigned until #24.

- Adapter (#32): the page view, open chat and unread count come from
  on-demand probes over the versioned `LANDMARKS` table.

- Reliability (#37, #39, #41, #379, #377): a renderer memory watchdog,
  opt-in local crash reports with fingerprints (#113), a Linux display
  backend setting, and a GPU crash fallback that counts one crash per run.

- Settings export and import (#43) live in Settings → Backup.

- Translations (#55, #111, #374): UI text is in `locales/en.json` (i18next
  JSON v4, no dotted keys) with a generated `Messages` type, logical CSS
  only, and pseudo-locales for testing (ADR 0012).

- Accounts (#56, #57, #58, #87, #381): one partition and view per account,
  `accounts.json` rebuilt from the partition folders when damaged, the
  account sidebar, the Accounts window, and account photos fetched only
  from WhatsApp's hosts.

- Notifications (#59–#62, #398): the WhatsApp preload's `Notification`
  stand-in (ADR 0011), inline replies typed as unsent drafts, do not
  disturb and per-account mute, notification privacy, and withdrawal once
  a chat is read.

- Tray, badge and startup (#63–#66, #234, #362, #458): tray menu and
  symbolic icon, unread badges, close to tray, start minimized, start at
  login (the Background portal under Flatpak), and chats left unread while
  hidden.

- Calls (#67, #78, #161, #180, #363): call windows inherit their account's
  zone, media permission checks compare origins with `isSameOrigin`, and
  screen shares are tracked and can be stopped from the tray and sidebar.

- Updates (#68–#70, #184): `decideUpdatePolicy` picks self-update, notify,
  system or manual; **Get beta updates** opts into pre-releases.

- Desktop features (#72–#77, #79–#86): custom CSS and JavaScript, spell
  checking (off by default), downloads, keyboard and global shortcuts,
  proxies with sign-in, site permissions, chat list width, New Chat with
  Number, interface scale, Report a Problem, cache limits, the welcome
  window, the privacy screen and the quick access panel.

- Extension platform (#88–#99, #301, #332, #342, #396, #426): the SDK
  (`packages/sdk`), Ed25519 signing (`packages/extension-sign`), archives,
  consent, the sandboxed runtime and RPC, grants, network allowlist,
  secrets, storage, resource limits, commands, settings, menu items,
  panels and the activity log (ADR 0004). "Plugin" was renamed to
  "extension" everywhere, with no compatibility (ADR 0016).

- Extension chat access (#100, #105, #330, #410): `composer.insertDraft`,
  `composer.readDraft` and `composer.replaceDraft`, `chat.readActive` and
  `chat.readUnreadSummary`, each behind its own capability. Nothing logs
  what they return.

- Example extension and author guide (#101), and the hostile-extension E2E
  suite (#102), which floods the host with three times the RPC burst.

- AI assistant (#103–#107, #407, #430, #456, #457, #466–#468, #482, #484):
  bring-your-own-model providers, local servers, the private model, consent
  per chat, and the in-chat bar (ADR 0013). It moved into YapYap with #505.

- Performance (#109, #428, #496): nightly budgets for idle, per-account and
  active use (ADR 0009). The main window is a `BaseWindow`, so its empty
  page runs no renderer.

- Accessibility (#110): axe-core and keyboard checks on every chrome page.

- Docs (#112, #114–#117, #383–#385): security review, FAQ, privacy
  inventory, architecture overview, user-first website, store screenshots
  and the get-started guide.

- SonarQube Cloud (#185, #461): a required check on every PR (ADR 0010).

- CI cost and E2E stability (#188, #210, #223, #247, #296, #327, #394):
  docs-only changes skip code jobs (ADR 0007); E2E teardown kills hung apps
  and attaches diagnostics; local runs stay on the virtual X11 display.

- Mutation (#275, #312): the nightly run is split into 16 shards.

- Package repositories (#344, #350): signed apt, dnf and pacman
  repositories on packages.guita.org, tested by `packaging/repository/test.sh`.

- winget, Scoop and Homebrew, prepared (#345, #346): `distribution.ts`
  writes the winget manifests, the Scoop manifests and the Homebrew casks
  from a release's `SHA256SUMS`. The **Distribute** workflow publishes them
  after each release and beta, and skips each channel with a notice until
  its token exists. CI checks the manifests against vendored schemas and
  runs `brew style` and `brew audit --strict` in Homebrew's Linux container.

- Total downloads (#347): the daily docs build writes `downloads.json` and
  the README badge's data.

- Marketplace (#386–#391, #434): the signed index (ADR 0014), the
  Marketplace tab, `yapyap://extensions/install/<id>` links, generated
  website pages, submissions, release notes and screenshots.

- Call recording (#392, #393, #442, #443): YapYap records on the user's
  click after consent (ADR 0015); the call recorder extension adds
  commands with suggested shortcuts; WebM or WAV, in a folder the user
  picks.

- Scorecard (#404, #406): releases carry Sigstore bundles and in-toto
  provenance.

- SDK and signing CLI on npm (#477): `packages/sdk` and
  `packages/extension-sign` are release-please components of their own and
  are published with provenance by the release workflow.
  `templates/extension/` is a standalone extension repository that builds
  against them and signs each tagged release with the author's key.

- Repository hygiene (#478, #499): one setup action for CI, one Vitest
  project list shared with mutation, one copy of the app icon.

- Extensions on demand (#495, ADR 0004 amendment, C44): the manifest's
  `activation` is `startup` (the default) or `on-demand`, which starts the
  hidden page only for a command or the panel and stops it after five idle
  minutes. Menus list contributions from the manifest. The example and the
  call recorder are on demand; the startup benchmark checks that installed
  extensions add no renderer.

- Audit fixes (#501): `compareVersions` in the SDK, the last account
  cannot be removed, **Record** waits for consent, and Escape asks before
  discarding unsaved text.

- Assistant in YapYap (#505, ADR 0017): `apps/desktop/src/main/assistant/`
  runs the providers on a confined in-memory session and the private model
  in a hidden engine window. Settings version 19 adds the local
  `assistant` section. The first start imports an installed `ai-assistant`
  extension's setup and removes it. `extensions/ai-assistant` and the
  `assistant:bar`, `local-model` and `localModels.find` extension APIs are
  gone (C42 and C43 in ADR 0008).

- E2E reliability (#507): the welcome test waits for WhatsApp's first
  load, which opens the welcome, and test profiles are deleted with
  retries for Windows. Tests find the main window with `mainWindow`, never
  by index; `launchAgain` kills a second launch that never exits; recording
  tests wait for sound in the `.part` file instead of sleeping.

- Progress page (#508): this page now holds the current state, conventions
  and condensed notes; git history keeps the long notes.

- Yes/no dialogs (#510): every two-button message box goes through
  `confirm()` in `main/dialogs/`, with the safe answer on Enter and Escape;
  the startup and account prompts live there too.

- Versions in the docs (#511): README, the guide and CONTRIBUTING no longer
  name versions that go stale, and ADR 0002 keeps the toolchain choices and
  reasons without copying the pins from the manifests.

- Comment fixes (#513): the unsafe-start message reaches stderr through the
  log's mirror, and the chrome preload pushes four events, not one.

- Renderer tests (#514): `fakeChromeApi(overrides)` in
  `apps/desktop/test/chrome-api.ts` builds `window.yapyap`; a test fakes
  only the operations it uses.

- Assistant-first docs (#516): the website's assistant, Settings and
  Marketplace screenshots are taken again, the guide has an assistant
  section, the FAQ says what the assistant reads, and the install guide
  says macOS builds are signed and notarized.

- Test hygiene (#521): `tempDir()` in the root `test/temp-dir.ts` gives a
  test a temp folder that is removed when the test ends. The marketplace
  takes its clock as `now`, so its tests use fixed dates.

- Chrome page entries (#522): every page starts through `mount(Page, {
title, escape })` (`src/renderer/shared/mount.tsx`), which titles the
  window from `en.windows`; dialog-like windows close on Escape.

- IPC registrars (#523): messages from WhatsApp's preload go through
  `registerWhatsAppListeners` in `main/ipc/`, next to
  `registerChromeHandlers`; payload checks use `argumentsOf`, and the chrome
  preload hears its events through one typed `listen`.

- State files (#527): every small state file is a `TextFile` from
  `textFileAt` (`main/support/atomic-write.ts`), written atomically; the extension
  records use `writeTextAtomicallyAsync`.

- UI wording (#528): buttons in YapYap's windows use title case, like its
  menus; the assistant bar keeps WhatsApp's sentence case. The Installed
  list and the Marketplace share `extensions.trust`. The catalog is in US
  English.

- Faster unit tests (#531): the SDK, signing CLI, scripts and example
  extension tests share workers across files (`isolate: false` in
  `vitest.projects.ts`). The desktop app and the call recorder keep one
  worker per file. Provider retry tests use fake timers.

- Chrome styles (#534): each window's main action is a filled primary
  button, every text box and list shares one style, and empty live regions
  take no room.

- Marketplace checks (#536): `revocationOf` and `readMarketplaceIndex` in
  the SDK serve the app and the website, which now also refuses an index
  that is too large, signed too far ahead or valid too long.

- Settings migrations (#538): one table entry per version, built from
  `adding(section, values)`; an import parses its JSON once
  (`decodeParsed`).

- E2E helpers (#540): specs reach WhatsApp's web contents with
  `whatsAppContents`, wait for test extensions with `extensionTitle` and
  `EXTENSION_START_TIMEOUT`, and write settings with `seedSettings`, at the
  current schema version.

- Extensions window (#541): `InstalledExtension` carries the manifest's
  name, which the list, Remove and Recent activity show. Failures are said
  in one live region, a Marketplace install refreshes the list in place,
  and an empty Installed tab leads to the Marketplace.

- Adapter world (#543): main-process probes run through `runInAdapterWorld`
  (`adapter/world.ts`), and chrome pages load through `loadChromePage`,
  which the hidden recorder window uses too.

- Screen readers (#545): the record prompt's ticking time is no live
  region, the discard prompt takes the focus and keeps editing on Escape,
  Downloads buttons name their file, and the consent window and compact
  sidebar say in words what they showed by color or icon.

- Start-up tests (#546): `start.test.ts` reads the tray, account menu,
  sidebar and window listeners through named helpers.

- Settings sections (#549): the top of Settings links to each section it
  shows, Assistant first and Backup last.

- Test fakes (#551): main-process tests share `fakeEmitter()`
  (`apps/desktop/test/emitter.ts`) and `FAKE_FINGERPRINT`.

- Main-process layout (#554): start-up lives in `main/start/` (port types in
  `types.ts`, so nothing imports `start.ts` back), product constants in
  `identity/product.ts`, window plumbing in `window/`, security plumbing
  and `views.ts` in `security/`; chrome handler modules are named after
  their feature, and the unsafe-start prompt reads its own text.

- Windows E2E waits (#557): the restart test flushes the account's
  storage before quitting, which a quick quit on Windows had lost, and the
  recovery tests wait for WhatsApp's load before the health check's delay.

- Main-process text (#560): extension install errors come from the
  catalog (an unreadable archive gets one generic reason), Check Spelling is
  a checkbox whether spelling is on or off, Copy Diagnostics notifies how it
  went, and the unsafe-start detail no longer repeats its message.

- No compatibility before 1.0 (#562, C45 in ADR 0008): settings are
  schema version 1 with no migrations, and a file of another version is set
  aside like a damaged one; the read-only mode for a newer build's settings,
  the assistant extension's import and its one-time bar note are gone,
  and the manifest guide no longer warns about older YapYap releases.
  From 1.0, settings migrations start again at version 1.

- CI job timeouts (#569): smoke jobs stop after 20 minutes and package
  jobs after 60, so a hung runner step no longer holds a CI run for six
  hours.

- No extensions (#571, ADR 0018): the extension host, the marketplace, the
  SDK and signing CLI, the extension template and the call recorder are
  gone, with their settings, windows, menu items, shortcuts, install links,
  release components and docs. The assistant keeps the chat readers and the
  capped download it shared with them.

- Notification pictures (#572, C46 in ADR 0008): notifications show the
  chat's picture, fetched by `AccountAvatars.picture` under the account
  photo's rules, only while the sender is shown, and waited for at most
  1.5 s (`main/notifications/notifier.ts`).

- Install page button (#579): the download button carries its own styles,
  so it shows as a button on the install page too, not only on the home
  page.

- Stale suggestions (#582): when WhatsApp draws a chat again, the bar
  checks the open chat and takes away suggestions, a summary or a consent
  question made for another one. The key links in Settings have an E2E test.

- No quick access panel (#585): the always-on-top panel, its settings and
  `quick-panel.json` are gone; the tray, the sidebar and the Account menu
  switch accounts and turn Do not disturb on or off.
- MCP server design (#576, ADR 0019, C47 in ADR 0008): proposed a built-in
  MCP server, off by default, on `127.0.0.1` and the official MCP SDK, with
  fine-grained tokens (scopes, accounts, chat allowlist, limits, expiry)
  that let AI agents read chats, write drafts and, with `messages:send`,
  send to allowed chats. Design only; no code yet.
- MCP server for AI agents (#576, ADR 0019, C47 in ADR 0008): Settings ›
  Agents turns on an MCP server on `127.0.0.1`, built on the official SDK
  (`@modelcontextprotocol/server`). Tokens, created and narrowed there,
  carry scopes, accounts, a chat list, limits (or Unlimited) and an
  expiry; agents can list unread chats, read the open chat, open listed
  chats, read and write drafts and, with `messages:send`, send to listed
  chats. A listed chat has a name, an international number or both;
  `list_chats` searches them, and a number opens its chat through
  WhatsApp's own link wherever it is, while a name is found by scrolling
  the chat list. The tray stops it, the activity stays in memory, and
  `no-endpoint.test.ts` allows the one listener file.
- Renovate (#578, ADR 0020): Renovate replaces Dependabot's version
  updates and the pinned-versions script, with the same schedule, cooldown,
  groups and auto-merge. Custom managers move `engines.node` with `.nvmrc`
  and the Flatpak runtime with the BaseApp, and CI validates the config.
- Install page button (#579): the download button carries its own styles,
  so it shows as a button on the install page too, not only on the home
  page.
- Dev chrome pages (#588): `pnpm dev` watch-builds the renderer into
  `out/renderer`, which `app://chrome/` serves, and starts Electron only
  after the first build, so the dev app never shows stale chrome pages.
- SonarQube Cloud on forks (#591, ADR 0010): a run without the token, as
  for pull requests from forks, fails instead of passing, and the ruleset
  requires SonarQube Cloud's own check. A fork's branch is pushed here to
  be analyzed (CONTRIBUTING).
- Codebase cleanup (#592): the same jobs are done the same way across
  files, with shared helpers for environment variables, small JSON stores,
  pauses and following a setting, and one fake settings service for tests.
  Dead code and leftovers of the removed extensions and quick access panel
  are gone, the MCP server's SonarQube Cloud issues are fixed, and mutation
  testing covers the moved security and window modules again. Each feature
  keeps its window handlers in its own folder, `src/main/` holds only
  `index.ts` beside its folders, the process contracts sit in
  `src/shared/api/`, and `AGENTS.md` links to `CLAUDE.md`.
- minimatch advisory (#594): overrides move electron-builder to
  `@electron/asar` 4, `@electron/universal` 3, `filelist` 2 and `glob` 14,
  so every package gets minimatch 11, and drop the Squirrel.Windows
  packager YapYap never builds. `pnpm audit` finds nothing.
- knip advisory (#597): knip moves to 6.44.1, which fixes a path traversal
  advisory (CVE-2026-120325) that failed SonarQube Cloud's dependency gate.
