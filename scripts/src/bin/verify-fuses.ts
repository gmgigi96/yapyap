import { FuseV1Options, getCurrentFuseWire } from '@electron/fuses';
import { fuseMismatches } from '../packaging/fuses.ts';

const executables = process.argv.slice(2);
const wires = await Promise.all(executables.map((executable) => getCurrentFuseWire(executable)));
const failures = wires.flatMap((wire, index) =>
  fuseMismatches(wire, FuseV1Options).map(
    (mismatch) => `${String(executables[index])}: ${mismatch}`,
  ),
);
console.info(
  failures.join('\n') || `Fuses hardened in ${String(executables.length)} executable(s).`,
);
process.exitCode = Number(failures.length > 0 || executables.length === 0);
