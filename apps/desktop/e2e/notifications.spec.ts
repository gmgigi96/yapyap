import type { ElectronApplication } from '@playwright/test';
import { clickMenu } from './chrome-helpers.ts';
import { expect, mainWindow, test, whatsAppContents } from './fixtures.ts';

/**
 * Records system notifications instead of showing them, so tests never put
 * notifications on the developer's desktop and can click them.
 */
async function recordNotifications(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ Notification }) => {
    const shown: { title: string; body: string; closed: boolean }[] = [];
    const recorded: Electron.Notification[] = [];
    Object.assign(globalThis, {
      shownNotifications: shown,
      clickLatestNotification: () => recorded.at(-1)?.emit('click'),
      replyToLatestNotification: (reply: string) => recorded.at(-1)?.emit('reply', { reply }),
    });
    // CI runners have no notification service, and recording needs none.
    Notification.isSupported = () => true;
    Notification.prototype.show = function show(this: Electron.Notification) {
      recorded.push(this);
      shown.push({ title: this.title, body: this.body, closed: false });
    };
    Notification.prototype.close = function close(this: Electron.Notification) {
      const entry = shown.find((candidate) => candidate.title === this.title);
      if (entry !== undefined) {
        entry.closed = true;
      }
    };
  });
}

const shown = (app: ElectronApplication) =>
  app.evaluate(
    () =>
      (
        globalThis as unknown as {
          shownNotifications: { title: string; body: string; closed: boolean }[];
        }
      ).shownNotifications,
  );

test('turns WhatsApp’s notifications into system ones that open the chat and go away when read', async ({
  app,
  window,
}) => {
  await recordNotifications(app);
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  // notify.js wires its buttons once the page has loaded.
  await window.waitForLoadState('load');
  await window.getByTestId('notify').click();
  await expect(window.getByTestId('notify-result')).toHaveText('permission granted');
  await expect
    .poll(() => shown(app))
    .toEqual([{ title: 'Test Chat One', body: 'Hello from the test', closed: false }]);
  await app.evaluate(() => {
    (globalThis as unknown as { clickLatestNotification: () => void }).clickLatestNotification();
  });
  await expect(window.getByTestId('notify-result')).toHaveText('clicked');
  await window.getByTestId('notify-read').click();
  await expect.poll(async () => (await shown(app))[0]?.closed).toBe(true);
});

/** Clicks Do Not Disturb in the Account menu. */
const toggleDoNotDisturb = (app: ElectronApplication) => clickMenu(app, 'Do Not Disturb');

/** Whether WhatsApp's page is muted. */
const whatsAppAudioMuted = async (app: ElectronApplication) =>
  (await whatsAppContents(app)).evaluate((contents) => contents.isAudioMuted());

/** Shows or hides the window around WhatsApp's page. */
const setWindowShown = async (app: ElectronApplication, shown: boolean) =>
  (await mainWindow(app)).evaluate((owner, show) => {
    if (show) {
      owner.show();
    } else {
      owner.hide();
    }
  }, shown);

/** Records the window's visibility events, so a failure says what the window did. */
const recordWindowEvents = async (app: ElectronApplication) =>
  (await mainWindow(app)).evaluate((owner) => {
    const seen: string[] = [];
    for (const event of ['show', 'hide', 'focus', 'blur', 'minimize', 'restore'] as const) {
      owner.on(event as 'show', () => {
        seen.push(`${event}:${String(owner.isVisible())}`);
      });
    }
    Object.assign(globalThis, { windowEvents: seen });
  });

const windowEvents = (app: ElectronApplication) =>
  app.evaluate(() => (globalThis as unknown as { windowEvents: string[] }).windowEvents.join(', '));

test('do not disturb drops notifications, and mutes WhatsApp while it is out of sight', async ({
  app,
  window,
}) => {
  await recordNotifications(app);
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await window.waitForLoadState('load');
  await toggleDoNotDisturb(app);
  await window.getByTestId('notify').click();
  await expect(window.getByTestId('notify-result')).toHaveText('permission granted');
  expect(await whatsAppAudioMuted(app)).toBe(false);
  await recordWindowEvents(app);
  await setWindowShown(app, false);
  await expect
    .poll(() => whatsAppAudioMuted(app), { message: `window events: ${await windowEvents(app)}` })
    .toBe(true);
  await setWindowShown(app, true);
  await expect.poll(() => whatsAppAudioMuted(app)).toBe(false);
  await toggleDoNotDisturb(app);
  // Notifications arrive in order, so only the second appearing proves the first was dropped.
  await window.getByTestId('notify').click();
  await expect.poll(() => shown(app)).toHaveLength(1);
});

test('puts a reply typed in a notification into the chat’s message box, unsent', async ({
  app,
  window,
}) => {
  await recordNotifications(app);
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await window.waitForLoadState('load');
  await window.getByTestId('notify').click();
  await expect.poll(async () => (await shown(app)).length).toBe(1);
  await app.evaluate(() => {
    (
      globalThis as unknown as { replyToLatestNotification: (reply: string) => void }
    ).replyToLatestNotification('On my way');
  });
  await expect(window.getByTestId('notify-result')).toHaveText('clicked');
  await expect(window.getByTestId('composer')).toHaveText('On my way');
});
