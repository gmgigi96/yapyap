import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import type { ElectronApplication, Page } from '@playwright/test';
import type { AxeResults, RunOptions } from 'axe-core';
import { expect, test, whatsAppPage } from './fixtures.ts';

/** YapYap's own windows, by the menu item that opens them. */
const PAGES = [
  ['About YapYap', 'about.html'],
  ['Settings…', 'settings.html'],
  ['Manage Accounts…', 'accounts.html'],
  ['Custom CSS and JavaScript…', 'custom-code.html'],
  ['Keyboard Shortcuts…', 'shortcuts.html'],
  ['Downloads…', 'downloads.html'],
  ['New Chat with Number…', 'new-chat.html'],
  ['Report a Problem…', 'report.html'],
] as const;

async function openChrome(app: ElectronApplication, label: string, page: string): Promise<Page> {
  await whatsAppPage(app);
  const opened = app.waitForEvent('window');
  await app.evaluate(({ Menu }, wanted) => {
    Menu.getApplicationMenu()
      ?.items.flatMap((menu) => menu.submenu?.items ?? [])
      .find((entry) => entry.label === wanted)
      ?.click();
  }, label);
  const window = await opened;
  await window.waitForURL(`app://chrome/${page}`);
  await window.waitForLoadState('load');
  // Parts of a page fill in after it loads; walking or auditing it earlier misses them.
  await expect(window.locator('main')).toBeAttached();
  await expect(window.locator('[aria-busy="true"]')).toHaveCount(0);
  return window;
}

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

/**
 * What axe finds against WCAG 2.2 AA, one line per rule and element. Axe is
 * evaluated over the DevTools protocol, which YapYap's strict CSP does not
 * govern, so the page itself keeps refusing inline and foreign scripts.
 */
async function violations(page: Page): Promise<string[]> {
  await page.evaluate(await readFile(AXE, 'utf8'));
  const options: RunOptions = {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  };
  const results = await page.evaluate(async (given) => {
    const { axe } = globalThis as unknown as {
      axe: { run: (context: Document, options: RunOptions) => Promise<AxeResults> };
    };
    const { violations: found } = await axe.run(document, given);
    return found.map(({ id, nodes }) => ({
      id,
      targets: nodes.map((node) => String(node.target)),
    }));
  }, options);
  return results.flatMap(({ id, targets }) => targets.map((target) => `${id}: ${target}`));
}

// Contrast differs between themes, so each page is checked in both.
for (const theme of ['light', 'dark'] as const) {
  for (const [label, page] of PAGES) {
    test(`${page} passes the WCAG 2.2 AA checks axe can make, ${theme}`, async ({ app }) => {
      await whatsAppPage(app);
      await app.evaluate(({ nativeTheme }, source) => {
        nativeTheme.themeSource = source;
      }, theme);
      const window = await openChrome(app, label, page);
      await expect(window.locator('body')).not.toBeEmpty();
      expect(await violations(window)).toEqual([]);
    });
  }
}

test('the axe check finds a problem when there is one', async ({ app }) => {
  const about = await openChrome(app, 'About YapYap', 'about.html');
  await about.evaluate(() => {
    const button = document.createElement('button');
    button.id = 'unlabelled';
    document.body.append(button);
  });
  expect(await violations(about)).toContain('button-name: #unlabelled');
});

/**
 * The controls Tab should reach on the page as it is shown now, in a stable
 * description. A radio group is one stop, on its checked radio or else its
 * first, and the arrow keys move within it.
 */
const tabbable = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const selector =
      'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';
    const stop = (element: HTMLElement): boolean => {
      if (!(element instanceof HTMLInputElement) || element.type !== 'radio') {
        return true;
      }
      const group = [
        ...document.querySelectorAll<HTMLInputElement>(
          `input[type="radio"][name="${CSS.escape(element.name)}"]`,
        ),
      ];
      return element === (group.find((radio) => radio.checked) ?? group[0]);
    };
    return [...document.querySelectorAll<HTMLElement>(selector)]
      .filter((element) => {
        const { disabled } = element as HTMLButtonElement;
        const shown = element.tabIndex >= 0 && element.getClientRects().length > 0;
        return !disabled && shown && stop(element);
      })
      .map((element) => element.outerHTML.slice(0, 120));
  });

/** The focused control, and whether anything shows that it has focus. */
const focused = (page: Page) =>
  page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    if (element === null || element === document.body) {
      return null;
    }
    const style = getComputedStyle(element);
    const ring = style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0;
    const shadow = style.boxShadow !== 'none';
    // A visually hidden input shows its focus on the label or box that wraps it.
    const wrapper = element.closest('label, .source');
    const wrapped =
      wrapper !== null &&
      (getComputedStyle(wrapper).outlineStyle !== 'none' ||
        getComputedStyle(wrapper).boxShadow !== 'none');
    return { control: element.outerHTML.slice(0, 120), visible: ring || shadow || wrapped };
  });

for (const [label, page] of PAGES) {
  test(`${page} can be used with the keyboard alone, with focus always visible`, async ({
    app,
  }) => {
    const window = await openChrome(app, label, page);
    await expect(window.locator('body')).not.toBeEmpty();
    const controls = await tabbable(window);
    const reached = new Set<string>();
    const hidden: string[] = [];
    // One lap and a little more: every control once, and back round to the first.
    for (let press = 0; press < controls.length + 2; press += 1) {
      await window.keyboard.press('Tab');
      const now = await focused(window);
      if (now !== null) {
        reached.add(now.control);
        if (!now.visible) {
          hidden.push(now.control);
        }
      }
    }
    expect(controls.filter((control) => !reached.has(control))).toEqual([]);
    expect(hidden).toEqual([]);
  });
}

test('the keyboard check finds a control that hides its focus', async ({ app }) => {
  const about = await openChrome(app, 'About YapYap', 'about.html');
  await about.evaluate(() => {
    const button = document.createElement('button');
    button.textContent = 'Hidden focus';
    // Set through the CSSOM, which the page's CSP allows, unlike a style attribute.
    button.style.outline = 'none';
    button.style.boxShadow = 'none';
    document.body.prepend(button);
  });
  await about.keyboard.press('Tab');
  expect(await focused(about)).toEqual({
    control: '<button style="outline: none; box-shadow: none;">Hidden focus</button>',
    visible: false,
  });
});
