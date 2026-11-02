const ENTRY = /^\* (.+?) (\(\[.*)$/;
const PULL_REQUEST = /\(\[#\d+\]\(https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+\)\)/;
const CLOSES = /, closes (.+)$/;
const ISSUE = /\[#\d+\]\(https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+\)/g;

interface Entry {
  readonly text: string;
  readonly refs: string;
}

/** The issue links an entry closes. */
const closedIssues = (refs: string): string[] => CLOSES.exec(refs)?.[1]?.match(ISSUE) ?? [];

/**
 * One line for every entry of a change: the merge commit's, which links the
 * pull request, with every issue any of them closes.
 */
function merged(entries: readonly [Entry, ...Entry[]]): string {
  const chosen = entries.find((entry) => PULL_REQUEST.test(entry.refs)) ?? entries[0];
  const issues = [...new Set(entries.flatMap((entry) => closedIssues(entry.refs)))];
  const closes = issues.length > 0 ? `, closes ${issues.join(', ')}` : '';
  return `* ${chosen.text} ${chosen.refs.replace(CLOSES, '')}${closes}`;
}

/** The section's lines with each change once, in the order they first appear. */
function mergeSection(lines: readonly string[]): string[] {
  const groups = new Map<string, [Entry, ...Entry[]] | string>();
  for (const [index, line] of lines.entries()) {
    const match = ENTRY.exec(line);
    if (match?.[1] === undefined || match[2] === undefined) {
      groups.set(`\u0000${String(index)}`, line);
    } else {
      const entry = { text: match[1], refs: match[2] };
      const group = groups.get(entry.text);
      groups.set(entry.text, Array.isArray(group) ? [...group, entry] : [entry]);
    }
  }
  return [...groups.values()].map((group) => (typeof group === 'string' ? group : merged(group)));
}

/**
 * A release-please changelog with each change listed once (#358). It lists
 * a change for its commit and again for its pull request's merge commit,
 * which takes the pull request's Conventional Commit title (ADR 0007). The
 * merged entry links the pull request and closes every issue either did.
 */
export function mergeDuplicates(changelog: string): string {
  const out: string[] = [];
  let section: string[] = [];
  for (const line of [...changelog.split('\n'), '']) {
    if (line.startsWith('* ')) {
      section.push(line);
    } else {
      out.push(...mergeSection(section), line);
      section = [];
    }
  }
  return out.slice(0, -1).join('\n');
}

/** GitHub's GraphQL API, the only one the cleanup calls. */
export interface GitHubApi {
  readonly graphql: (query: string, variables: object) => Promise<unknown>;
}

/**
 * GraphQL through `fetch`, failing on any error answer. Every call goes to
 * the one fixed endpoint, and values travel as typed variables, never in a
 * URL.
 */
export function githubApi(
  fetcher: (url: string, init: RequestInit) => Promise<Response>,
  token: string,
): GitHubApi {
  return {
    graphql: async (query, variables) => {
      const response = await fetcher('https://api.github.com/graphql', {
        method: 'POST',
        headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ query, variables }),
      });
      const answer = (await response.json()) as { data?: unknown; errors?: unknown[] };
      if (!response.ok || answer.errors !== undefined) {
        throw new Error(
          `GitHub answered ${String(response.status)}: ${JSON.stringify(answer.errors)}`,
        );
      }
      return answer.data;
    },
  };
}

/** The branch release-please keeps its release PR on (ADR 0007). */
export const RELEASE_BRANCH = 'release-please--branches--master--components--yapyap';

/** A release PR release-please keeps open: its branch, and the changelog it writes. */
export interface ReleaseTrack {
  readonly branch: string;
  readonly changelog: string;
}

const APP_TRACK: ReleaseTrack = { branch: RELEASE_BRANCH, changelog: 'CHANGELOG.md' };

/**
 * YapYap's own release PR, one for each first-party extension, which release
 * on their own (#474), and one for each package published to npm (#477).
 */
export const RELEASE_TRACKS: readonly ReleaseTrack[] = [
  APP_TRACK,
  ...['call-recorder'].map((name) => ({
    branch: `release-please--branches--master--components--${name}`,
    changelog: `extensions/${name}/CHANGELOG.md`,
  })),
  ...[
    ['extension-sdk', 'packages/sdk'],
    ['extension-sign', 'packages/extension-sign'],
  ].map(([component, path]) => ({
    branch: `release-please--branches--master--components--${String(component)}`,
    changelog: `${String(path)}/CHANGELOG.md`,
  })),
];

/** The open release PR, as the cleanup needs it. */
interface ReleasePullRequest {
  readonly id: string;
  readonly body: string;
  readonly headRefOid: string;
  readonly changelog: string;
  readonly track: ReleaseTrack;
}

const FIND = `query ($owner: String!, $name: String!, $branch: String!, $file: String!) {
  repository(owner: $owner, name: $name) {
    pullRequests(headRefName: $branch, states: OPEN, first: 1) {
      nodes { id body headRefOid }
    }
    object(expression: $file) { ... on Blob { text } }
  }
}`;

/**
 * The open release PR and its CHANGELOG.md, if there is one. release-please
 * reports a PR only when a push changed it, so the workflow looks it up.
 */
export async function findReleasePullRequest(
  api: GitHubApi,
  repository: string,
  track: ReleaseTrack = APP_TRACK,
): Promise<ReleasePullRequest | undefined> {
  const [owner, name] = repository.split('/');
  const data = (await api.graphql(FIND, {
    owner,
    name,
    branch: track.branch,
    file: `${track.branch}:${track.changelog}`,
  })) as {
    repository: {
      pullRequests: { nodes: { id: string; body: string; headRefOid: string }[] };
      object: { text?: string } | null;
    };
  };
  const [pr] = data.repository.pullRequests.nodes;
  return pr === undefined
    ? undefined
    : { ...pr, track, changelog: data.repository.object?.text ?? '' };
}

const COMMIT = `mutation ($input: CreateCommitOnBranchInput!) {
  createCommitOnBranch(input: $input) { commit { oid } }
}`;

const UPDATE = `mutation ($id: ID!, $body: String!) {
  updatePullRequest(input: { pullRequestId: $id, body: $body }) { clientMutationId }
}`;

/**
 * Lists each change once in the release PR's CHANGELOG.md and body, from
 * which release-please writes the release notes. The commit goes through
 * the GraphQL API, so GitHub signs it, and only onto the branch as it was
 * read. Returns whether anything changed.
 */
export async function mergeReleasePullRequest(
  api: GitHubApi,
  repository: string,
  pr: ReleasePullRequest,
): Promise<boolean> {
  const [changelog, body] = [mergeDuplicates(pr.changelog), mergeDuplicates(pr.body)];
  if (changelog !== pr.changelog) {
    const additions = [
      { path: pr.track.changelog, contents: Buffer.from(changelog).toString('base64') },
    ];
    const input = {
      branch: { repositoryNameWithOwner: repository, branchName: pr.track.branch },
      message: { headline: 'docs(changelog): list each change once' },
      expectedHeadOid: pr.headRefOid,
      fileChanges: { additions },
    };
    await api.graphql(COMMIT, { input });
  }
  if (body !== pr.body) {
    await api.graphql(UPDATE, { id: pr.id, body });
  }
  return changelog !== pr.changelog || body !== pr.body;
}
