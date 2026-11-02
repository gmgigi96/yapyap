import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssistantBarState } from '../../shared/assistant-bar-api.ts';
import { inPageAssistantBar } from './bar-page.ts';

const STATE: AssistantBarState = {
  status: 'Thinking…',
  working: true,
  suggestions: ['On my way'],
  result: null,
  buttons: [],
  choice: undefined,
  rewrites: [{ value: 'shorter', label: 'Shorter' }],
};

function fakePage() {
  return {
    executeJavaScriptInIsolatedWorld: vi.fn<
      (world: number, scripts: { code: string }[]) => Promise<unknown>
    >(() => Promise.resolve('kept')),
  };
}

/** The content a render sent, read back from its code. */
function contentOf(page: ReturnType<typeof fakePage>, call = -1): unknown {
  const [world, scripts] = page.executeJavaScriptInIsolatedWorld.mock.calls.at(call) ?? [];
  expect(world).toBe(1000);
  const json = /\(document, globalThis, (\{.*?\}), \{"footer"/.exec(scripts?.[0]?.code ?? '')?.[1];
  return JSON.parse(json ?? 'null');
}

function setup() {
  let active = fakePage();
  const onScreen = vi.fn(() => true);
  const redrawn = vi.fn();
  let state = STATE;
  const view = inPageAssistantBar(() => state, { activePage: () => active, onScreen, redrawn });
  return {
    view,
    onScreen,
    redrawn,
    page: () => active,
    switchTo: (page: ReturnType<typeof fakePage>) => {
      active = page;
    },
    setState: (next: AssistantBarState) => {
      state = next;
    },
  };
}

describe('inPageAssistantBar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the state in the active page’s adapter world, in the user’s words', () => {
    const t = setup();
    t.view.show(true);
    expect(contentOf(t.page())).toEqual({
      visible: true,
      labels: {
        label: 'AI assistant',
        name: 'Assistant',
        suggest: 'Suggest replies',
        summarize: 'Summarize',
        rewrite: 'Rewrite',
        rewriteLabel: 'Rewrite my draft',
        catchUp: 'Catch up',
        catchUpLabel: 'Catch up on unread chats',
        settings: 'Assistant settings',
        model: 'Model',
        use: 'Put in the message box',
        sendLabel: 'Send this suggestion now',
        write: 'Write a message',
        writePlaceholder: 'Say what you want to write, such as “I’ll be ten minutes late”',
      },
      status: 'Thinking…',
      working: true,
      suggestions: ['On my way'],
      result: null,
      buttons: [],
      choice: null,
      rewrites: [{ value: 'shorter', label: 'Shorter' }],
    });
    const choice = { label: 'Model', current: 'm', options: [{ value: 'm', label: 'M' }] };
    const buttons = [{ id: 'copy', label: 'Copy', primary: false }] as const;
    t.setState({ ...STATE, result: 'Summary', buttons, working: false, choice });
    t.view.publish(STATE);
    expect(contentOf(t.page())).toEqual(
      expect.objectContaining({
        result: 'Summary',
        buttons,
        working: false,
        choice: { current: 'm', options: choice.options },
      }),
    );
    t.view.show(false);
    expect(contentOf(t.page())).toEqual(expect.objectContaining({ visible: false }));
  });

  it('takes the bar out of a page whose account is no longer on screen', () => {
    const t = setup();
    const first = t.page();
    t.view.show(true);
    const second = fakePage();
    t.switchTo(second);
    t.view.publish(STATE);
    expect(contentOf(first)).toEqual(expect.objectContaining({ visible: false }));
    expect(contentOf(second)).toEqual(expect.objectContaining({ visible: true }));
    t.view.publish(STATE);
    expect(first.executeJavaScriptInIsolatedWorld).toHaveBeenCalledTimes(2);
  });

  it('puts the bar back every second while it shows and the window is on screen', () => {
    const t = setup();
    t.view.show(true);
    t.view.show(true);
    vi.advanceTimersByTime(1000);
    expect(t.page().executeJavaScriptInIsolatedWorld).toHaveBeenCalledTimes(3);
    t.onScreen.mockReturnValue(false);
    vi.advanceTimersByTime(3000);
    expect(t.page().executeJavaScriptInIsolatedWorld).toHaveBeenCalledTimes(3);
    t.onScreen.mockReturnValue(true);
    t.view.show(false);
    vi.advanceTimersByTime(3000);
    expect(t.page().executeJavaScriptInIsolatedWorld).toHaveBeenCalledTimes(4);
  });

  it('shrugs off a page that cannot run it, now or at once', async () => {
    const t = setup();
    t.page().executeJavaScriptInIsolatedWorld.mockRejectedValueOnce(new Error('loading'));
    t.page().executeJavaScriptInIsolatedWorld.mockImplementationOnce(() => {
      throw new Error('Object has been destroyed');
    });
    t.view.show(true);
    t.view.show(true);
    await vi.runOnlyPendingTimersAsync();
    expect(t.page().executeJavaScriptInIsolatedWorld).toHaveBeenCalledTimes(3);
  });

  it('says when WhatsApp drew the chat again, so the bar had to be placed anew', async () => {
    const t = setup();
    t.page().executeJavaScriptInIsolatedWorld.mockResolvedValueOnce('placed');
    t.view.show(true);
    await vi.waitFor(() => {
      expect(t.redrawn).toHaveBeenCalledTimes(1);
    });
    t.page().executeJavaScriptInIsolatedWorld.mockResolvedValueOnce('away');
    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(1000);
    await vi.runOnlyPendingTimersAsync();
    expect(t.redrawn).toHaveBeenCalledTimes(1);
  });

  it('says whether the bar has a place in the active page now', async () => {
    const t = setup();
    t.page().executeJavaScriptInIsolatedWorld.mockResolvedValueOnce('away');
    expect(await t.view.onPage()).toBe(false);
    t.page().executeJavaScriptInIsolatedWorld.mockResolvedValueOnce('placed');
    expect(await t.view.onPage()).toBe(true);
    t.page().executeJavaScriptInIsolatedWorld.mockResolvedValueOnce(true);
    expect(await t.view.onPage()).toBe(false);
    t.page().executeJavaScriptInIsolatedWorld.mockRejectedValueOnce(new Error('loading'));
    expect(await t.view.onPage()).toBe(false);
  });
});
