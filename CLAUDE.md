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

Start every session by reading this file and the status at the top of
`docs/progress.md`. Before changing an area, read the ADRs that cover it
(listed in `docs/adr/README.md`) and the `CLAUDE.md` next to its code.

## Commands

Use pnpm (version pinned in `package.json`) on Node.js 26 LTS.

| Task                              | Command                                                                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Install                           | `pnpm install` (CI: `pnpm install --frozen-lockfile`)                                                                   |
| Run the app (hot reload)          | `pnpm dev`                                                                                                              |
| Build all packages                | `pnpm build`                                                                                                            |
| Lint (ESLint + Prettier + knip)   | `pnpm lint`                                                                                                             |
| Format                            | `pnpm format`                                                                                                           |
| Typecheck                         | `pnpm typecheck`                                                                                                        |
| Unit + integration tests          | `pnpm test`                                                                                                             |
| Coverage (100% gate)              | `pnpm test:coverage`                                                                                                    |
| E2E tests                         | `dbus-run-session -- xvfb-run -a pnpm test:e2e` on Linux, else `pnpm test:e2e`                                          |
| Mutation tests (≥ 90%)            | `pnpm test:mutation` (PR CI mutates changed in-scope files only)                                                        |
| Performance benchmark             | `xvfb-run -a pnpm test:bench` (nightly; budgets in `apps/desktop/e2e/bench/`, ADR 0009)                                 |
| Website screenshots (Linux)       | `dbus-run-session -- xvfb-run -a -s "-screen 0 3840x2400x24" pnpm screenshots`                                          |
| Commit messages                   | `pnpm commitlint`                                                                                                       |
| Regenerate the message types      | `node scripts/src/bin/i18n-types.ts` (after changing `locales/en.json`)                                                 |
| Check translation catalogs        | `node scripts/src/bin/check-catalogs.ts` (part of `pnpm lint`)                                                          |
| Check chrome CSS is logical       | `node scripts/src/bin/check-logical-css.ts` (part of `pnpm lint`; no physical left/right, ADR 0012)                     |
| Validate the Renovate config      | Run the `docker run` command of the `renovate` job in `.github/workflows/ci.yml`                                        |
| License compatibility             | `pnpm check:licenses`                                                                                                   |
| Vulnerability audit               | `pnpm audit --audit-level high`                                                                                         |
| Docs site (dev / build)           | `pnpm docs:dev` / `pnpm docs:build`                                                                                     |
| Package installers for this OS    | `pnpm package` (output in `apps/desktop/release/`)                                                                      |
| Run headless (no display)         | `pnpm --filter @yapyap/desktop exec electron --ozone-platform=headless out/main/index.js --headless` after `pnpm build` |
| Smoke-test an installed package   | `YAPYAP_PACKAGED_EXECUTABLE=<path> pnpm test:smoke`                                                                     |
| Verify hardened fuses             | `node scripts/src/bin/verify-fuses.ts <executable or .app>`                                                             |
| AUR PKGBUILD and .SRCINFO         | `node scripts/src/bin/aur.ts <version> <amd64 .deb> <arm64 .deb> <output dir>`                                          |
| Homebrew, winget, Scoop manifests | `node scripts/src/bin/distribution.ts <version> <SHA256SUMS> <output dir>`                                              |
| Check those manifests             | `bash packaging/distribution/test.sh` (needs podman or docker; runs `brew style` and `brew audit`)                      |
| Test the apt/dnf/pacman repos     | `bash packaging/repository/test.sh` (needs podman or docker)                                                            |
| Flatpak bundle (Linux)            | See the `flatpak` job in `.github/workflows/package.yml`; it runs in Flathub's container                                |

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

Notes that matter only in one part of the repository live in a `CLAUDE.md`
next to that code, which Claude Code loads when work reaches it: `.github/`,
`packaging/`, `scripts/`, `apps/desktop/e2e/`, and `apps/desktop/src/main/`,
`adapter/`, `preload/` and `renderer/`. Read the one for the area you change.

- pnpm 12 configures dependency install scripts with `allowBuilds` in
  `pnpm-workspace.yaml`; the old `onlyBuiltDependencies` key no longer applies.
- `typescript-eslint` deprecates `tseslint.config()`. Use `defineConfig` from
  `eslint/config`.
- Relative imports use explicit `.ts` extensions (`allowImportingTsExtensions`).
- Terminals inside VS Code export `ELECTRON_RUN_AS_NODE=1`. The E2E fixture
  strips it; strip it yourself before running `electron` by hand.
- Electron (44 and later) has no postinstall step. It downloads its binary
  on first use, so no `allowBuilds` entry is needed.
- UI text, setting labels, menus, dialogs and notifications included, lives
  in `src/shared/messages/locales/en.json` (ADR 0012). After changing it,
  run `node scripts/src/bin/i18n-types.ts`; `pnpm lint` fails while the
  generated `Messages` type is stale. Text with `{{placeholders}}` or plural
  keys (`_one`, `_other`) is a function of named values:
  `en.tray.unread({ count })`. Lint (`yapyap/no-literal-ui-text`) rejects
  literal text in renderer JSX and in `aria-label`, `title`, `placeholder`,
  `alt` and `label`, and, in the main process, in `label`, `title`,
  `message`, `detail`, `body` and `buttons` properties.
- SonarQube Cloud runs every rule as it ships (ADR 0010), so code meets them
  instead of turning them off.
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
- No backward compatibility before 1.0 (C45 in ADR 0008): no settings
  migrations, no importers for older data. A new setting just gets its
  default in the schema, and a settings file of another version is set
  aside like a damaged one.
- Phone numbers in fixtures and E2E tests come from Ofcom's fictional range
  (`+44 7700 900xxx`); the fixture linter rejects any other.
