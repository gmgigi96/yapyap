import { appendFileSync, readFileSync } from 'node:fs';
import { changeScope } from '../ci/changes.ts';

// Usage: git diff --name-only <base>...HEAD | ci-changes.ts
// Pushes, merge groups and scheduled runs have no base to compare against,
// so the workflow pipes nothing in and everything runs.
const changed = readFileSync(0, 'utf8');
const { code, packaging } = changeScope(changed.split('\n'));
const outputs = `code=${String(code)}\npackaging=${packaging}\n`;
appendFileSync(process.env['GITHUB_OUTPUT'] ?? '/dev/stdout', outputs);
console.info(outputs.trim());
