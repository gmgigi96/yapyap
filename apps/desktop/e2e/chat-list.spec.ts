import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { clickMenu } from './chrome-helpers.ts';
import { closeApp, expect, launchApp, test, whatsAppPage } from './fixtures.ts';

interface Layout {
  /** The chat list's column, and the conversation beside it. */
  readonly list: number;
  readonly conversation: number;
  /** Where the divider is: the column's inline-end edge, halfway down. */
  readonly x: number;
  readonly y: number;
}

const layoutOf = (page: Page): Promise<Layout> =>
  page.evaluate(() => {
    const box = (id: string): DOMRect =>
      document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect() ?? new DOMRect();
    const list = box('list-column');
    return {
      list: list.width,
      conversation: box('conversation-pane').width,
      x: list.right,
      y: list.top + list.height / 2,
    };
  });

/** YapYap's divider, an element of its own right after the column, once a render put it there. */
const hasDivider = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const next = document.querySelector('[data-testid="list-column"]')?.nextElementSibling;
    return next?.tagName === 'DIV' && next.getAttribute('data-testid') === null;
  });

/** Drags the divider sideways with the mouse, as the user would. */
async function drag(page: Page, by: number): Promise<void> {
  await expect.poll(() => hasDivider(page)).toBe(true);
  // Just inside the list, on the half of the divider that straddles the column's edge.
  const { x: edge, y } = await layoutOf(page);
  const x = edge - 1;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + by, y, { steps: 5 });
  await page.mouse.up();
}

/** The widths `chat-list.json` keeps, by account. */
async function savedWidths(profile: string): Promise<Record<string, number>> {
  const text = await readFile(join(profile, 'chat-list.json'), 'utf8').catch(() => '{}');
  return (JSON.parse(text) as { widths?: Record<string, number> }).widths ?? {};
}

async function accountIds(profile: string): Promise<{ active: string; ids: string[] }> {
  const saved = JSON.parse(await readFile(join(profile, 'accounts.json'), 'utf8')) as {
    active: string;
    accounts: { id: string }[];
  };
  return { active: saved.active, ids: saved.accounts.map(({ id }) => id) };
}

test('resizes the chat list with the mouse and the keyboard, and keeps it across restarts', async ({
  fakeWhatsApp,
  profile,
}) => {
  const first = await launchApp(fakeWhatsApp.origin, profile);
  let kept: number;
  try {
    const page = await whatsAppPage(first);
    const before = await layoutOf(page);
    await drag(page, 100);
    const dragged = await layoutOf(page);
    expect(dragged.list).toBeCloseTo(before.list + 100, 0);
    expect(dragged.conversation).toBeCloseTo(before.conversation - 100, 0);
    // The drag left the focus on the separator, where the arrows resize it.
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await layoutOf(page)).list).toBeCloseTo(dragged.list + 16, 0);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await layoutOf(page)).list).toBeCloseTo(dragged.list - 16, 0);
    kept = Math.round(dragged.list - 16);
    const { active } = await accountIds(profile);
    await expect.poll(() => savedWidths(profile)).toEqual({ [active]: kept });
    await page.keyboard.press('Home');
    await expect.poll(async () => (await layoutOf(page)).list).toBeCloseTo(240, 0);
    await page.keyboard.press('End');
    await expect.poll(async () => (await layoutOf(page)).list).toBeGreaterThan(dragged.list);
    await drag(page, -10_000);
    await expect.poll(async () => (await layoutOf(page)).list).toBeCloseTo(240, 0);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => savedWidths(profile)).toEqual({ [active]: 272 });
    kept = 272;
  } finally {
    await closeApp(first);
  }
  const second = await launchApp(fakeWhatsApp.origin, profile);
  try {
    const page = await whatsAppPage(second);
    await expect.poll(async () => (await layoutOf(page)).list).toBeCloseTo(kept, 0);
    // Enter, like a double-click, goes back to WhatsApp's own width.
    await drag(page, 0);
    await page.keyboard.press('Enter');
    await expect.poll(() => savedWidths(profile)).toEqual({});
    const { list, conversation } = await layoutOf(page);
    expect(list / (list + conversation)).not.toBeCloseTo(kept / (list + conversation), 2);
  } finally {
    await closeApp(second);
  }
});

test('keeps each account’s own chat list width', async ({ app, window, profile }) => {
  await expect(window.getByTestId('fake-whatsapp')).toBeVisible();
  await drag(window, 80);
  const personal = Math.round((await layoutOf(window)).list);
  await clickMenu(app, 'Add Account');
  const work = await whatsAppPage(app, window);
  await expect(work.getByTestId('fake-whatsapp')).toBeVisible();
  const fresh = await layoutOf(work);
  // A new account starts at WhatsApp's own width.
  expect(fresh.list).not.toBeCloseTo(personal, 0);
  // Wider, not narrower: on a small window WhatsApp's own width is already near the minimum.
  await drag(work, 40);
  const wider = Math.round(fresh.list + 40);
  await expect.poll(async () => (await layoutOf(work)).list).toBeCloseTo(wider, 0);
  const { ids } = await accountIds(profile);
  const [first = '', added = ''] = ids;
  await expect.poll(() => savedWidths(profile)).toEqual({ [first]: personal, [added]: wider });
  await clickMenu(app, 'WhatsApp');
  await expect.poll(async () => (await layoutOf(window)).list).toBeCloseTo(personal, 0);
  expect((await layoutOf(work)).list).toBeCloseTo(wider, 0);
});
