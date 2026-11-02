import { describe, expect, it, vi } from 'vitest';
import { ADAPTER_WORLD_ID } from '../../adapter/world.ts';
import { agentPageOf } from './agent-page.ts';

/** A WhatsApp page whose adapter world answers `answer`, whatever runs there. */
function contents(answer: unknown) {
  return {
    executeJavaScriptInIsolatedWorld: vi.fn(() => Promise.resolve(answer)),
    insertText: vi.fn(() => Promise.resolve()),
    focus: vi.fn(),
    sendInputEvent: vi.fn(),
  };
}

describe('agentPageOf', () => {
  it('opens a chat by clicking its row in the adapter’s world, then lets WhatsApp show it', async () => {
    const page = contents(true);
    const wait = vi.fn(() => Promise.resolve());
    expect(await agentPageOf(page, wait).openChat('Ana')).toBe(true);
    const [[world, [script]]] = page.executeJavaScriptInIsolatedWorld.mock.calls as unknown as [
      [number, [{ code: string }]],
    ];
    expect(world).toBe(ADAPTER_WORLD_ID);
    expect(script.code).toContain('"Ana"');
    expect(wait).toHaveBeenCalledWith(300);
  });

  it('reports a chat the list does not show, without waiting', async () => {
    const page = contents(false);
    const wait = vi.fn(() => Promise.resolve());
    expect(await agentPageOf(page, wait).openChat('Eva')).toBe(false);
    expect(wait).not.toHaveBeenCalled();
  });

  it('waits a moment of real time by default', async () => {
    vi.useFakeTimers();
    const opening = agentPageOf(contents(true)).openChat('Ana');
    await vi.advanceTimersByTimeAsync(300);
    expect(await opening).toBe(true);
    vi.useRealTimers();
  });

  it('reads and writes through the adapter and the message box', async () => {
    const page = contents(null);
    const agent = agentPageOf(page);
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
