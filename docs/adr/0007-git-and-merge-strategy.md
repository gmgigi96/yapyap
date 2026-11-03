# 0007. Git and merge strategy

- Status: Accepted
- Date: 2026-10-18

## Context

We want a history that reads as small, meaningful, signed commits grouped by
pull request, with `master` always green and releases fully automated.

## Decision

- The default branch is `master` (the maintainer's choice). Wherever project
  documents say "main branch", they mean `master`.
- **Rulesets on `master`**: pull request required, required status checks,
  signed commits required, no force push, no deletion, conversation
  resolution required. **Ruleset on tags** `v*`: no deletion, no update,
  creation restricted to release automation.
- **Required checks**: the CI workflow reports one check, `CI result`, which
  fails if any CI job failed or was cancelled and passes when each job
  passed or was skipped. The checks of the other workflows (CodeQL,
  dependency review, audit, PR title, docs build) stay required on their
  own. A new CI job joins `CI result`'s `needs`; the ruleset does not change.
- **What a pull request runs** (2026-10-22, to unblock CI as the
  bottleneck): a change to documentation only (`*.md`, `docs/`, issue
  templates) runs lint, typecheck and the docs build, and skips tests, E2E,
  mutation, SonarQube Cloud and packaging. A code change packages and
  smoke-tests one format per system (AppImage x64, NSIS x64, DMG); the full
  format and architecture matrix runs when packaging inputs change (package
  manifests, lockfile, electron-builder and Flatpak configuration, packaging
  and release scripts and workflows) and on every push to `master`. `scripts/src/ci/changes.ts` decides, with
  tests. Mutation testing runs on pull requests only, against the tests that
  import the mutated files. **"Require branches to be up to date" is off**,
  so a merge does not force every other pull request to rerun; the `master`
  run after each merge catches the rare conflict between two pull requests.
- **Releases are the hard gate, `master` is guarded after the fact**
  (amended 2026-11-04, #210). Both choices above began as a temporary
  shortcut until M7 and are now the long-term design: on a personal account
  GitHub offers no merge queue, and the up-to-date rule with the full matrix
  on every pull request would rebase and rerun every open pull request,
  Renovate's included, whenever anything merges. Instead:
  - every push to `master` runs everything, including the full packaging and
    smoke matrix, so a conflict between two pull requests shows within one
    merge and is fixed forward or reverted;
  - nothing reaches users without the full matrix: the release-please pull
    request changes package manifests, so it runs it, and betas and
    releases package and smoke-test every format before publishing, with a
    beta before every stable release (#184);
  - the merge script rebases a pull request that is behind `master` before
    merging it.

  Revisit this when the repository moves to an organization (use a merge
  queue that runs the full matrix on `merge_group`, which CI already
  listens to) or when several people merge (turn the up-to-date rule on).

- **Branches**: `type/short-description`, where `type` is a Conventional
  Commits type (`feat`, `fix`, `docs`, `ci`, `build`, `chore`, `refactor`,
  `test`, `perf`).
- **Commits**: Conventional Commits, enforced by commitlint locally and in CI
  on every commit of the PR. Each commit builds and passes tests on its own.
  All commits are signed; signing is never bypassed.
- **Merging**: a branch that conflicts with `master` is rebased onto it (and
  tidied if needed), force-pushed with `--force-with-lease`, and re-checked.
  It is merged with a **merge commit**
  (`gh pr merge --merge --delete-branch`). GitHub signs the merge commit, and
  the branch commits keep their own signatures. Squash and rebase merging are
  disabled in repository settings, because GitHub's rebase-merge re-creates
  commits and drops their signatures.
- **PR titles** follow Conventional Commits (checked in CI) and become the
  merge commit subject. release-please therefore lists a change twice, for
  its commit and its merge commit; the release workflow merges each pair
  into one entry, linking the pull request, in the release PR's changelog
  and body (#358).
- **Dependabot**: grouped weekly updates with a 3-day cooldown. Patch and
  minor updates get auto-merge (`gh pr merge --auto --merge`) once all checks
  pass.
- **Releases**: release-please keeps a release PR on `master`. Merging it tags
  `vX.Y.Z`, writes CHANGELOG and creates the GitHub Release. That triggers
  the release build. Nobody tags by hand.

## Consequences

- Required checks don't run on PRs opened with the default `GITHUB_TOKEN`.
  release-please therefore needs a GitHub App or fine-grained token
  (`AUTOMATION_TOKEN`, also used by the pinned-versions workflow) for its PR to be mergeable. Until one exists, the
  maintainer re-triggers checks by hand. This is tracked as a
  `needs-maintainer` issue.
