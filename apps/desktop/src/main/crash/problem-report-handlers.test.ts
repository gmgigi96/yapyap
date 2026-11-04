import { describe, expect, it, vi } from 'vitest';
import { problemReportHandlers } from './problem-report-handlers.ts';

function setup() {
  const deps = {
    diagnostics: vi.fn(() => Promise.resolve('YapYap 0.1.0 (deb)\nRecent log:\n(empty)')),
    writeClipboard: vi.fn<(text: string) => Promise<void>>(() => Promise.resolve()),
    openExternal: vi.fn<(url: string) => Promise<void>>(() => Promise.resolve()),
  };
  const handlers = problemReportHandlers(deps);
  const handler = (channel: string) => {
    const found = handlers.find((candidate) => candidate.channel === channel);
    if (found === undefined) {
      throw new Error(`No handler for ${channel}`);
    }
    return found;
  };
  return { deps, handler, call: { sender: {} } };
}

describe('problemReportHandlers', () => {
  it('shows the diagnostics the report would carry', async () => {
    const t = setup();
    expect(t.handler('report:diagnostics').accepts([])).toBe(true);
    await expect(t.handler('report:diagnostics').handle(t.call)).resolves.toBe(
      'YapYap 0.1.0 (deb)\nRecent log:\n(empty)',
    );
  });

  it('copies the report and opens GitHub’s form with it filled in', async () => {
    const t = setup();
    await t.handler('report:open').handle(t.call, '  The window stays blank\nafter waking up.  ');
    expect(t.deps.writeClipboard).toHaveBeenCalledWith(
      'The window stays blank\nafter waking up.\n\nYapYap 0.1.0 (deb)\nRecent log:\n(empty)',
    );
    const url = new URL(t.deps.openExternal.mock.calls[0]?.[0] ?? '');
    expect(url.origin + url.pathname).toBe('https://github.com/vascoguita/yapyap/issues/new');
    expect(url.searchParams.get('template')).toBe('bug_report.yml');
    expect(url.searchParams.get('title')).toBe('The window stays blank');
    expect(url.searchParams.get('what-happened')).toBe('The window stays blank\nafter waking up.');
    expect(url.searchParams.get('diagnostics')).toBe('YapYap 0.1.0 (deb)\nRecent log:\n(empty)');
  });

  it('gives an empty report a plain title, and shortens a long one', async () => {
    const t = setup();
    await t.handler('report:open').handle(t.call, '   ');
    await t.handler('report:open').handle(t.call, 'x'.repeat(100));
    await t.handler('report:open').handle(t.call, 'y'.repeat(80));
    await t.handler('report:open').handle(t.call, '\n  \n   It crashed on start   \nthen…');
    await t.handler('report:open').handle(t.call, '');
    const titles = t.deps.openExternal.mock.calls.map(
      ([url]) => new URL(url).searchParams.get('title') ?? '',
    );
    expect(titles).toEqual([
      'Problem report',
      `${'x'.repeat(80)}…`,
      'y'.repeat(80),
      'It crashed on start',
      'Problem report',
    ]);
    expect(t.deps.writeClipboard.mock.calls[0]?.[0]).toBe(
      'YapYap 0.1.0 (deb)\nRecent log:\n(empty)',
    );
  });

  it('accepts only a description of reasonable length', () => {
    const { accepts } = setup().handler('report:open');
    expect(accepts(['It froze.'])).toBe(true);
    expect(accepts(['x'.repeat(4000)])).toBe(true);
    expect(accepts(['x'.repeat(4001)])).toBe(false);
    expect(accepts([42])).toBe(false);
    // Something with a short length that is still not text.
    expect(accepts([['It froze.']])).toBe(false);
    expect(accepts(['a', 'b'])).toBe(false);
  });
});
