# Contributing to YapYap

Thanks for helping make YapYap better. This guide covers how to set up your
environment, how changes flow into `master`, and the rules every change follows.
By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ground rules

1. **Priorities.** When requirements conflict, the order is: security, then
   correctness, then user privacy, then confidentiality, then tests and
   coverage, then performance, then code style. Record any conflict in
   [ADR 0008](docs/adr/0008-requirement-conflicts.md).
2. **Never automate a real WhatsApp account.** Tests use the local fake
   WhatsApp page in `apps/desktop/test/fake-whatsapp/`.
3. **Privacy.** No telemetry. Never log, persist or put in fixtures any
   message content, phone numbers, names or secrets.
4. **Clean room.** Implement features from their description. Never copy code
   from other projects whose licenses are incompatible with MIT.
5. **Comments explain why, never what.** Good reasons for a comment are
   non-obvious constraints, WhatsApp quirks, security reasoning, and
   workarounds (with a link to the YapYap issue). No commented-out code, and no
   TODOs: open an issue instead.
6. **Tests.** 100% line and branch coverage. Coverage-ignore directives are
   forbidden.
7. **Dependencies.** Keep them minimal and justify each new one in the PR
   description or an ADR.

## Development setup

You need Node.js 24 LTS and pnpm (version pinned in `package.json`, enable it
with `corepack enable`). On Linux, run E2E tests as
`dbus-run-session -- xvfb-run -a pnpm test:e2e`: `xvfb-run` keeps their
windows off your desktop, and a private session bus keeps their tray icons
and notifications off it too.

```sh
pnpm install            # install (frozen lockfile in CI)
pnpm dev                # run the desktop app with hot reload
pnpm lint               # ESLint + Prettier check + knip
pnpm typecheck          # tsc across the workspace
pnpm test               # unit + integration tests
pnpm test:coverage      # tests with the 100% coverage gate
pnpm test:e2e           # Playwright E2E (on Linux, wrap it as described above)
pnpm test:mutation      # Stryker mutation testing
pnpm build              # build every package
pnpm package            # build installers for the current OS
```

`CLAUDE.md` has the full command list and an architecture map.

## Workflow

1. Pick an issue and move it to **In Progress** on the
   [project board](https://github.com/users/vascoguita/projects/5).
2. Create a branch `type/short-description` (for example
   `feat/tray-unread-count`).
3. Make small, focused commits. Each one builds and passes tests on its own.
4. Commits follow [Conventional Commits](https://www.conventionalcommits.org/)
   and **must be signed**.
5. Open a PR that links the issue (`Closes #N`) and includes test evidence.
   Update `docs/progress.md`, and `CLAUDE.md` if your change affects it.
6. When checks are green, rebase onto the latest `master`, push with
   `--force-with-lease`, and wait for checks again.
7. Merge with a merge commit (`gh pr merge --merge --delete-branch`). Squash
   and rebase merges are disabled so that branch commits keep their
   signatures.

See [ADR 0007](docs/adr/0007-git-and-merge-strategy.md) for the reasoning.

UI text lives in `apps/desktop/src/shared/messages/locales/en.json`. After
changing it, run `node scripts/src/bin/i18n-types.ts`. Translations follow
[docs/translations.md](docs/translations.md).

### Website screenshots

Pictures of YapYap's own windows, such as Settings and the AI assistant, come
from `pnpm screenshots` (see the commands in CLAUDE.md), on a showcase page
with invented people. The main window's pictures show the real WhatsApp: the
maintainer takes them on their own account, after every name, photo and
message on screen has been replaced with invented ones, and checks each
picture before it is committed. Never commit a screenshot of anyone's real
chats.

### Visual baselines

`apps/desktop/e2e/theme.spec.ts` compares the app chrome against screenshots
kept per OS under `apps/desktop/e2e/__screenshots__/<platform>/`. Fonts and
native controls differ between operating systems and machines, so baselines
come from CI, never from a local run:

1. Push the change. The E2E job fails on each OS where a baseline is missing
   or no longer matches.
2. Download that job's `playwright-report-<os>` artifact and copy each
   `*-actual.png` from `test-results/` to the matching baseline path, without
   the `-actual` suffix.
3. Look at every new image before committing it.

## Repository settings

These settings are applied through the GitHub API and must stay in place.

- **Merging:** merge commits only (squash and rebase disabled), auto-merge
  allowed, head branches deleted after merge.
- **Security:** secret scanning with push protection, Dependabot alerts and
  security updates, private vulnerability reporting. Discussions are enabled.
- **Pages:** the source is GitHub Actions, not a branch.
- **Actions:** the default workflow token is read-only, and workflows may open pull requests (release-please needs this). Each workflow requests only the permissions it needs.
- **Rulesets:** stored as JSON in [`.github/rulesets/`](.github/rulesets/).
  - `master`: pull request required, merge commits only, required status
    checks (`CI result` for the CI workflow, plus CodeQL, dependency review,
    audit, PR title and docs build), signed commits, no force push, no
    deletion, conversation resolution required. Branches need not be up to
    date until M7 (#210, ADR 0007).
  - `release tags`: `v*` tags cannot be deleted, moved or updated.

  After changing a ruleset file (for example when a check of a workflow
  other than CI is added or renamed), apply it:

  ```sh
  id=$(gh api repos/vascoguita/yapyap/rulesets --jq '.[] | select(.name=="master") | .id')
  gh api -X PUT "repos/vascoguita/yapyap/rulesets/$id" --input .github/rulesets/master.json
  ```

### OpenSSF Scorecard checks below 10

Scorecard (`scorecard.yml`) rates the repository weekly. These checks stay
below 10 on purpose or for now (#404):

- **Code-Review:** YapYap has one maintainer, so pull requests are not
  approved by a second person. Every change still goes through a pull
  request with the required checks. A required approving review would block all merging
  until there is a second maintainer.
- **Branch-Protection:** the `master` ruleset requires a pull request,
  signed commits and the required checks, and forbids force pushes and
  deletion. It does not require approvals, dismiss stale reviews or code
  owner review, for the reason above, and branches need not be up to date
  until M7 (#210).
- **Signed-Releases:** releases attach their Sigstore bundle and in-toto
  provenance since v0.1.2-beta.3. The score rises as older releases leave
  the last five Scorecard looks at.
- **Packaging:** Scorecard looks for a workflow that publishes to a package
  registry. YapYap publishes installers on GitHub Releases and its own
  package repositories, which it does not detect.
- **Maintained:** the repository is younger than 90 days.

## Secrets and maintainer-only steps

The pipelines skip steps whose secrets are missing, and print a notice in the
job summary instead of failing.

| Secret / variable                                                            | Used for                                                                                                                                                                                 | Missing →                                                                               |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `EXTENSION_SIGNING_KEY` (secret)                                             | Signing first-party extensions (PKCS#8 PEM, Ed25519)                                                                                                                                     | First-party extensions are not signed; release blocked                                  |
| `EXTENSION_SIGNING_PUBLIC_KEY` (variable)                                    | Embedded first-party trust anchor (SPKI PEM)                                                                                                                                             | Build fails                                                                             |
| `AUTOMATION_APP_CLIENT_ID` (variable), `AUTOMATION_APP_PRIVATE_KEY` (secret) | The YapYap automation GitHub App. Release and pinned-version workflows mint an hour-long token from it, so their PRs trigger the required checks (see [Automation app](#automation-app)) | PRs are opened with the workflow token, and the maintainer re-runs their checks by hand |
| `CSC_LINK`, `CSC_KEY_PASSWORD`                                               | macOS signing: the Developer ID Application certificate and its key, as a base64 `.p12`, and the `.p12` password                                                                         | Unsigned DMG, no macOS self-update                                                      |
| `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`                      | macOS notarization with an App Store Connect team API key (the `.p8` file's text, its key ID and the issuer ID); preferred over the Apple ID secrets (#400)                              | The Apple ID secrets are used, if set                                                   |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`                   | macOS notarization with an Apple ID, when no API key is set                                                                                                                              | Not notarized: Gatekeeper warns on first launch                                         |
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`                                       | Windows Authenticode signing                                                                                                                                                             | Unsigned installers (SmartScreen warning)                                               |
| `AUR_SSH_KEY`                                                                | Publishing `yapyap-bin` to the AUR                                                                                                                                                       | PKGBUILD attached to the release only                                                   |
| `PACKAGES_SIGNING_KEY` (secret)                                              | Signing the apt and dnf repositories at `packages.guita.org` (see [Package repository key](#package-repository-key))                                                                     | The repositories are not deployed                                                       |
| `CLOUDFLARE_API_TOKEN` (secret), `CLOUDFLARE_ACCOUNT_ID` (variable)          | Deploying `packages.guita.org` to the `yapyap-packages` Cloudflare Pages project (a token with Pages Write only)                                                                         | The repositories are not deployed                                                       |
| `SONAR_TOKEN`                                                                | SonarQube Cloud analysis (a project analysis token for `vascoguita_yapyap`, also stored as a Dependabot secret)                                                                          | The SonarQube Cloud job skips its analysis                                              |
| `HOMEBREW_TAP_TOKEN` (secret)                                                | Pushing the `yapyap` and `yapyap@beta` casks to the `vascoguita/homebrew-yapyap` tap (see [Package managers](#package-managers))                                                         | The casks are generated but not published                                               |
| `SCOOP_BUCKET_TOKEN` (secret)                                                | Pushing the `yapyap` and `yapyap-beta` manifests to the `vascoguita/scoop-yapyap` bucket                                                                                                 | The Scoop manifests are generated but not published                                     |
| `WINGET_TOKEN` (secret)                                                      | Opening pull requests for `YapYap.YapYap` and `YapYap.YapYap.Beta` in `microsoft/winget-pkgs`, from a fork owned by the token's account                                                  | The winget manifests are generated but not proposed                                     |
| `NPM_TRUSTED_PUBLISHING` (variable), `NPM_TOKEN` (secret)                    | Publishing `@yapyap/extension-sdk` and `@yapyap/extension-sign` to npm with provenance: `true` once trusted publishing is set up on npm, or a granular token as the fallback             | The packages are released on GitHub but not published to npm                            |

Issues that need one of these are labelled `needs-maintainer`.

### Automation app

Pull requests opened with the workflow token never trigger workflows, so
release-please and the pinned-versions job use a GitHub App instead. Its
tokens expire after an hour, are limited to this repository, and its commits
are signed by GitHub. To set it up:

1. Create a private GitHub App owned by the maintainer, with webhooks off and
   these repository permissions: Contents, Pull requests and Issues (read and
   write). Nothing else.
2. Install it on `vascoguita/yapyap` only.
3. Generate a private key, store it, and delete the downloaded file:
   `gh secret set AUTOMATION_APP_PRIVATE_KEY --repo vascoguita/yapyap < key.pem`
4. Store the app's Client ID:
   `gh variable set AUTOMATION_APP_CLIENT_ID --repo vascoguita/yapyap --body <client id>`

To rotate the key, generate a new one, store it, then delete the old one in
the app's settings.

### Package repository key

The apt and dnf repositories (#344) are signed with an OpenPGP key that only
the maintainer holds. Create it on your own computer, never in CI:

```sh
export GNUPGHOME=$(mktemp -d)
gpg --batch --passphrase '' --quick-gen-key 'YapYap packages <packages@guita.org>' ed25519 sign 5y
gpg --armor --export-secret-keys | gh secret set PACKAGES_SIGNING_KEY --repo vascoguita/yapyap
gpg --fingerprint
rm -rf "$GNUPGHOME"
```

The current key, created on 2026-10-25 and expiring on 2031-10-24, has the
fingerprint `789C C8E9 F293 6C76 5224 918B 6773 94EA 2E01 721E`; the
install guide publishes it, so update both when the key changes.

Keep an offline backup before removing `GNUPGHOME` if you want to be able
to extend the key's expiry; otherwise rotate it by repeating these steps
before it expires. Users import the new public key from
`https://packages.guita.org/yapyap.gpg` (apt) or accept it in dnf. The
Cloudflare token for `CLOUDFLARE_API_TOKEN` is an account API token with the
**Pages Write** permission on the account that holds `guita.org`, and
nothing else.

### Package managers

After every release and beta, the **Distribute** workflow
(`.github/workflows/distribute.yml`) writes the Homebrew casks, the Scoop
manifests and the winget manifests from the release's `SHA256SUMS` (#345,
#346), checks the winget and Scoop ones against their schemas, and
publishes each where its token exists. A release updates both the release
and the beta packages; a beta updates only the beta ones. Each step needs
one thing from the maintainer:

1. **Homebrew.** Create the public repository `vascoguita/homebrew-yapyap`
   with a README, so it has a default branch. Create a fine-grained token
   for that repository only, with **Contents: read and write**, and store it:
   `gh secret set HOMEBREW_TAP_TOKEN --repo vascoguita/yapyap`.
2. **Scoop.** The same for the public repository `vascoguita/scoop-yapyap`,
   stored as `SCOOP_BUCKET_TOKEN`.
3. **winget.** Create a classic token with only the `public_repo` scope
   (Komac cannot open winget-pkgs pull requests with a fine-grained token) and store it
   as `WINGET_TOKEN`. The workflow uses [Komac](https://github.com/russellbanks/Komac),
   which forks `microsoft/winget-pkgs` under the token's account on first use
   and opens one pull request per package; winget's moderators review the
   first one of each package.

CI checks the casks with `brew style` and `brew audit` in Homebrew's Linux
container, so no macOS runner is needed, and the other manifests against the
winget 1.28.0 and Scoop schemas in `packaging/manifest-schemas/`
(`bash packaging/distribution/test.sh`). `winget validate` itself needs
Windows, so it runs only in winget's own pipeline, on the pull request.

To publish the npm packages (#477), sign in to npm with an account that owns
the `@yapyap` scope, and for each of `@yapyap/extension-sdk` and
`@yapyap/extension-sign` add a trusted publisher for the GitHub repository
`vascoguita/yapyap` and the workflow `release.yml`. A package must exist
before it can get a trusted publisher, so publish the first version of each
with a token, then switch: store a granular token with read and write
access to the two packages as `NPM_TOKEN`, merge their release PRs, then
add the trusted publishers, run
`gh variable set NPM_TRUSTED_PUBLISHING --body true --repo vascoguita/yapyap`,
and delete the `NPM_TOKEN` secret and the token.

## Extension marketplace

The marketplace (ADR 0014) lists the extensions in `marketplace/extensions/`, one
`<id>.json` per extension, and the pulled versions in `marketplace/revoked.json`.
The package repositories workflow builds `extensions/index.json` from them,
downloads and checks every archive, signs the index with
`EXTENSION_SIGNING_KEY`, and deploys it to packages.guita.org every Monday and
whenever `marketplace/` changes on `master`. The index expires 30 days after
it is signed, so a stopped schedule takes the marketplace down within a
month: re-run **Package repositories** by hand if it fails.

Official extensions are released on their own (#474), so listing a new
version takes no hand edits:

1. Merge the extension's release PR, `chore(<name>): release X.Y.Z` (see
   [Releases](#releases)). That tags `<name>-vX.Y.Z` and creates its release.
2. The release workflow builds and signs that extension alone, attaches
   `<id>-<version>.yapyap-extension` to the release, and opens a
   `chore(marketplace): list <name>-vX.Y.Z` PR. The PR adds the version to
   the entry, with the asset's URL, its SHA-256, the release notes, and the
   oldest YapYap that runs it, from `yapyap.minVersion` in the extension's
   `package.json`. Keep that field current when an extension starts to need
   a newer YapYap.
3. Review and merge that PR. Merging is the review: the index is signed and
   deployed again with the version in it. CI checks the entry, as
   `node scripts/src/bin/marketplace-index.ts marketplace` does locally.

To list a reviewed third-party version from an extension submission issue:

1. Download the archive, check its SHA-256 against the submission, and
   verify it: `node packages/extension-sign/src/bin/yapyap-extension-sign.ts
verify <file>` prints the signer, which must match the submission (and
   the entry's `signer` for later versions).
2. Review it against the checklist in
   [the extension guide](https://yapyap.guita.org/extensions/marketplace#the-review-checklist):
   unpack it and read every file, compare it with the tag in the
   repository, and check each capability, host and the privacy policy.
3. Upload the unchanged archive to the release that holds reviewed
   archives. Where that is is still to be decided (#419), so no
   third-party extension can be listed until then.
4. Open a pull request adding or updating `marketplace/extensions/<id>.json`
   with `review: "reviewed"`, the `repository`, and the version's `tag`,
   with `source` pointing at that asset. Link the submission.

To take an extension down, add the version, or `"*"` for all of them, to
`revoked.json` with the signer's fingerprint and a reason the user will
read, and merge it: the index is signed and deployed again at once. Keep
the entry, so the reason stays with the extension's history.

## Extension signing key rotation

First-party extensions are verified against public keys embedded in the app.
To rotate the key without breaking installed extensions:

1. Generate a new Ed25519 key pair offline:
   `openssl genpkey -algorithm ed25519 -out new.pem`, then
   `openssl pkey -in new.pem -pubout`. Never commit or log the private key.
2. Add the new public key to `TRUST_ANCHORS` in
   `packages/extension-sign/src/anchors.ts` (keep the old one) and ship that in
   a release.
3. In a later release, update the `EXTENSION_SIGNING_KEY` secret and the
   `EXTENSION_SIGNING_PUBLIC_KEY` variable, move the new key to the front of
   `TRUST_ANCHORS` (CI checks that the variable is the first anchor), and
   sign first-party extensions with the new key.
4. One release after that, remove the old public key from the anchors.

Keep a copy of the private key offline, such as in a password manager: the
secret cannot be read back. If the key is lost or leaks, there is no old key
to keep trusting: replace the first anchor, the secret and the variable in
one change (ADR 0016).

## Reporting bugs and security issues

Use the issue forms for bugs and features. Report vulnerabilities privately as
described in [SECURITY.md](SECURITY.md).

## Releases

Every stable release follows a beta (ADR 0003, #184). The release PR's
`Beta gate` check fails until a `vX.Y.Z-beta.N` pre-release of the same
version has been published. How long a beta stays out before the release is
the maintainer's call.

To cut a beta, run the **Beta release** workflow with the coming stable
version, from the Actions tab or with
`gh workflow run beta.yml --repo vascoguita/yapyap -f version=X.Y.Z`. It
numbers the next `vX.Y.Z-beta.N`, creates the GitHub pre-release from the
current `master`, and packages, smoke-tests and publishes it exactly like a
stable release (`publish.yml` is shared), except that betas skip the AUR.

[release-please](https://github.com/googleapis/release-please) keeps a release
PR open on `master` and updates it from Conventional Commits. Merging that PR
tags `vX.Y.Z`, updates `CHANGELOG.md` and creates the GitHub Release, which
starts the release build. Never tag by hand.

The first-party call recorder extension in `extensions/call-recorder` stays
in this repository, since it changes with the SDK and the host, but it has
releases of its own (#474). release-please keeps a release PR for it,
`chore(call-recorder): release X.Y.Z`, from the commits that touch its
folder. A `feat` raises the minor version, and it has its own
`CHANGELOG.md` and `call-recorder-vX.Y.Z` tags. The app's release leaves
its folder out and no longer carries it. The AI assistant is part of the
app and releases with it (ADR 0017). Merging an
extension's release PR publishes that extension alone (see
[Extension marketplace](#extension-marketplace)). There is no extension
beta: test it with a development build before merging.

The extension SDK (`packages/sdk`) and the signing CLI
(`packages/extension-sign`) are released the same way, for authors who
build extensions in their own repositories (#477): `chore(extension-sdk):
release X.Y.Z` and `chore(extension-sign): release X.Y.Z` PRs, with their own
`CHANGELOG.md` and `extension-sdk-vX.Y.Z` and `extension-sign-vX.Y.Z` tags.
Their commits stay in YapYap's own release too, since the app ships the
same code. Merging one publishes that package to npm from the release
workflow, with provenance (see [Package managers](#package-managers)), and
sets its version in `templates/extension/package.json`. The SDK's version
tells authors which host API they build against, so merge an SDK release
only once the YapYap release that brings its API is out, and name that
release in the SDK release's notes.

The release-please job runs only while the repository variable
`RELEASES_ENABLED` is `true`, as it is now. Every update of the release PR
runs the full check suite, which holds runners that feature PRs wait for, so
setting it to `false` pauses the release PR during busy stretches. Setting it
back to `true` (`gh variable set RELEASES_ENABLED --body true --repo
vascoguita/yapyap`) makes the next push to `master` open the release PR again
with every change since the last release.

Release notes are generated from commit subjects, and only `feat`, `fix`,
`perf` and `revert` commits appear in them. Each change appears once: the
release workflow merges the entry release-please writes for a commit with
the one for its pull request's merge commit (#358). A fix for a publicly known
vulnerability uses the `security` scope and names its advisory in the
subject, for example
`fix(security): validate extension manifests before parsing (GHSA-xxxx-xxxx-xxxx)`,
so the release notes list the CVE or GHSA ID of every vulnerability the
release fixes. If the advisory becomes public only after the release, add
its ID to that release's entry in `CHANGELOG.md` and to the GitHub Release
notes.

The release build (`.github/workflows/release.yml`) reuses the same packaging
(`package.yml`) and smoke tests (`smoke.yml`) as pull requests:

1. Every package format is built for every architecture, with the release
   stamped into the AppStream metainfo. Builds are signed and notarized only
   with the secrets that exist; missing ones produce a notice and unsigned
   builds.
2. Every package is installed and launched against the fake WhatsApp page.
3. The installers, the Flatpak bundles, the auto-update metadata
   (`latest*.yml` and `.blockmap` files), a CycloneDX SBOM and `SHA256SUMS`
   are attached to the release, with signed build provenance attestations.
4. A PKGBUILD and `.SRCINFO` for `yapyap-bin` are generated from the
   release's Debian packages, attached to the release, and pushed to the AUR
   when `AUR_SSH_KEY` exists. Pull requests build and install the same
   PKGBUILD in an Arch Linux container.
5. The Homebrew casks, the Scoop manifests and the winget manifests are
   generated from the release's `SHA256SUMS` and published where their
   tokens exist (see [Package managers](#package-managers)). Betas do the
   same for the beta packages.

The release page exists for about 40 minutes before its assets arrive, so the
updater must treat a release without update metadata as "no update yet".

The first release is v0.1.0 (`initial-version`). The release PR stays open
until the milestone that ships it is complete. Before 1.0, `feat` commits
bump the patch version. To ship a milestone release such as v0.2.0, add a
commit whose body has a `Release-As: 0.2.0` footer.
