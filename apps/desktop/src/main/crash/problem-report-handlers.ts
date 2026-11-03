import { CHROME_CHANNELS } from '../../shared/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { bugReportUrl } from './crash-report.ts';
import { argumentsOf, noArguments } from '../ipc/arguments.ts';
import type { ChromeHandler } from '../ipc/chrome.ts';

/** Long enough for a careful description; the GitHub form takes the rest. */
const MAX_DESCRIPTION = 4000;
/** The issue title: the description's first line, shortened. */
const MAX_TITLE = 80;

export interface ProblemReportDependencies {
  /** The sanitized diagnostics: versions, platform, graphics and the redacted log. */
  readonly diagnostics: () => Promise<string>;
  readonly writeClipboard: (text: string) => Promise<unknown>;
  readonly openExternal: (url: string) => Promise<unknown>;
}

function titleOf(description: string): string {
  const line = description
    .split('\n')
    .map((part) => part.trim())
    .find((part) => part !== '');
  if (line === undefined) {
    return en.report.issueTitle;
  }
  return line.length > MAX_TITLE ? `${line.slice(0, MAX_TITLE)}…` : line;
}

const isDescription = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= MAX_DESCRIPTION;

/**
 * Help → Report a Problem (#82): the user reviews the sanitized report in
 * YapYap, then it is copied and GitHub's bug form opens in the browser with
 * it filled in. YapYap sends nothing itself; the user submits on GitHub.
 */
export function problemReportHandlers(deps: ProblemReportDependencies): ChromeHandler[] {
  return [
    {
      channel: CHROME_CHANNELS.reportDiagnostics,
      accepts: noArguments,
      handle: () => deps.diagnostics(),
    },
    {
      channel: CHROME_CHANNELS.reportOpen,
      accepts: argumentsOf(isDescription),
      handle: async (_call, description) => {
        const text = (description as string).trim();
        const diagnostics = await deps.diagnostics();
        await deps.writeClipboard([text, diagnostics].filter((part) => part !== '').join('\n\n'));
        await deps.openExternal(
          bugReportUrl({ title: titleOf(text), whatHappened: text, diagnostics }),
        );
      },
    },
  ];
}
