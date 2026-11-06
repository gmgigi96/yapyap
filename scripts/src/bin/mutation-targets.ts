import { readFileSync } from 'node:fs';
import { mutationShard, mutationTargets } from '../mutation/scope.ts';

// Usage: git ls-files | mutation-targets.ts --shard 3/16
// The workflow pipes in the files to consider: every tracked one for the
// nightly run, or those a pull request changed. `--shard 3/16` keeps the
// third sixteenth of the in-scope modules among them.
const args = process.argv.slice(2);
const which = args[args.indexOf('--shard') + 1] ?? '';
const sharded = args.includes('--shard');
const files = readFileSync(0, 'utf8').split('\n');
const [shard = 0, shards = 0] = which.split('/').map(Number);
process.stdout.write(
  `${(sharded ? mutationShard(files, shard, shards) : mutationTargets(files)).join(',')}\n`,
);
