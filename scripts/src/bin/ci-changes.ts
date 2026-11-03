import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { changeScope } from '../ci/changes.ts';

// Pushes, merge groups and scheduled runs have no base to compare against.
const base = process.env['BASE_SHA'] ?? '';
const changed =
  base === ''
    ? ''
    : execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' });
const { code, packaging } = changeScope(changed.split('\n'));
const outputs = `code=${String(code)}\npackaging=${packaging}\n`;
appendFileSync(process.env['GITHUB_OUTPUT'] ?? '/dev/stdout', outputs);
console.info(outputs.trim());
