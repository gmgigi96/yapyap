import type { ScreenShares } from '../capture/shares.ts';
import type { SidebarSource } from './sidebar-handlers.ts';
import type { Settings } from '../settings/schema.ts';
import type { AccountSignals } from './account-signals.ts';
import type { AccountAvatars } from './avatars.ts';
import type { AccountPage, RunningAccounts } from './running.ts';

/** The running accounts in the sidebar, in their menu order, with their unread chats. */
export function sidebarSource(
  { appearance, general }: Pick<Settings, 'appearance' | 'general'>,
  running: Pick<RunningAccounts<AccountPage>, 'list' | 'opened' | 'active' | 'switchTo'>,
  signals: Pick<AccountSignals, 'unreadOf'>,
  shares: Pick<ScreenShares, 'sharing' | 'stop'>,
  avatars: Pick<AccountAvatars, 'avatarOf'>,
): SidebarSource {
  const open = new Set(running.opened().map(({ account }) => account.id));
  const active = running.active().account.id;
  const sharing = shares.sharing();
  const accounts = running
    .list()
    .filter((account) => open.has(account.id))
    .map(({ id, name, color, muted = false }) => ({
      id,
      name,
      color,
      muted,
      unread: muted ? 0 : signals.unreadOf(id),
      active: id === active,
      sharing: sharing.has(id),
      avatar: avatars.avatarOf(id),
    }));
  return {
    state: { accounts, compact: appearance.compactSidebar, doNotDisturb: general.doNotDisturb },
    switchTo: running.switchTo,
    stopSharing: shares.stop,
  };
}
