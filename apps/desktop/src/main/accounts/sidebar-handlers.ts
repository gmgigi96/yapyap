import {
  CHROME_CHANNELS,
  SIDEBAR_STATE_EVENT,
  type SidebarState,
} from '../../shared/chrome-api.ts';
import type { SettingsService } from '../settings/service.ts';
import type { ViewRegistry } from '../security/views.ts';
import { CHROME_ORIGIN, CHROME_VIEW } from '../chrome/assets.ts';
import { argumentsOf, isBoolean, noArguments } from '../ipc/arguments.ts';
import type { ChromeHandler } from '../ipc/chrome.ts';

/** Wide enough for a 40-character name to wrap onto two lines at most. */
const SIDEBAR_WIDTH = 220;
/** An avatar and its badge, with room around them. */
const COMPACT_SIDEBAR_WIDTH = 64;

export interface SidebarPort {
  readonly webContents: {
    loadURL(url: string): Promise<unknown>;
    send(channel: string, state: SidebarState): void;
  };
  readonly setWidth: (width: number) => void;
}

/** What the sidebar shows, and how it switches accounts. */
export interface SidebarSource {
  readonly state: SidebarState;
  readonly switchTo: (id: string) => void;
  readonly stopSharing: (id: string) => void;
}

/** The sidebar once it is attached; holds what it last showed. */
export interface SidebarSlot {
  current?: SidebarSource;
}

/**
 * Shows the sidebar only when there is a choice of account, so one account
 * keeps the whole window, and sends each new state to the page. The page
 * loads on first use and asks for the state itself, so nothing is lost
 * while it loads.
 */
export function attachSidebar(
  port: SidebarPort,
  views: ViewRegistry,
  slot: SidebarSlot,
  warn: (message: string) => void,
): (source: SidebarSource) => void {
  let loaded = false;
  views.set(port.webContents, CHROME_VIEW);
  return (source) => {
    slot.current = source;
    const { accounts, compact } = source.state;
    if (accounts.length < 2) {
      port.setWidth(0);
      return;
    }
    port.setWidth(compact ? COMPACT_SIDEBAR_WIDTH : SIDEBAR_WIDTH);
    if (!loaded) {
      loaded = true;
      port.webContents.loadURL(`${CHROME_ORIGIN}/sidebar.html`).catch(() => {
        warn('Could not load the account sidebar.');
      });
    }
    port.webContents.send(SIDEBAR_STATE_EVENT, source.state);
  };
}

/** The sidebar's operations: read the state, switch to a listed account, and change its layout. */
export function sidebarHandlers(
  slot: SidebarSlot,
  settings: Pick<SettingsService, 'update'>,
): ChromeHandler[] {
  const listed = (id: unknown): id is string =>
    slot.current?.state.accounts.some((account) => account.id === id) === true;
  const sharing = (id: unknown): id is string =>
    slot.current?.state.accounts.some((account) => account.id === id && account.sharing) === true;
  return [
    {
      channel: CHROME_CHANNELS.sidebarState,
      accepts: noArguments,
      handle: () => slot.current?.state ?? null,
    },
    {
      channel: CHROME_CHANNELS.sidebarSwitch,
      accepts: argumentsOf(listed),
      handle: (_call, id) => {
        slot.current?.switchTo(id as string);
      },
    },
    {
      channel: CHROME_CHANNELS.sidebarStopSharing,
      accepts: argumentsOf(sharing),
      handle: (_call, id) => {
        slot.current?.stopSharing(id as string);
      },
    },
    {
      channel: CHROME_CHANNELS.sidebarSetCompact,
      accepts: argumentsOf(isBoolean),
      handle: (_call, compact) => {
        settings.update((current) => ({
          ...current,
          appearance: { ...current.appearance, compactSidebar: compact as boolean },
        }));
      },
    },
  ];
}
