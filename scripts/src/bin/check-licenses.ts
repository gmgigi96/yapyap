import { execFileSync } from 'node:child_process';
import { findViolations, formatReport } from '../licenses/check.ts';

const report: unknown = JSON.parse(
  execFileSync('pnpm', ['licenses', 'list', '--json'], { encoding: 'utf8' }),
);
const violations = findViolations(report);
console.info(formatReport(violations));
process.exitCode = Number(violations.length > 0);
