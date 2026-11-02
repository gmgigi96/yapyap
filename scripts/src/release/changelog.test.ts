import { describe, expect, it, vi } from 'vitest';
import {
  githubApi,
  mergeDuplicates,
  mergeReleasePullRequest,
  findReleasePullRequest,
  RELEASE_BRANCH,
  RELEASE_TRACKS,
  type GitHubApi,
} from './changelog.ts';

const APP = { branch: RELEASE_BRANCH, changelog: 'CHANGELOG.md' };

const ISSUES = 'https://github.com/vascoguita/yapyap/issues';
const COMMITS = 'https://github.com/vascoguita/yapyap/commit';
const pr = (n: number) => `[#${String(n)}](${ISSUES}/${String(n)})`;
const sha = (s: string) => `[${s}](${COMMITS}/${s})`;

describe('mergeDuplicates', () => {
  it('lists a change once, with its pull request and the issues it closes', () => {
    const changelog = [
      '## 0.1.1 (2026-10-25)',
      '',
      '### Bug Fixes',
      '',
      `* **permissions:** let WhatsApp ask (${sha('aaa1111')}), closes ${pr(363)}`,
      `* **permissions:** let WhatsApp ask (${pr(364)}) (${sha('bbb2222')})`,
      `* **autostart:** keep the login entry (${pr(365)}) (${sha('ccc3333')})`,
      `* **autostart:** keep the login entry (${sha('ddd4444')}), closes ${pr(362)}, ${pr(361)}`,
      '',
    ].join('\n');
    expect(mergeDuplicates(changelog)).toBe(
      [
        '## 0.1.1 (2026-10-25)',
        '',
        '### Bug Fixes',
        '',
        `* **permissions:** let WhatsApp ask (${pr(364)}) (${sha('bbb2222')}), closes ${pr(363)}`,
        `* **autostart:** keep the login entry (${pr(365)}) (${sha('ccc3333')}), closes ${pr(362)}, ${pr(361)}`,
        '',
      ].join('\n'),
    );
  });

  it('keeps entries that appear once, and lines that are not entries, as they are', () => {
    const changelog = [
      '### Features',
      '',
      `* **docs:** count downloads (${sha('eee5555')})`,
      '* a line without links',
      `* **docs:** count downloads, again (${sha('fff6666')}), closes ${pr(347)}`,
      '',
      '---',
    ].join('\n');
    expect(mergeDuplicates(changelog)).toBe(changelog);
  });

  it('keeps each section apart, even when two list the same text', () => {
    const changelog = [
      '### Features',
      `* same text (${sha('aaa1111')})`,
      '### Bug Fixes',
      `* same text (${sha('bbb2222')})`,
    ].join('\n');
    expect(mergeDuplicates(changelog)).toBe(changelog);
  });

  it('merges entries without a pull request into the first, with their issues', () => {
    const changelog = [
      `* **ci:** a change (${sha('aaa1111')}), closes ${pr(1)}`,
      `* **ci:** a change (${sha('bbb2222')}), closes ${pr(2)}`,
    ].join('\n');
    expect(mergeDuplicates(changelog)).toBe(
      `* **ci:** a change (${sha('aaa1111')}), closes ${pr(1)}, ${pr(2)}`,
    );
  });

  it('does not change a release-please changelog already free of duplicates', () => {
    const changelog = `# Changelog\n\n## 0.1.0\n\n### Features\n\n* **a:** b (${pr(1)}) (${sha('aaa1111')})\n`;
    expect(mergeDuplicates(mergeDuplicates(changelog))).toBe(changelog);
  });
});

describe('githubApi', () => {
  it('posts GraphQL with the token, and fails on an error answer', async () => {
    const fetcher = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(new Response('{"data":{"ok":true}}', { status: 200 })),
    );
    const api = githubApi(fetcher, 'secret');
    expect(await api.graphql('query { ok }', { a: 1 })).toEqual({ ok: true });
    expect(fetcher.mock.calls[0]).toEqual([
      'https://api.github.com/graphql',
      {
        method: 'POST',
        headers: { accept: 'application/vnd.github+json', authorization: 'Bearer secret' },
        body: '{"query":"query { ok }","variables":{"a":1}}',
      },
    ]);
    fetcher.mockResolvedValueOnce(new Response('{"errors":[{"message":"no"}]}', { status: 200 }));
    await expect(api.graphql('q', {})).rejects.toThrow('GitHub answered 200: [{"message":"no"}]');
    fetcher.mockResolvedValueOnce(new Response('{}', { status: 401 }));
    await expect(api.graphql('q', {})).rejects.toThrow('GitHub answered 401');
  });
});

describe('findReleasePullRequest', () => {
  it('finds the open release PR and its changelog, if there is one', async () => {
    const graphql = vi.fn<GitHubApi['graphql']>(() =>
      Promise.resolve({
        repository: {
          pullRequests: { nodes: [{ id: 'PR_1', body: 'b', headRefOid: 'head1' }] },
          object: { text: 'c' },
        },
      }),
    );
    expect(await findReleasePullRequest({ graphql }, 'o/r')).toEqual({
      id: 'PR_1',
      body: 'b',
      headRefOid: 'head1',
      changelog: 'c',
      track: APP,
    });
    expect(graphql.mock.calls[0]?.[1]).toEqual({
      owner: 'o',
      name: 'r',
      branch: RELEASE_BRANCH,
      file: `${RELEASE_BRANCH}:CHANGELOG.md`,
    });
    graphql.mockResolvedValueOnce({ repository: { pullRequests: { nodes: [] }, object: null } });
    expect(await findReleasePullRequest({ graphql }, 'o/r')).toBeUndefined();
    graphql.mockResolvedValueOnce({
      repository: {
        pullRequests: { nodes: [{ id: 'PR_1', body: 'b', headRefOid: 'h' }] },
        object: null,
      },
    });
    expect((await findReleasePullRequest({ graphql }, 'o/r'))?.changelog).toBe('');
  });

  it('reads an extension’s release PR and its own changelog', async () => {
    const graphql = vi.fn<GitHubApi['graphql']>(() =>
      Promise.resolve({ repository: { pullRequests: { nodes: [] }, object: null } }),
    );
    const recorder = RELEASE_TRACKS.find(({ branch }) => branch.endsWith('--call-recorder'));
    expect(recorder).toEqual({
      branch: 'release-please--branches--master--components--call-recorder',
      changelog: 'extensions/call-recorder/CHANGELOG.md',
    });
    expect(RELEASE_TRACKS.map(({ changelog }) => changelog)).toEqual([
      'CHANGELOG.md',
      'extensions/call-recorder/CHANGELOG.md',
      'packages/sdk/CHANGELOG.md',
      'packages/extension-sign/CHANGELOG.md',
    ]);
    expect(RELEASE_TRACKS.find(({ changelog }) => changelog.startsWith('packages/sdk'))).toEqual({
      branch: 'release-please--branches--master--components--extension-sdk',
      changelog: 'packages/sdk/CHANGELOG.md',
    });
    await findReleasePullRequest({ graphql }, 'o/r', recorder);
    expect(graphql.mock.calls[0]?.[1]).toMatchObject({
      branch: 'release-please--branches--master--components--call-recorder',
      file: 'release-please--branches--master--components--call-recorder:extensions/call-recorder/CHANGELOG.md',
    });
  });
});

describe('mergeReleasePullRequest', () => {
  const duplicated = [
    `* **a:** b (${sha('aaa1111')}), closes ${pr(1)}`,
    `* **a:** b (${pr(2)}) (${sha('bbb2222')})`,
  ].join('\n');
  const once = `* **a:** b (${pr(2)}) (${sha('bbb2222')}), closes ${pr(1)}`;

  it('commits the merged changelog on top of the branch it read, and fixes the body', async () => {
    const graphql = vi.fn<GitHubApi['graphql']>(() => Promise.resolve({}));
    const release = {
      id: 'PR_1',
      body: `Notes\n${duplicated}`,
      headRefOid: 'head1',
      changelog: duplicated,
      track: { branch: 'release-please--x', changelog: 'extensions/x/CHANGELOG.md' },
    };
    expect(await mergeReleasePullRequest({ graphql }, 'o/r', release)).toBe(true);
    expect(graphql.mock.calls[0]?.[1]).toEqual({
      input: {
        branch: { repositoryNameWithOwner: 'o/r', branchName: 'release-please--x' },
        message: { headline: 'docs(changelog): list each change once' },
        expectedHeadOid: 'head1',
        fileChanges: {
          additions: [
            {
              path: 'extensions/x/CHANGELOG.md',
              contents: Buffer.from(once).toString('base64'),
            },
          ],
        },
      },
    });
    expect(graphql.mock.calls[1]?.[1]).toEqual({ id: 'PR_1', body: `Notes\n${once}` });
  });

  it('changes nothing that already lists each change once', async () => {
    const graphql = vi.fn<GitHubApi['graphql']>(() => Promise.resolve({}));
    const release = { id: 'PR_1', body: once, headRefOid: 'h', changelog: once, track: APP };
    expect(await mergeReleasePullRequest({ graphql }, 'o/r', release)).toBe(false);
    expect(graphql).not.toHaveBeenCalled();
  });
});
