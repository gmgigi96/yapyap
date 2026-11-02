import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Schema from 'typebox/schema';
import type { Channel } from './repository.ts';

/** A YapYap release, with the SHA-256 of each file its `SHA256SUMS` lists. */
export interface DistributionRelease {
  readonly version: string;
  readonly checksums: ReadonlyMap<string, string>;
}

/** A release file as a package manager downloads it. */
interface Download {
  readonly url: string;
  readonly sha256: string;
}

/** What the YapYap package is, as each package manager describes it. */
export const ABOUT = {
  name: 'YapYap',
  summary: 'Unofficial desktop client for WhatsApp Web',
  homepage: 'https://yapyap.guita.org/',
  author: 'Vasco Guita',
  license: 'MIT',
} as const;

const DOWNLOADS = 'https://github.com/vascoguita/yapyap/releases/download';
// Betas are numbered by the Beta release workflow, and nothing else is published.
const VERSION = /^\d+\.\d+\.\d+(-beta\.\d+)?$/;
const SUM_LINE = /^([0-9a-f]{64}) [ *]([\w.@-]+)$/;
// Vendored, so validation runs offline and only changes when a schema
// update is reviewed: winget-cli dafe5e7795c6b36e2a8cea86aa9fddec898df795
// (schemas/JSON/manifests/v1.28.0) and Scoop
// 79669717fe3e53ba642ec073a45bbe53acb77b8e (schema.json), both MIT-licensed.
const SCHEMAS = join(import.meta.dirname, '..', '..', '..', 'packaging', 'manifest-schemas');

/** Reads a release's version and its `SHA256SUMS`, refusing anything malformed. */
export function parseRelease(version: string, sha256sums: string): DistributionRelease {
  if (!VERSION.test(version)) {
    throw new Error(`Not a release version: ${version}`);
  }
  const checksums = new Map<string, string>();
  for (const line of sha256sums.split('\n').filter((text) => text !== '')) {
    const match = SUM_LINE.exec(line);
    if (match === null) {
      throw new Error(`Not a SHA256SUMS line: ${line}`);
    }
    checksums.set(String(match[2]), String(match[1]));
  }
  return { version, checksums };
}

/**
 * The channels a version reaches: betas reach the beta channel alone, and
 * releases reach both, so beta users move to each release once it is newer.
 */
export function channelsOf(version: string): readonly Channel[] {
  return version.includes('-') ? ['beta'] : ['stable', 'beta'];
}

/** The release file whose name ends in `suffix`, such as `mac-universal.dmg`. */
export function download(release: DistributionRelease, suffix: string): Download {
  const file = `YapYap-${release.version}-${suffix}`;
  const sha256 = release.checksums.get(file);
  if (sha256 === undefined) {
    throw new Error(`SHA256SUMS lists no ${file}`);
  }
  return { url: `${DOWNLOADS}/v${release.version}/${file}`, sha256 };
}

/** The release notes of a version. */
export function releaseNotesUrl(version: string): string {
  return `https://github.com/vascoguita/yapyap/releases/tag/v${version}`;
}

/** Throws unless `value` matches the vendored JSON Schema in `schemaFile`. */
export function checkSchema(schemaFile: string, value: unknown): void {
  const schema: unknown = JSON.parse(readFileSync(join(SCHEMAS, schemaFile), 'utf8'));
  const [valid, errors] = Schema.Errors(schema as Schema.XSchema, value);
  if (!valid) {
    const reasons = errors.map((error) => `${error.instancePath} ${error.message}`);
    throw new Error(`Not a valid ${schemaFile} manifest: ${reasons.join('; ')}`);
  }
}
