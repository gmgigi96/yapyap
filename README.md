<p align="center"><img src="apps/desktop/build/icon.svg" alt="YapYap icon" width="96" height="96"></p>

# YapYap

[![CI](https://github.com/vascoguita/yapyap/actions/workflows/ci.yml/badge.svg)](https://github.com/vascoguita/yapyap/actions/workflows/ci.yml)
[![CodeQL](https://github.com/vascoguita/yapyap/actions/workflows/codeql.yml/badge.svg)](https://github.com/vascoguita/yapyap/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/vascoguita/yapyap/badge)](https://scorecard.dev/viewer/?uri=github.com/vascoguita/yapyap)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/15759/badge)](https://www.bestpractices.dev/projects/15759)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Downloads](https://img.shields.io/endpoint?url=https%3A%2F%2Fyapyap.guita.org%2Fdownloads-badge.json)](https://github.com/vascoguita/yapyap/releases)

[![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=vascoguita_yapyap&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=vascoguita_yapyap)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=vascoguita_yapyap&metric=coverage)](https://sonarcloud.io/summary/new_code?id=vascoguita_yapyap)
[![Reliability](https://sonarcloud.io/api/project_badges/measure?project=vascoguita_yapyap&metric=reliability_rating)](https://sonarcloud.io/summary/new_code?id=vascoguita_yapyap)
[![Security](https://sonarcloud.io/api/project_badges/measure?project=vascoguita_yapyap&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=vascoguita_yapyap)
[![Maintainability](https://sonarcloud.io/api/project_badges/measure?project=vascoguita_yapyap&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=vascoguita_yapyap)
[![Duplicated lines](https://sonarcloud.io/api/project_badges/measure?project=vascoguita_yapyap&metric=duplicated_lines_density)](https://sonarcloud.io/summary/new_code?id=vascoguita_yapyap)
[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=vascoguita_yapyap&metric=bugs)](https://sonarcloud.io/summary/new_code?id=vascoguita_yapyap)
[![Vulnerabilities](https://sonarcloud.io/api/project_badges/measure?project=vascoguita_yapyap&metric=vulnerabilities)](https://sonarcloud.io/summary/new_code?id=vascoguita_yapyap)
[![Code smells](https://sonarcloud.io/api/project_badges/measure?project=vascoguita_yapyap&metric=code_smells)](https://sonarcloud.io/summary/new_code?id=vascoguita_yapyap)
[![Technical debt](https://sonarcloud.io/api/project_badges/measure?project=vascoguita_yapyap&metric=sqale_index)](https://sonarcloud.io/summary/new_code?id=vascoguita_yapyap)
[![Lines of code](https://sonarcloud.io/api/project_badges/measure?project=vascoguita_yapyap&metric=ncloc)](https://sonarcloud.io/summary/new_code?id=vascoguita_yapyap)

A fast, private desktop client for WhatsApp Web, for Linux, Windows and
macOS, with a built-in AI assistant that helps you write: reply ideas,
summaries, rewrites and catch-ups, right above the message box, with a
private model on your computer or the AI service you choose.

<p align="center"><img src="docs/public/screenshots/main.webp" alt="YapYap's main window: the Personal and Work accounts in a sidebar, beside WhatsApp with an open chat" width="800"></p>

> **YapYap is unofficial.** It is not affiliated with, endorsed by, or
> sponsored by WhatsApp or Meta. "WhatsApp" is a trademark of its owner.
> YapYap loads the official WhatsApp Web in a hardened desktop shell. It does
> not reimplement WhatsApp's protocol and does not automate your account.

## Install

Download YapYap for Linux, Windows or macOS from the
[releases page](https://github.com/vascoguita/yapyap/releases), or add the
apt, dnf or pacman repository at `packages.guita.org`, as the
[install guide](https://yapyap.guita.org/guide/install) explains, then
[get started](https://yapyap.guita.org/guide/get-started) in six steps. Each
release's changes are in [`CHANGELOG.md`](CHANGELOG.md).

## Status

YapYap is young and not yet at 1.0. Follow what comes next on the
[project board](https://github.com/users/vascoguita/projects/5) and in
[`docs/progress.md`](docs/progress.md).

## Highlights

- A built-in AI assistant above the message box: it suggests replies,
  writes the message you describe, rewrites your draft in another tone or
  language, sums up a chat, and catches you up on unread chats. Use a
  private model that runs on your computer, a model server you already
  run, or Claude or OpenAI with your own key. It reads a chat only once you
  allow it there, shows exactly what it sends, and never sends a message
  on its own.
- Multiple accounts with fully isolated sessions
- Native notifications, tray or menu bar with unread counts, and do-not-disturb
- Recovery tools that fix a stuck session without logging you out
- No telemetry

## Documentation

https://yapyap.guita.org/

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the
[Architecture Decision Records](docs/adr/README.md). Get help through
[SUPPORT.md](SUPPORT.md), and report vulnerabilities privately as described in
[SECURITY.md](SECURITY.md).

## Support YapYap

YapYap is free, with no ads and no telemetry. If it is useful to you, you can
[sponsor its development](https://github.com/sponsors/vascoguita).
Sponsorships pay for what building YapYap costs:

- **Development tools:** a Claude subscription for AI-assisted development.
  A higher plan means fewer pauses when the usage limit runs out.
- **Code signing:** a Windows certificate, so YapYap installs there without
  a security warning, as it already does on macOS.

## Supporters

YapYap's development is supported by [Ensita](https://www.ensita.org/), a
nonprofit that builds free, open-source apps that keep your data yours, and
mentors new developers.

## License

[MIT](LICENSE) © Vasco Guita
