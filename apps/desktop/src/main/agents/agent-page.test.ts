import { describe, expect, it, vi } from 'vitest';
import { ADAPTER_WORLD_ID } from '../../adapter/world.ts';
import { CHAT_LIST_TO_TOP, chatOpenerStep } from '../../adapter/open-chat.ts';
import { agentPageOf } from './agent-page.ts';

/** A WhatsApp page whose adapter world answers `answer`, whatever runs there. */
function contents(answer: unknown) {
  return {
    executeJavaScriptInIsolatedWorld: vi.fn<
      (world: number, scripts: { readonly code: string }[]) => Promise<unknown>
    >(() => Promise.resolve(answer)),
    insertText: vi.fn(() => Promise.resolve()),
    focus: vi.fn(),
    sendInputEvent: vi.fn(),
    loadURL: vi.fn<(url: string) => Promise<void>>(() => Promise.resolve()),
  };
}

const ORIGIN = 'https://web.whatsapp.com';

describe('agentPageOf', () => {
  /** A page whose list answers each step in turn, scrolling the list to the top on its own code. */
  function listOf(...steps: unknown[]) {
    const page = contents(undefined);
    const codes: string[] = [];
    page.executeJavaScriptInIsolatedWorld.mockImplementation(
      (_world: number, [script]: { readonly code: string }[]) => {
        codes.push(script?.code ?? '');
        return Promise.resolve(script?.code === CHAT_LIST_TO_TOP ? true : steps.shift());
      },
    );
    return { page, codes };
  }

  it('opens a chat from the top of the list, in the adapter’s world, then lets WhatsApp show it', async () => {
    const { page, codes } = listOf('opened');
    const wait = vi.fn(() => Promise.resolve());
    expect(await agentPageOf(page, ORIGIN, wait).openChat('Ana')).toBe(true);
    expect(page.executeJavaScriptInIsolatedWorld.mock.calls[0]?.[0]).toBe(ADAPTER_WORLD_ID);
    expect(codes).toEqual([CHAT_LIST_TO_TOP, chatOpenerStep('Ana'), CHAT_LIST_TO_TOP]);
    expect(wait.mock.calls).toEqual([[150], [300]]);
  });

  it('loads more of the list until the chat is there', async () => {
    const { page, codes } = listOf('scrolled', 'scrolled', 'opened');
    const wait = vi.fn(() => Promise.resolve());
    expect(await agentPageOf(page, ORIGIN, wait).openChat('Rui')).toBe(true);
    expect(codes.filter((code) => code === chatOpenerStep('Rui'))).toHaveLength(3);
    expect(codes.at(-1)).toBe(CHAT_LIST_TO_TOP);
    expect(wait.mock.calls).toEqual([[150], [150], [150], [300]]);
  });

  it('reports a chat the whole list does not have, and leaves the list at its top', async () => {
    const { page, codes } = listOf('scrolled', 'end');
    const wait = vi.fn(() => Promise.resolve());
    expect(await agentPageOf(page, ORIGIN, wait).openChat('Eva')).toBe(false);
    expect(codes.at(-1)).toBe(CHAT_LIST_TO_TOP);
    expect(wait).not.toHaveBeenCalledWith(300);
  });

  it('gives up after looking through a long list a screen at a time', async () => {
    const { page, codes } = listOf(...Array.from({ length: 100 }, () => 'scrolled'));
    const wait = vi.fn(() => Promise.resolve());
    expect(await agentPageOf(page, ORIGIN, wait).openChat('Eva')).toBe(false);
    expect(codes.filter((code) => code === chatOpenerStep('Eva'))).toHaveLength(60);
  });

  it('waits a moment of real time by default', async () => {
    vi.useFakeTimers();
    const opening = agentPageOf(listOf('opened').page, ORIGIN).openChat('Ana');
    await vi.advanceTimersByTimeAsync(450);
    expect(await opening).toBe(true);
    vi.useRealTimers();
  });

  it('opens a number with WhatsApp’s own link, and names the chat that opens', async () => {
    const page = contents(null);
    let loaded = false;
    page.loadURL.mockImplementation(() => {
      loaded = true;
      return Promise.resolve();
    });
    // While WhatsApp starts again no chat is open; then the number's chat is.
    let looks = 0;
    page.executeJavaScriptInIsolatedWorld.mockImplementation(() => {
      looks += 1;
      return Promise.resolve(
        loaded && looks > 2 ? { name: 'Vasco Guita', group: false, messages: [] } : null,
      );
    });
    const wait = vi.fn(() => Promise.resolve());
    expect(await agentPageOf(page, ORIGIN, wait).openPhone('447700900123')).toBe('Vasco Guita');
    expect(page.loadURL).toHaveBeenCalledWith('https://web.whatsapp.com/send?phone=447700900123');
    expect(wait.mock.calls).toEqual([[500], [500]]);
  });

  it('gives up when no chat opens, as for a number not on WhatsApp', async () => {
    const page = contents(null);
    page.loadURL.mockRejectedValueOnce(new Error('ERR_ABORTED'));
    page.executeJavaScriptInIsolatedWorld.mockRejectedValueOnce(new Error('Navigating.'));
    const wait = vi.fn(() => Promise.resolve());
    expect(await agentPageOf(page, ORIGIN, wait).openPhone('447700900999')).toBeNull();
    expect(wait).toHaveBeenCalledTimes(39);
  });

  it('reads and writes through the adapter and the message box', async () => {
    const page = contents(null);
    const agent = agentPageOf(page, ORIGIN);
    expect(await agent.readOpenChat(5)).toBeNull();
    expect(await agent.readDraft()).toBeNull();
    page.executeJavaScriptInIsolatedWorld.mockResolvedValue([]);
    expect(await agent.readUnread()).toEqual([]);
    page.executeJavaScriptInIsolatedWorld.mockResolvedValue(true);
    expect(await agent.replaceDraft('Hi')).toBe(true);
    expect(page.insertText).toHaveBeenCalledWith('Hi');
    expect(await agent.pressEnter()).toBe(true);
    expect(page.sendInputEvent).toHaveBeenCalledWith({ type: 'keyDown', keyCode: 'Enter' });
  });
});
