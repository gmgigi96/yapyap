import { followSettings, type SettingsService } from '../settings/service.ts';

export interface ThrottledContents {
  setBackgroundThrottling(allowed: boolean): void;
}

/**
 * WhatsApp marks messages in the open chat as read only while its page is
 * visible. Chromium reports a hidden or minimized window's page as hidden
 * only while background throttling is on, so keeping it on keeps chats
 * unread while YapYap is out of sight. Turning the setting off makes the page
 * count as visible, and its timers run at full speed, even when hidden.
 */
export function followHiddenReadsSetting(
  contents: ThrottledContents,
  settings: Pick<SettingsService, 'current' | 'onChange'>,
): void {
  followSettings(settings, (current) => {
    contents.setBackgroundThrottling(current.privacy.unreadWhileHidden);
  });
}
