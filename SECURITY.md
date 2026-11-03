# Security policy

YapYap runs next to private conversations, so we take security reports
seriously and handle them privately.

## Supported versions

Only the latest release receives security fixes. Self-updating builds
(AppImage, Windows installer, signed macOS builds) update automatically.
Other formats are updated through their package manager.

## Reporting a vulnerability

**Do not open a public issue.** Report vulnerabilities through GitHub's
[private vulnerability reporting](https://github.com/vascoguita/yapyap/security/advisories/new).

Please include:

- the affected version and package format (Flatpak, AppImage, DEB, RPM, Arch Linux,
  Windows installer or portable, macOS)
- steps to reproduce, or a proof of concept
- the impact as you understand it

You can expect an acknowledgement within 7 days and a status update at least
every 14 days until the report is resolved. We credit reporters in the
advisory unless they prefer otherwise.

Once a fix is released, the advisory is published, and the release notes in
[CHANGELOG.md](CHANGELOG.md) and on the GitHub Release list its CVE or GHSA
ID.

## Scope

In scope:

- the YapYap app
- release and update infrastructure

Out of scope: vulnerabilities in WhatsApp itself (report them to Meta's bug
bounty program).

The security design is documented in the
[architecture overview](https://yapyap.guita.org/architecture/) on the
documentation site.
