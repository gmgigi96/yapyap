# CI, releases and repository automation: notes for agents and contributors

These add to the repository's root `CLAUDE.md`, which applies here too.

- The CI workflow's only required check is `CI result`. A new CI job must be
  added to its `needs`, or its failures will not block merging. A job that
  only matters for code or packaging gets `needs: changes` and a condition on
  `needs.changes.outputs` (ADR 0007). Required checks of other workflows
  live in `.github/rulesets/master.json`; re-apply it after changing it (see
  CONTRIBUTING). SonarQube Cloud's own check is required too, so the
  `SonarQube Cloud` job analyzes every pull request. Forks get no secrets,
  so their analysis fails until their branch is pushed here (CONTRIBUTING,
  ADR 0010).
- CI jobs set up pnpm, Node.js and the install with the local
  `.github/actions/setup` action after checkout; bump its action pins there.
  Vitest projects and the mutation config's test files both come from
  `vitest.projects.ts`.
- electron-builder skips code signing on `pull_request` events but treats any
  defined `CSC_LINK`, even an empty string, as a certificate path elsewhere.
  Never set signing variables to `''`; export them only when the secret exists.
  PR checks cannot catch this, so watch the first `master` run after changing
  packaging.
- Package and smoke workflows take a `scope` input: `representative` runs
  the always-on jobs, `full` adds the `*-full` jobs, which share their steps
  through YAML anchors. Add a new format or architecture to the right half.
- The Homebrew tap is its own repository, `vascoguita/homebrew-yapyap`,
  with its own checks; its casks come from `scripts/src/release/homebrew.ts`,
  never from edits there. The Distribute workflow proposes them as a pull
  request through the automation App, committed through GitHub's API so
  they are signed.
- Renovate (ADR 0020) updates every pinned version from
  `.github/renovate.json`, on the automation App's token, here and in the
  Homebrew tap. A pin it cannot
  find on its own, such as the Flatpak runtime or `engines.node`, needs a
  custom manager there. Dependabot only raises security alerts and updates.
