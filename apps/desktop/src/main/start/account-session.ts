import { partitionOf, type Account } from '../accounts/accounts.ts';
import { guardDownloads } from '../downloads/downloads.ts';
import { followProxySetting, launchProxyOf, type ProxyController } from '../network/proxy.ts';
import type { PermissionMemory } from '../permissions/session-guard.ts';
import { secureSession } from '../security/security.ts';
import { attachContextMenu } from '../spelling/context-menu.ts';
import type {
  AccountContents,
  AccountWiring,
  DictionarySession,
  StartDependencies,
  WindowPort,
} from './types.ts';

/**
 * Each account's session gets YapYap's guards, download handling, spelling
 * setting and proxy (the `session-created` hook also secures it, before
 * anything loads there). `proxied` resolves once the proxy is set, so loads
 * may start (#76).
 */
export function guardAccountSession<Window extends WindowPort>(
  deps: StartDependencies<Window>,
  wiring: Pick<AccountWiring<Window>, 'security' | 'spelling' | 'proxy'>,
  account: Account,
): {
  readonly session: DictionarySession;
  readonly proxied: Promise<void>;
  readonly permissions: PermissionMemory;
} {
  const session = deps.sessionOf(partitionOf(account));
  const permissions = secureSession(session, wiring.security);
  guardDownloads(session, {
    ...deps.downloads,
    notify: deps.notify,
    warn: deps.warn,
    options: () => deps.settings.current().downloads,
  });
  wiring.spelling.guard(session);
  return { session, permissions, proxied: wiring.proxy.guard(session, account.id) };
}

/** The right-click menu of an account's WhatsApp, with spelling suggestions (#73). */
export function contextMenuFor<Window extends WindowPort>(
  { deps, chrome }: Pick<AccountWiring<Window>, 'deps' | 'chrome'>,
  contents: AccountContents,
  session: DictionarySession,
): void {
  const actions = {
    spellingOn: () => deps.settings.current().spelling.enabled,
    replaceMisspelling: (word: string) => {
      contents.replaceMisspelling(word);
    },
    addToDictionary: (word: string) => {
      session.addWordToSpellCheckerDictionary(word);
    },
    turnSpellingOff: () => {
      deps.settings.update((current) => ({
        ...current,
        spelling: { ...current.spelling, enabled: false },
      }));
    },
    openSettings: chrome.openSettings,
    openLanguages: chrome.openSpellingLanguages,
  };
  attachContextMenu(contents, actions, deps.contextMenu);
}

/**
 * Puts every session on the proxy setting, so update and release checks
 * cannot go around it either; release checks start right after this (#76).
 */
export async function followProxy(
  deps: Pick<StartDependencies<WindowPort>, 'app' | 'defaultSession' | 'settings' | 'warn'>,
): Promise<ProxyController> {
  const proxy = followProxySetting(deps.settings, deps.warn, launchProxyOf(deps.app.commandLine));
  deps.app.on('session-created', (session) => {
    void proxy.guard(session);
  });
  await proxy.guard(deps.defaultSession());
  return proxy;
}
