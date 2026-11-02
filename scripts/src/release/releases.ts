/** This repository's GitHub releases, which hold every package. */
const RELEASES = 'https://github.com/vascoguita/yapyap/releases';

/** Where a release's files are downloaded from: `${RELEASE_DOWNLOADS}/<tag>/<file>` (ADR 0014). */
export const RELEASE_DOWNLOADS = `${RELEASES}/download`;

/** A release's page: `${RELEASE_PAGES}/<tag>`. */
export const RELEASE_PAGES = `${RELEASES}/tag`;
