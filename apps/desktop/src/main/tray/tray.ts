import type { MenuItemConstructorOptions } from 'electron';
import type { AccountSummary } from '../../shared/api/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import { bringToFront, type LinkWindow } from '../app/instances.ts';

export interface TrayPort {
  setToolTip(text: string): void;
  setContextMenu(menu: unknown): void;
  /** Text beside the icon; only the macOS menu bar shows it. */
  setTitle(title: string): void;
  on(event: 'click', listener: () => void): unknown;
  setImage(image: unknown): void;
}

export interface TrayWindow extends LinkWindow {
  hide(): void;
}

export interface TrayDependencies {
  readonly platform: string;
  readonly buildMenu: (template: MenuItemConstructorOptions[]) => unknown;
  readonly switchAccount: (id: string) => void;
  readonly openSettings: () => void;
  readonly setDoNotDisturb: (on: boolean) => void;
  readonly stopSharing: (account: string) => void;
  readonly togglePrivacyScreen: () => void;
  /** Turns the MCP server for AI agents off (ADR 0019). */
  readonly stopAgents: () => void;
  readonly quit: () => void;
}

/** What the tray shows; it changes with the accounts, the unread count and the window. */
export interface TrayState {
  readonly accounts: readonly AccountSummary[];
  readonly unread: number;
  readonly windowShown: boolean;
  readonly doNotDisturb: boolean;
  /** Accounts sharing a screen or window, which the tray must always show (#161). */
  readonly sharing: readonly string[];
  readonly privacyScreen: boolean;
  /** The MCP server for AI agents is on. */
  readonly agents: boolean;
}

/** The running accounts, when there is a choice; picking one shows it. */
function accountItems(
  state: TrayState,
  window: TrayWindow,
  deps: TrayDependencies,
): MenuItemConstructorOptions[] {
  const running = state.accounts.filter((account) => account.enabled);
  if (running.length < 2) {
    return [];
  }
  return [
    { type: 'separator' },
    ...running.map((account): MenuItemConstructorOptions => ({
      label: account.muted ? en.tray.mutedAccount({ name: account.name }) : account.name,
      type: 'radio',
      checked: account.active,
      click: () => {
        deps.switchAccount(account.id);
        bringToFront(window);
      },
    })),
  ];
}

/** A way to stop each running share, first in the menu, so it is never hidden. */
function sharingItems(state: TrayState, deps: TrayDependencies): MenuItemConstructorOptions[] {
  const sharing = state.accounts.filter((account) => state.sharing.includes(account.id));
  if (sharing.length === 0) {
    return [];
  }
  return [
    ...sharing.map((account) => ({
      label: en.tray.stopSharing({ account: account.name }),
      click: () => {
        deps.stopSharing(account.id);
      },
    })),
    { type: 'separator' as const },
  ];
}

/** Do not disturb and the privacy screen, each showing whether it is on. */
function switchItems(state: TrayState, deps: TrayDependencies): MenuItemConstructorOptions[] {
  return [
    {
      label: en.tray.doNotDisturb,
      type: 'checkbox',
      checked: state.doNotDisturb,
      click: () => {
        deps.setDoNotDisturb(!state.doNotDisturb);
      },
    },
    {
      label: en.tray.privacyScreen,
      type: 'checkbox',
      checked: state.privacyScreen,
      click: deps.togglePrivacyScreen,
    },
  ];
}

function menuOf(
  state: TrayState,
  window: TrayWindow,
  deps: TrayDependencies,
): MenuItemConstructorOptions[] {
  const toggle: MenuItemConstructorOptions = state.windowShown
    ? {
        label: en.tray.hide,
        click: () => {
          window.hide();
        },
      }
    : {
        label: en.tray.show,
        click: () => {
          bringToFront(window);
        },
      };
  return [
    ...sharingItems(state, deps),
    toggle,
    ...accountItems(state, window, deps),
    { type: 'separator' },
    ...switchItems(state, deps),
    // While agents can connect, one click cuts them off (ADR 0019).
    ...(state.agents ? [{ label: en.agents.trayStop, click: deps.stopAgents }] : []),
    { label: en.tray.settings, click: deps.openSettings },
    { type: 'separator' },
    { label: en.tray.quit, click: deps.quit },
  ];
}

function tooltipOf(state: TrayState): string {
  if (state.sharing.length > 0) {
    return en.tray.sharing;
  }
  return state.unread > 0 ? en.tray.unread({ count: state.unread }) : en.tray.tooltip;
}

/**
 * The tray icon keeps YapYap reachable when its window is hidden, whether it
 * started minimized or closed to the tray, and shows the unread count of
 * every account. Some Linux desktops never deliver clicks on the icon
 * itself, so the menu offers the same action. Returns how to update it.
 */
export function setUpTray(
  tray: TrayPort,
  window: TrayWindow,
  deps: TrayDependencies,
): (state: TrayState) => void {
  // A click on the macOS menu bar item opens its menu, as menu bar items do.
  if (deps.platform !== 'darwin') {
    tray.on('click', () => {
      bringToFront(window);
    });
  }
  return (state) => {
    tray.setToolTip(tooltipOf(state));
    if (deps.platform === 'darwin') {
      tray.setTitle(state.unread > 0 ? String(state.unread) : '');
    }
    tray.setContextMenu(deps.buildMenu(menuOf(state, window, deps)));
  };
}
