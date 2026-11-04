import { readFileSync } from 'node:fs';
import { findViolations, formatReport } from '../licenses/check.ts';

// Usage: pnpm licenses list --json | check-licenses.ts
// The package script pipes the report in, so this file runs no program itself.
const report: unknown = JSON.parse(readFileSync(0, 'utf8'));
const violations = findViolations(report);
console.info(formatReport(violations));
process.exitCode = Number(violations.length > 0);
