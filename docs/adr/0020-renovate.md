# 0020. Renovate keeps pinned versions current

- Status: Accepted
- Date: 2026-11-02

## Context

YapYap pins every version exactly (ADR 0002). Two tools kept those pins
current. Dependabot updated the npm workspace, Wrangler and GitHub Actions.
A script of our own (`scripts/src/pinned-versions/`, run weekly) covered
what Dependabot cannot track: the Node.js LTS in `.nvmrc` and the root
`engines`, and the Flatpak runtime with its Electron BaseApp. That meant two
configs, two kinds of bot PR, and an updater we had to test and maintain.

Renovate tracks all of these in one config: its `nvm` manager and
`node-version` datasource follow Node.js LTS releases, and custom managers
follow anything a regular expression can find.

## Decision

- Renovate updates every pinned version. Its config is
  `.github/renovate.json`; CI checks it with the same Renovate the workflow
  runs.
- It runs from `.github/workflows/renovate.yml`, daily, on a token from the
  automation GitHub App. No third-party app gets access to the repository,
  and Renovate's PRs trigger CI like a person's. Its commits go through
  GitHub's API, so GitHub signs them, as the `master` ruleset requires.
- It keeps Dependabot's behaviour:
  - new updates only on Mondays;
  - a release must be 3 days old;
  - npm and GitHub Actions minor and patch updates come grouped, and merge
    themselves once the required checks pass, with a merge commit;
  - versions are bumped exactly;
  - PRs have the `type: dependencies` label and use the `build` (npm) and
    `ci` (Actions, Wrangler) commit types.
- Custom managers in the config replace our script:
  - `engines.node` follows `.nvmrc`, and both move in one PR, to Node.js LTS
    releases only;
  - the Flatpak runtime and Electron BaseApp move together, to the newest
    `branch/NN.NN` of Flathub's BaseApp, which a custom datasource reads
    from GitHub's API.
- Renovate also refreshes the digests of the smoke jobs' container images.
  It never proposes a new Fedora release, whose next number is a
  development release before it is stable, and never a new major version of
  a pnpm override, which pins a transitive dependency for a reason a person
  must check.
- Dependabot's version updates and the pinned-versions script are gone.
  Dependabot alerts and security updates stay on.

Where ADR 0002, 0007 and 0010 mention Dependabot's version updates or the
pinned-versions workflow, they describe what YapYap used to do.

## Consequences

- One updater, one config, and no updater code of our own to test.
- The automation App needs more permissions: Workflows (read and write),
  so Renovate can update action pins, and Commit statuses (read and write)
  and Checks (read), so it can follow the checks of its own PRs.
- Renovate's own version is pinned in two places, the workflow and the CI
  check. Both are in one `Renovate` group, so they update together.
- A broken config fails the `Renovate config` CI job, before it reaches
  `master`.
