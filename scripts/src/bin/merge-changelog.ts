import {
  findReleasePullRequest,
  githubApi,
  mergeReleasePullRequest,
} from '../release/changelog.ts';
import { REPOSITORY } from '../release/releases.ts';

// Usage: merge-changelog.ts, with GITHUB_TOKEN set. Lists each change once in
// the open release PR (#358).
const api = githubApi(fetch, process.env['GITHUB_TOKEN'] ?? '');
const pr = await findReleasePullRequest(api, REPOSITORY);
const changed = pr !== undefined && (await mergeReleasePullRequest(api, REPOSITORY, pr));
console.info(changed ? 'Each change is listed once now.' : 'Nothing to merge.');
