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
  no analysis) get no secrets, so their analysis fails and says why. Once
  their changes have been read, the maintainer pushes the branch to this
  repository and opens the pull request from there (CONTRIBUTING). A
  `workflow_run` workflow could analyze them with the token, but it brings
  their files into a job that holds secrets, which SonarQube Cloud reports
  as a vulnerability (`githubactions:S7631`); the maintainer chose the
  manual step over marking that finding as a false positive.
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
- **Quality profiles: Sonar's own, paired with that gate** (amended
  2026-11-04). TypeScript and JavaScript use the built-in "Sonar agentic
  AI" profile, made for the "Sonar way for Agentic AI" gate; every other
  language uses the organization's default, "Sonar way comprehensive". The
  Homebrew tap, `vascoguita/homebrew-yapyap`, uses the same gate and
  profiles, through SonarQube Cloud's automatic analysis, since it has no
  coverage to import. Until then the project used custom "YapYap strict" profiles,
  each Sonar way comprehensive plus every other rule of its language but
  eight that clash with the codebase's conventions (trailing commas and
  parenthesized parameters, which Prettier writes; per-file license headers;
  ternaries; `undefined` assignments; unions of more than two types; HTML
  resource bundles; and the word `master`). The maintainer chose Sonar's
  profiles instead, to keep the rules Sonar maintains for this gate rather
  than a set of its own, and the custom profiles were deleted. Sonar's
  profiles enable none of those eight rules.

- **Exceptions:** an issue is fixed, never accepted, even where the gate
  would pass, and not marked as a false positive either (the maintainer's
  choice, 2026-11-03): code that trips a rule is rewritten. Narrow per-file
  exceptions live in `sonar-project.properties`, each with its reason:
  console output and `PATH` lookups in command-line scripts, the main
  entry's promise chain (no top-level await), and two E2E rules the
  analyzer misreads for Playwright (assertions and conditional skips).
- **Required check:** SonarQube Cloud's own `SonarCloud Code Analysis`
  check, which it posts on every analyzed pull request, is
  required in `.github/rulesets/master.json`, pinned to SonarQube Cloud's
  GitHub App. The CI job (through `CI result`) was required first, added
  only once overall code passed the strict gate, so the backlog never
  blocked unrelated work. For that reason the job analyzes every pull
  request, even one that changes no code. The README shows the
  gate and the main measures as badges.

## Consequences

- Every pull request gets a quality gate result and a decoration with its new
  issues, coverage and duplication. A fork's waits for the maintainer to
  push its branch here.
- The CI job repeats the unit tests to produce coverage next to the scan;
  this costs about a minute and keeps the job self-contained.
- Sonar's profiles cannot be edited, so a rule that conflicts with a project
  convention is a question for the maintainer: change the convention, or
  bring back a custom profile with a reason here.
