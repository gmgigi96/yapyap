import { en } from '../../shared/messages/en.ts';
import type { ProviderId } from './models.ts';
import { sizeText } from './private/catalog.ts';
import type { PrivateModelStatus } from './private/private-model.ts';
import type { ProviderErrorKind } from './providers/provider.ts';
import type { Setup } from './setup.ts';

/** What the bar's one-click fix does: open Settings, resume the download, or try the smaller model. */
export type Fix = 'settings' | 'resume' | 'smaller';

/** A status line, and the fix that goes with it, if any. */
export interface Words {
  readonly status: string;
  readonly fix?: { readonly action: Fix; readonly label: string };
}

const {
  bar,
  status,
  problems,
  settings: { private: words },
} = en.assistant;

const TITLES: Readonly<Record<string, string | undefined>> = en.assistant.providerTitles;

/** How a provider is named at the start of a sentence; nothing before one is set up. */
export const providerTitle = (provider: ProviderId | undefined): string =>
  TITLES[String(provider)] ?? '';

const percentOf = (done: number, size: number): number => Math.floor((done / size) * 100);

/** What the bar and Settings say about the private model while it is not ready. */
export function privateWords({ model, phase, smaller }: PrivateModelStatus): Words {
  switch (phase.kind) {
    case 'downloading':
      return {
        status: words.downloading({
          percent: percentOf(phase.done, model.size),
          done: sizeText(phase.done),
          size: sizeText(model.size),
        }),
      };
    case 'paused':
      return pausedWords(phase.problem, phase.done, model.size);
    case 'damaged':
      return { status: words.damaged, fix: { action: 'resume', label: words.download } };
    case 'out-of-memory':
      return smaller
        ? { status: words.outOfMemory, fix: { action: 'smaller', label: bar.smaller } }
        : { status: words.outOfMemorySmall };
    default:
      return { status: status.download, fix: { action: 'settings', label: bar.setUp } };
  }
}

function pausedWords(problem: '' | 'failed' | 'disk-full', done: number, size: number): Words {
  const fix = { action: 'resume', label: bar.resume } as const;
  const percent = percentOf(done, size);
  if (problem === 'disk-full') {
    return { status: words.diskFull({ size: sizeText(size - done) }), fix };
  }
  return {
    status: problem === 'failed' ? words.failed({ percent }) : words.paused({ percent }),
    fix,
  };
}

/** What the bar says while the assistant cannot answer yet, and how to fix it in one click. */
export function setupWords(setup: Setup, model: PrivateModelStatus): Words {
  const settings = (label: string) => ({ action: 'settings', label }) as const;
  switch (setup.missing) {
    case 'key':
      return {
        status: status.key({ provider: providerTitle(setup.provider) }),
        fix: settings(bar.pasteKey),
      };
    case 'download':
      return privateWords(model);
    case 'model':
      return {
        status:
          setup.provider === 'local'
            ? status.localServer
            : status.noModel({ provider: providerTitle(setup.provider) }),
        fix: settings(bar.openSettings),
      };
    default:
      return { status: status.setUp, fix: settings(bar.setUp) };
  }
}

const PROBLEMS: Readonly<Record<ProviderErrorKind, (provider: string) => string>> = {
  auth: (provider) => problems.auth({ provider }),
  'rate-limited': (provider) => problems.rateLimited({ provider }),
  network: (provider) => problems.network({ provider }),
  timeout: (provider) => problems.timeout({ provider }),
  refused: () => problems.refused,
  'bad-request': (provider) => problems.badRequest({ provider }),
  cancelled: () => problems.cancelled,
  'out-of-memory': () => problems.outOfMemory,
  failed: () => problems.failed,
};

/** What the bar says when a request failed, with a fix where one click can mend it. */
export function problemWords(
  kind: ProviderErrorKind,
  provider: ProviderId | undefined,
  smaller: boolean,
): Words {
  const text = PROBLEMS[kind](providerTitle(provider));
  if (kind === 'auth') {
    return { status: text, fix: { action: 'settings', label: bar.pasteKey } };
  }
  return kind === 'out-of-memory' && smaller
    ? { status: text, fix: { action: 'smaller', label: bar.smaller } }
    : { status: text };
}
