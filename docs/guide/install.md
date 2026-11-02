# Install YapYap

YapYap is free for Linux, Windows and macOS. The button picks the right
download for your computer:

<DownloadButton />

On Linux, the repositories below are the easiest way. Flatpak and AppImage
files are on each [release](https://github.com/vascoguita/yapyap/releases/latest),
and [All formats](#all-formats) lists everything else.

## Linux repositories {#linux-repositories}

On Debian, Ubuntu, Fedora and Arch Linux, add YapYap's repository once and your package
manager installs and updates YapYap like any other app. The repositories at
`packages.guita.org` are signed with YapYap's key, and the packages
themselves download from YapYap's GitHub releases.

YapYap's repository key has this fingerprint; after importing it, you can
compare it with `gpg --show-keys /etc/apt/keyrings/yapyap.gpg` (apt) or
`rpm -qi gpg-pubkey-2e01721e` (dnf):

```
789C C8E9 F293 6C76 5224  918B 6773 94EA 2E01 721E
```

::: code-group

```sh [Debian and Ubuntu]
sudo install -d -m 0755 /etc/apt/keyrings
sudo curl -fsSLo /etc/apt/keyrings/yapyap.gpg https://packages.guita.org/yapyap.gpg
sudo curl -fsSLo /etc/apt/sources.list.d/yapyap.sources https://packages.guita.org/yapyap.sources
sudo apt update
sudo apt install yapyap
```

```sh [Fedora]
sudo dnf config-manager addrepo --from-repofile=https://packages.guita.org/yapyap.repo
sudo dnf install YapYap
```

```sh [Arch Linux (x86_64)]
curl -fsSL https://packages.guita.org/yapyap.asc -o /tmp/yapyap.asc
sudo pacman-key --add /tmp/yapyap.asc
sudo pacman-key --lsign-key 789CC8E9F2936C765224918B677394EA2E01721E
curl -fsSL https://packages.guita.org/yapyap.pacman.conf | sudo tee -a /etc/pacman.conf
sudo pacman -Syu yapyap-bin
```

:::

On Fedora, dnf asks you to trust YapYap's key the first time, and stops
instead of using the repository if its signature ever fails to check. On
Arch Linux, the repository requires signatures on its database and every
package, even where pacman's defaults would accept an unsigned database.

**Betas.** To get betas as well as releases, use `yapyap-beta.sources`,
`yapyap-beta.repo` or `yapyap-beta.pacman.conf` instead. You move to each release once it is newer than
your beta. To go back to releases only, swap the file back; your package
manager offers the next release when it comes out.

Both channels keep their five latest versions, so you can install an older
one to roll back.

## Homebrew, winget and Scoop {#package-managers}

Homebrew on macOS, and winget and Scoop on Windows, are coming. YapYap's
release workflow is ready for them, and they start with the first release
after they are set up. Like the Linux repositories, they download YapYap
from its GitHub releases. Until then, use the download button above.

Once they are available, these commands will install YapYap; the beta
packages (`yapyap@beta`, `YapYap.YapYap.Beta` and `yapyap-beta`) get each
beta and each release:

::: code-group

```sh [Homebrew]
brew tap vascoguita/yapyap
brew trust vascoguita/yapyap
brew install --cask yapyap
```

```sh [winget]
winget install YapYap.YapYap
```

```sh [Scoop]
scoop bucket add yapyap https://github.com/vascoguita/scoop-yapyap
scoop install yapyap/yapyap
```

:::

Homebrew installs the same signed and notarized build as the DMG. Scoop
installs the portable build, which Scoop updates.

## All formats {#all-formats}

YapYap is available in these formats:

| Platform       | Format                           | Updates                                  |
| -------------- | -------------------------------- | ---------------------------------------- |
| Linux          | Flatpak bundle (x86_64, aarch64) | Download each release; Flathub is coming |
| Linux          | AppImage (x86_64, aarch64)       | Built-in updater                         |
| Debian, Ubuntu | DEB, or the apt repository       | Through apt                              |
| Fedora         | RPM, or the dnf repository       | Through dnf                              |
| openSUSE       | RPM                              | Download each release                    |
| Arch Linux     | The pacman repository            | Through pacman                           |
| Windows        | Installer (x64, arm64)           | Built-in updater                         |
| Windows        | Portable (x64, arm64)            | Notifies you of new versions             |
| Windows        | winget, Scoop (coming)           | Through winget or Scoop                  |
| macOS          | Universal DMG                    | Built-in updater                         |
| macOS          | Homebrew cask (coming)           | Through Homebrew                         |

Releases are published on
[GitHub](https://github.com/vascoguita/yapyap/releases).

On Arch Linux, use the [pacman repository](#linux-repositories), or download
`yapyap-bin.PKGBUILD` from a release, save it as `PKGBUILD` in an empty
folder, and run `makepkg -si` there. YapYap will be published to the AUR as
`yapyap-bin` once AUR account registration reopens.

## First launch on Windows {#unsigned}

YapYap's macOS builds are signed with a Developer ID and notarized by
Apple, so they open normally and update themselves. Its Windows builds are
not code-signed yet: a signing certificate costs money every year, and
YapYap is free. Windows warns you the first time you open it. Before you
allow it, you can
[check that your download is genuine](#verify-a-download).
[Sponsoring YapYap](https://github.com/sponsors/vascoguita) helps pay for
signing.

SmartScreen shows "Windows protected your PC". Click **More info**, then
**Run anyway**. YapYap still updates itself, and checks each update's hash
before installing it.

Linux packages need none of this.

## Verify a download

Every release includes `SHA256SUMS`, a CycloneDX software bill of materials,
and signed build provenance attestations, so you can check that a file is
exactly what YapYap's release workflow built:

```sh
sha256sum --check --ignore-missing SHA256SUMS
gh attestation verify YapYap-<version>-linux-x86_64.AppImage --repo vascoguita/yapyap
```

Releases from v0.2.0 on also carry the signed provenance itself, as
`yapyap-v<version>.sigstore.json` (a Sigstore bundle) and
`yapyap-v<version>.intoto.jsonl` (its in-toto envelope), so you can check a
file offline or with other tools:

```sh
gh attestation verify YapYap-<version>-linux-x86_64.AppImage --repo vascoguita/yapyap \
  --bundle yapyap-v<version>.sigstore.json
```

## Beta versions {#betas}

Every release is first published as a beta, so testers can catch problems
before everyone gets the update. Betas are
pre-releases on the
[releases page](https://github.com/vascoguita/yapyap/releases), tagged like
`v0.2.0-beta.1`, and are built, tested and signed like releases.

- **AppImage, Windows installer and portable, macOS:** turn on **Get beta
  updates** under Settings → General. YapYap then offers or announces each
  beta as it does releases. Turning it off never goes back to an older
  version: you keep the beta until the next release.
- **Flatpak, DEB, RPM and Arch Linux:** these get updates from your system,
  so the setting isn't there. Download the beta's package from its
  pre-release and install it by hand; the next release replaces it.

Found a problem? [Open an issue](https://github.com/vascoguita/yapyap/issues/new/choose)
and paste **Help → Copy Diagnostics**, which names the beta you run.

## Flatpak permissions

The Flatpak runs in a sandbox with only the access it needs:

| Permission                                | Why                                                        |
| ----------------------------------------- | ---------------------------------------------------------- |
| Network                                   | WhatsApp Web and extension connections                     |
| Wayland, or X11 as a fallback; GPU        | Drawing the window with hardware acceleration              |
| PulseAudio                                | Voice and video calls, voice messages, notification sounds |
| Notifications and StatusNotifier on D-Bus | Native notifications and the tray icon                     |
| Downloads folder                          | Saving files there automatically when you turn that on     |

Everything else, such as choosing where to save a file or picking a screen to
share, goes through desktop portals, so YapYap never sees the rest of your files.
