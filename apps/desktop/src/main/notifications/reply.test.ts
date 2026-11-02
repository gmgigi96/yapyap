import { describe, expect, it, vi } from 'vitest';
import {
  draftReply,
  insertDraft,
  pressEnter,
  readDraft,
  replaceDraft,
  supportsInlineReply,
} from './reply.ts';

function setup(answers: unknown[]) {
  const contents = {
    executeJavaScriptInIsolatedWorld: vi.fn(() => {
      const answer = answers.shift();
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    }),
    insertText: vi.fn(() => Promise.resolve()),
    focus: vi.fn(),
    sendInputEvent: vi.fn(),
  };
  const deps = { wait: vi.fn(() => Promise.resolve()), warn: vi.fn() };
  return { contents, deps };
}

describe('draftReply', () => {
  it('waits for WhatsApp to open the chat, then types the reply as a draft', async () => {
    const t = setup([false, new Error('navigating'), true]);
    await draftReply(t.contents, 'On my way', t.deps);
    expect(t.deps.wait).toHaveBeenCalledTimes(3);
    expect(t.deps.wait).toHaveBeenCalledWith(400);
    expect(t.contents.insertText).toHaveBeenCalledExactlyOnceWith('On my way');
    const [world, scripts] = t.contents.executeJavaScriptInIsolatedWorld.mock
      .calls[0] as unknown as [number, { code: string }[]];
    expect(world).toBe(1000);
    expect(scripts[0]?.code).toContain('#main footer [contenteditable=\\"true\\"]');
    expect(t.deps.warn).not.toHaveBeenCalled();
  });

  it('gives up after a few seconds without a message box, and never logs the text', async () => {
    const t = setup(Array.from({ length: 8 }, () => false));
    await draftReply(t.contents, 'Secret plans', t.deps);
    expect(t.deps.wait).toHaveBeenCalledTimes(8);
    expect(t.contents.insertText).not.toHaveBeenCalled();
    expect(t.deps.warn).toHaveBeenCalledExactlyOnceWith(
      'Could not put a notification reply in WhatsApp’s message box.',
    );
  });
});

describe('insertDraft', () => {
  it('types the assistant’s draft into the open chat’s message box, and nothing when none is open', async () => {
    const t = setup([true, false]);
    await expect(insertDraft(t.contents, 'Draft')).resolves.toBe(true);
    expect(t.contents.insertText).toHaveBeenCalledExactlyOnceWith('Draft');
    // WhatsApp's view takes the keyboard before anything is typed (#376).
    expect(t.contents.focus.mock.invocationCallOrder[0]).toBeLessThan(
      t.contents.insertText.mock.invocationCallOrder[0] ?? 0,
    );
    await expect(insertDraft(t.contents, 'Again')).resolves.toBe(false);
    expect(t.contents.insertText).toHaveBeenCalledOnce();
  });
});

describe('replaceDraft', () => {
  it('types over everything in the message box, and nothing when none is open', async () => {
    const t = setup([true, false]);
    await expect(replaceDraft(t.contents, 'Rewritten')).resolves.toBe(true);
    const [, scripts] = t.contents.executeJavaScriptInIsolatedWorld.mock.calls[0] as unknown as [
      number,
      { code: string }[],
    ];
    // The page selects the whole draft as it focuses the box, before anything is typed.
    expect(scripts[0]?.code).toContain('selectAllChildren');
    expect(t.contents.insertText).toHaveBeenCalledExactlyOnceWith('Rewritten');
    await expect(replaceDraft(t.contents, 'Again')).resolves.toBe(false);
    expect(t.contents.insertText).toHaveBeenCalledOnce();
  });
});

describe('readDraft', () => {
  it('reads the draft through the adapter, and fails on anything else it returns', async () => {
    const t = setup(['Running late', null, { html: '<b>' }]);
    await expect(readDraft(t.contents)).resolves.toBe('Running late');
    const [world, scripts] = t.contents.executeJavaScriptInIsolatedWorld.mock
      .calls[0] as unknown as [number, { code: string }[]];
    expect(world).toBe(1000);
    expect(scripts[0]?.code).toContain('readComposer');
    await expect(readDraft(t.contents)).resolves.toBeNull();
    await expect(readDraft(t.contents)).rejects.toThrow('The draft could not be read.');
  });
});

describe('supportsInlineReply', () => {
  it('is offered on macOS and Windows only', () => {
    expect(['darwin', 'win32', 'linux'].map(supportsInlineReply)).toEqual([true, true, false]);
  });
});

describe('pressEnter', () => {
  it('presses Enter in the open chat’s message box, and nothing when none is open', async () => {
    const t = setup([true, false]);
    await expect(pressEnter(t.contents)).resolves.toBe(true);
    expect(t.contents.sendInputEvent.mock.calls).toEqual([
      [{ type: 'keyDown', keyCode: 'Enter' }],
      [{ type: 'char', keyCode: '\r' }],
      [{ type: 'keyUp', keyCode: 'Enter' }],
    ]);
    await expect(pressEnter(t.contents)).resolves.toBe(false);
    expect(t.contents.sendInputEvent).toHaveBeenCalledTimes(3);
  });
});
