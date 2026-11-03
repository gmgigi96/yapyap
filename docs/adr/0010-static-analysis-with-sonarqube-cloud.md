# 0010. Static analysis with SonarQube Cloud

- Status: Accepted
- Date: 2026-10-21

## Context

ESLint, CodeQL, Stryker and the 100% coverage gate (ADR 0005) each check one
thing. The maintainer wants one more layer on top of them: SonarQube Cloud,
with the strictest quality gate the project can keep green, and zero open
issues on both new and overall code (#185).

SonarQube Cloud's automatic analysis cannot import coverage reports, so the
analysis must run in CI.

## Decision

- **Where it runs:** the `SonarQube Cloud` job in `ci.yml`, on every pull
  request and every push to `master`. It runs `pnpm test:coverage`, then the
  official scan action pinned by commit SHA, and waits for the quality gate.
  The action is LGPL-3.0 and runs only in CI, so the dependency review allows
  it by name (ADR 0008, C17).
  Automatic analysis is turned off for the project. Dependabot has its own
  copy of the secret, so dependency updates are analyzed too. A run without
  `SONAR_TOKEN` fails rather than pass unanalyzed.
- **Pull requests from forks** (amended 2026-11-03, after #577 merged with
  no analysis) get no secrets, so CI leaves them to `sonar-fork.yml`. It
  runs on `workflow_run` once their CI ends, in this repository with the
  token, and never runs their code: it installs master's dependencies and
  takes master's `sonar-project.properties` (which can name programs the
  scanner runs) before checking out their files, then scans them with the
  coverage report from their CI run.
- **Scope:** `sonar-project.properties`. Test code (unit tests, E2E specs, the
  fake WhatsApp page) is analyzed with test rules and kept out of duplication
  and coverage. Coverage exclusions mirror `vitest.config.ts`, so Sonar and
  Vitest agree on 100%.
- **Quality gate "Sonar way for Agentic AI"** (built in), which checks new
  code: severity limits on new bugs, vulnerabilities, code smells and
  dependency issues, coverage of at least 80% and duplication of at most 3%.
  The project first cleared its backlog under a custom gate, "YapYap strict",
  that required zero issues, 100% coverage and A ratings on new and overall
  code. Once overall code passed it, the maintainer chose the built-in gate
  and the custom one was deleted (2026-10-22). Vitest still enforces 100%
  coverage (ADR 0005), so the gate's 80% is only a floor.
- **Quality profiles "YapYap strict"**, for TypeScript, JavaScript, CSS, HTML,
  GitHub Actions, YAML, JSON, XML, secrets and text. Each inherits Sonar way
  comprehensive, so new built-in rules arrive on their own, and also
  activates every other rule of its language except these:

  | Rule                                        | Why it is off                                                                                                                       |
  | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
  | S1537 (no trailing commas)                  | Prettier adds trailing commas (`trailingComma: all`); the two cannot both pass                                                      |
  | S3524 (no parentheses around one parameter) | Prettier always parenthesizes arrow function parameters                                                                             |
  | S1451, Web:HeaderCheck (file headers)       | The license lives in `LICENSE` and package metadata; per-file headers would repeat it hundreds of times                             |
  | S1774 (no ternary operator)                 | Ternaries are the idiomatic way to choose a value in TypeScript and JSX; ESLint already limits nesting                              |
  | S2138 (no `undefined` assignment)           | The codebase uses `undefined` for "absent" everywhere, as TypeScript's optional properties do; `null` is kept for JSON and DOM APIs |
  | S4622 (unions of at most two types)         | String literal unions such as `'system' \| 'light' \| 'dark'` are how the settings schema and IPC types are modelled                |
  | Web:InternationalizationCheck               | The app chrome is localized in TypeScript (#55), not through server-side resource bundles in HTML                                   |
  | text:S7036 (inclusive terminology)          | Every hit is the name of the default branch, `master`; renaming the branch is a separate decision                                   |

  S100 (function names) allows PascalCase as well, because Preact components
  and ESLint rule visitors (`Program`) must use it.

- **Exceptions:** an issue is fixed, or the rule is turned off above with a
  reason. Issues are never accepted, even where the gate would pass. Marking a
  false positive needs a comment that explains it. Narrow per-file
  exceptions live in `sonar-project.properties`, each with its reason:
  console output and `PATH` lookups in command-line scripts, the main
  entry's promise chain (no top-level await), the MCP server's loopback
  allowlist (hardcoded IP), and two E2E rules the
  analyzer misreads for Playwright (assertions and conditional skips).
- **Required check:** SonarQube Cloud's own `SonarCloud Code Analysis`
  check, which it posts on every analyzed pull request, forks included, is
  required in `.github/rulesets/master.json`, pinned to SonarQube Cloud's
  GitHub App. The CI job (through `CI result`) was required first, added
  only once overall code passed the strict gate, so the backlog never
  blocked unrelated work. For that reason the job analyzes every pull
  request, even one that changes no code. The README shows the
  gate and the main measures as badges.

## Consequences

- Every pull request gets a quality gate result and a decoration with its new
  issues, coverage and duplication. A fork's arrives a few minutes after its
  CI.
- The CI job repeats the unit tests to produce coverage next to the scan;
  this costs about a minute and keeps the job self-contained.
- A rule that conflicts with a project convention is turned off with a reason
  here rather than worked around in code.
