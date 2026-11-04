/** This repository on GitHub, as `owner/name`. */
export const REPOSITORY = 'vascoguita/yapyap';

/** This repository's GitHub releases, which hold every package. */
const RELEASES = `https://github.com/${REPOSITORY}/releases`;

/** Where a release's files are downloaded from: `${RELEASE_DOWNLOADS}/<tag>/<file>` (ADR 0014). */
export const RELEASE_DOWNLOADS = `${RELEASES}/download`;

/** A release's page: `${RELEASE_PAGES}/<tag>`. */
export const RELEASE_PAGES = `${RELEASES}/tag`;

/** GitHub's list of this repository's releases, a page of 100, the most it gives at once. */
export const RELEASES_API = `https://api.github.com/repos/${REPOSITORY}/releases?per_page=100`;

/** The headers of a request to GitHub's API with `token`. */
export function githubHeaders(token: string): Record<string, string> {
  return { accept: 'application/vnd.github+json', authorization: `Bearer ${token}` };
}
