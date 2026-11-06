# Repository scripts: notes for agents and contributors

These add to the repository's root `CLAUDE.md`, which applies here too.

- Scripts run under Node's type stripping, so only erasable TypeScript is
  allowed (no enums, no constructor parameter properties). `erasableSyntaxOnly`
  enforces this.
- SonarQube Cloud runs every rule as it ships (ADR 0010), so scripts in
  `scripts/src/bin/` take other programs' output on stdin instead
  of running them from `PATH`.
