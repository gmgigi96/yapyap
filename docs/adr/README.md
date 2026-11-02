# Architecture Decision Records

Each ADR records one significant decision: its context, the decision, and its
consequences. ADRs are immutable once accepted; a change of direction is a new
ADR that supersedes the old one.

| ADR                                                   | Title                                              | Status             |
| ----------------------------------------------------- | -------------------------------------------------- | ------------------ |
| [0001](0001-process-model-and-security-boundaries.md) | Electron process model and security boundaries     | Accepted           |
| [0002](0002-toolchain-and-resolved-versions.md)       | Toolchain and resolved versions                    | Accepted           |
| [0003](0003-packaging-and-update-channels.md)         | Packaging and update channels                      | Accepted           |
| [0004](0004-extension-isolation-and-trust-model.md)   | Extension isolation and trust model                | Superseded by 0018 |
| [0005](0005-test-strategy.md)                         | Test strategy                                      | Accepted           |
| [0006](0006-settings-schema-and-migrations.md)        | Settings schema and migrations                     | Accepted           |
| [0007](0007-git-and-merge-strategy.md)                | Git and merge strategy                             | Accepted           |
| [0008](0008-requirement-conflicts.md)                 | Requirement conflicts and resolutions (living log) | Accepted           |
| [0009](0009-performance-budgets.md)                   | Performance budgets                                | Accepted           |
| [0010](0010-static-analysis-with-sonarqube-cloud.md)  | Static analysis with SonarQube Cloud               | Accepted           |
| [0011](0011-whatsapp-notifications.md)                | WhatsApp notifications                             | Accepted           |
| [0012](0012-translations.md)                          | Translations                                       | Accepted           |
| [0013](0013-in-chat-assistant-bar.md)                 | The in-chat assistant bar                          | Accepted           |
| [0014](0014-extension-marketplace.md)                 | The extension marketplace                          | Superseded by 0018 |
| [0015](0015-call-recording.md)                        | Call recording                                     | Superseded by 0018 |
| [0016](0016-extensions-not-plugins.md)                | Extensions, not plugins                            | Superseded by 0018 |
| [0017](0017-assistant-is-part-of-yapyap.md)           | The assistant is part of YapYap                    | Accepted           |
| [0018](0018-no-extensions.md)                         | No extensions, marketplace or call recording       | Accepted           |
| [0019](0019-mcp-server.md)                            | An MCP server for AI agents                        | Proposed           |

New ADRs copy [`template.md`](template.md) and take the next free number.
