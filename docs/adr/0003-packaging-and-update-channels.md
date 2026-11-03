# 0003. Packaging and update channels

- Status: Accepted
- Date: 2026-10-18

## Context

WhatsApp Web desktop users install software in very different ways. Some
package formats have their own update mechanism, and a self-updating app
inside them would conflict with it, break signatures, or fail silently.
Updates are a code-delivery channel, so they must be verified.

## Decision

### Formats

| OS      | Format                                   | Arch            | Built by                       | Updates                                         |
| ------- | ---------------------------------------- | --------------- | ------------------------------ | ----------------------------------------------- |
| Linux   | Flatpak (Electron BaseApp 26.08 + zypak) | x86_64, aarch64 | flatpak-builder                | System (Flathub / `flatpak update`)             |
| Linux   | AppImage                                 | x86_64, aarch64 | electron-builder               | **Self-update** (electron-updater)              |
| Linux   | DEB                                      | x64, arm64      | electron-builder               | System (apt)                                    |
| Linux   | RPM                                      | x86_64, aarch64 | electron-builder               | System (dnf/zypper)                             |
| Arch    | AUR `yapyap-bin`                         | x86_64, aarch64 | PKGBUILD generated per release | System (AUR helper)                             |
| Windows | NSIS installer                           | x64, arm64      | electron-builder               | **Self-update**                                 |
| Windows | Portable                                 | x64, arm64      | electron-builder               | Notice only, links to the release               |
| macOS   | Universal DMG + ZIP                      | arm64 + x64     | electron-builder               | **Self-update**, only when signed and notarized |

DEB, RPM and Arch users can also add YapYap's apt, dnf and pacman
repositories at `packages.guita.org` (#344, #350), in a stable and a beta
channel. The site is a
Cloudflare Pages project that holds only the signed indexes: every package
path redirects to the file on GitHub Releases, so the repositories need no
package host, have no download limits, and every download is counted with
the rest. The release and beta workflows rebuild and sign the indexes from
the published releases, keeping each channel's five latest versions, and
`packaging/repository/test.sh` installs, updates and switches channels on
clean Debian, Ubuntu, Fedora and Arch Linux containers in CI. The pacman
package is `yapyap-bin`, built from the release's `.deb` with the PKGBUILD
the AUR would get; betas get a pacman version such as `0.1.0beta.1`, which
sorts before `0.1.0`. Pages applies redirects before its own files, so each
pacman package, which shares a folder with the database and signatures, has
a redirect rule of its own.

Linux arm64 artifacts are built natively on `ubuntu-24.04-arm` runners.
Windows arm64 is cross-built on x64.

### Install-channel detection

Each package format is built in its own electron-builder invocation, which
stamps `installChannel` (`appimage`, `nsis`, `portable`, `dmg`, `deb`, `rpm`,
`aur` or `flatpak`) into the packaged `package.json` through
`extraMetadata`. At runtime the channel is cross-checked with environment
evidence: `FLATPAK_ID` and `/.flatpak-info` for Flatpak, `APPIMAGE` for
AppImage, `PORTABLE_EXECUTABLE_DIR` for portable, and the code-signing status
on macOS. The updater only starts when **both** the build marker and the
runtime evidence agree on a self-updating channel. Any mismatch
falls back to `manual`: no update checks at all. A pure function maps
`(marker, evidence) → policy`, with tests for every combination
(`src/main/updates/update-policy.ts`). The AUR package is repackaged from
the DEB, so it carries the `deb` marker; both are `system`. "Signed" on
macOS means a Developer ID signature, because electron-builder signs every
build ad hoc. Copy Diagnostics shows the policy and channel.

| Policy        | Behavior                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------ |
| `self-update` | electron-updater checks GitHub Releases, downloads, verifies and installs on restart with the user's consent |
| `notify`      | Portable build: checks the GitHub Releases API, shows "new version available" with a link, never downloads   |
| `system`      | Flatpak, DEB, RPM, AUR: no update checks. "About" says updates come from the system package manager.         |
| `manual`      | Development builds and any marker the evidence contradicts: no update checks; the user updates by hand       |

### Verification

- electron-updater verifies the SHA-512 of each artifact against `latest*.yml`.
- On Windows it verifies the Authenticode publisher (`publisherName`) when
  the build is signed. On macOS Squirrel.Mac verifies the code signature.
- Update metadata is served only over HTTPS from GitHub Releases. Downgrades
  are refused, and pre-releases reach only users who opt in to beta updates
  (#184).
- **Betas before every stable release (#184):** each `vX.Y.Z` follows at
  least one `vX.Y.Z-beta.N` GitHub pre-release. The release PR carries a
  `Beta gate` check that fails until a beta of its version has been
  published. It enforced a 3-day wait until 2026-10-25, when the maintainer
  chose to decide how long each beta stays out instead. Betas come from the
  manual **Beta release** workflow
  (`beta.yml`), which shares packaging, smoke tests and publishing
  (`publish.yml`) with stable releases.
- **What a package holds** (amended 2026-11-03): only `out/`. electron-vite
  bundles the main process's dependencies like the renderer's, so no
  `node_modules` ship; the app archive went from 61 MB to 14 MB. Each
  bundle's `licenses.md` keeps the bundled packages' license notices.
- Every release asset is listed in `SHA256SUMS`, covered by a build provenance
  attestation (`actions/attest-build-provenance`), and accompanied by a
  CycloneDX SBOM.

### Signing

- macOS signing and notarization run only when `APPLE_*` secrets exist.
  Unsigned macOS builds ship, but their updater policy is `notify`.
- Windows Authenticode signing runs only when `WIN_CSC_*` secrets exist.
- AUR publishing runs only when `AUR_SSH_KEY` exists.
- Missing secrets skip their step with a notice in the job summary. They
  never fail the build.

### Desktop integration

The AppStream metainfo `org.guita.YapYap.metainfo.xml` and the
desktop entry `org.guita.YapYap.desktop` are validated in CI with
`appstreamcli validate` and `desktop-file-validate`. The Flatpak manifest
follows Flathub's requirements: no `--filesystem=home`; notification, tray
and background portals; `--talk-name=org.kde.StatusNotifierWatcher` for the
tray.

### Smoke tests

Each built artifact is installed on a clean runner (`dpkg -i` on Ubuntu,
`dnf install` in a Fedora container, `flatpak install` of the bundle,
`makepkg -si` in an Arch container, a silent NSIS install, a DMG mount) and
launched with a loopback fake WhatsApp origin (see
[ADR 0005](0005-test-strategy.md)). The test asserts that the window opens and
the fake page loads.

## Consequences

- There are three update behaviors to test. Most of the logic is in pure
  functions.
- Without paid signing certificates, macOS users won't get auto-updates and
  Windows users will see SmartScreen warnings. Both are tracked as
  `needs-maintainer` issues.
