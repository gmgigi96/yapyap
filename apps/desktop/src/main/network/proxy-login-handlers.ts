import {
  CHROME_CHANNELS,
  type ProxyLoginAnswer,
  type ProxyLoginRequest,
} from '../../shared/api/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { noArguments } from '../ipc/arguments.ts';
import type { ChromeCall, ChromeHandler } from '../ipc/chrome.ts';
import type { ChromePage, PromptWindow } from '../chrome/window-opener.ts';

export const PROXY_LOGIN_PAGE: ChromePage = {
  path: 'proxy-login.html',
  window: {
    title: en.windows.proxyLogin,
    width: 440,
    height: 400,
    resizable: false,
    minimizable: false,
    maximizable: false,
  },
};

/** Generous for any real account, and short enough to keep junk out. */
const MAX_USERNAME = 256;
const MAX_PASSWORD = 1024;

const isText = (value: unknown, limit: number): boolean =>
  typeof value === 'string' && value.length <= limit;

/** Never called with null, which cancels; `Object` makes any other value safe to read. */
function isAnswer(value: unknown, request: ProxyLoginRequest): value is ProxyLoginAnswer {
  const { username, password, remember, ...rest } = Object(value) as Record<string, unknown>;
  const credentials = isText(username, MAX_USERNAME) && isText(password, MAX_PASSWORD);
  // Nothing is kept where the system cannot encrypt it, whatever the page sends.
  const keeping = remember === false || (remember === true && request.canRemember);
  return Object.keys(rest).length === 0 && credentials && keeping;
}

interface ActivePrompt {
  readonly window: PromptWindow;
  readonly request: ProxyLoginRequest;
  readonly settle: (answer: ProxyLoginAnswer | undefined) => void;
}

function promptHandlers(owned: (call: ChromeCall) => ActivePrompt): ChromeHandler[] {
  return [
    {
      channel: CHROME_CHANNELS.proxyLoginRequest,
      accepts: noArguments,
      handle: (call) => owned(call).request,
    },
    {
      channel: CHROME_CHANNELS.proxyLoginAnswer,
      accepts: (args) => args.length === 1,
      handle: (call, answer) => {
        const prompt = owned(call);
        if (answer !== null && !isAnswer(answer, prompt.request)) {
          throw new Error('Not a proxy sign-in answer.');
        }
        prompt.settle(answer ?? undefined);
      },
    },
  ];
}

export interface ProxyLoginPrompt {
  /** Resolves with what the user entered; undefined if they cancel or another sign-in is open. */
  readonly ask: (request: ProxyLoginRequest) => Promise<ProxyLoginAnswer | undefined>;
  readonly handlers: readonly ChromeHandler[];
}

/**
 * Asks for one proxy's username and password at a time, in its own window.
 * Only that window can answer, and closing it cancels.
 */
export function createProxyLoginPrompt(open: () => PromptWindow): ProxyLoginPrompt {
  let active: ActivePrompt | undefined;
  const owned = ({ sender }: ChromeCall): ActivePrompt => {
    if (active?.window.webContents !== sender) {
      throw new Error('No proxy sign-in belongs to this window.');
    }
    return active;
  };
  return {
    ask: (request) => {
      if (active !== undefined) {
        return Promise.resolve(undefined);
      }
      return new Promise((resolve) => {
        const window = open();
        const settle = (answer: ProxyLoginAnswer | undefined): void => {
          if (active?.window !== window) {
            return;
          }
          active = undefined;
          resolve(answer);
          window.close();
        };
        active = { window, request, settle };
        window.onClosed(() => {
          settle(undefined);
        });
      });
    },
    handlers: promptHandlers(owned),
  };
}
