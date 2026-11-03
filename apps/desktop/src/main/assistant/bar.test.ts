import { describe, expect, it, vi } from 'vitest';
import type { ReadChat } from '../../adapter/active-chat.ts';
import type { AssistantBarState } from '../../shared/api/assistant-bar-api.ts';
import { createAssistantBar, type BarDependencies } from './bar.ts';
import { CATCH_UP_INSTRUCTIONS } from './catch-up.ts';
import type { PrivateModelStatus } from './private/private-model.ts';
import { ProviderError } from './providers/provider.ts';
import { INSTRUCTIONS, SUMMARY_INSTRUCTIONS } from './replies.ts';
import type { Setup } from './setup.ts';

const CHAT: ReadChat = {
  name: 'Ana',
  group: false,
  messages: [
    { outgoing: false, text: 'Dinner tonight?' },
    { outgoing: true, text: 'See you at 8' },
  ],
};

const READY: Setup = {
  provider: 'anthropic',
  missing: '',
  models: [
    { id: 'claude-opus', label: 'Opus' },
    { id: 'claude-haiku', label: 'Haiku' },
  ],
  auto: { id: 'claude-haiku', label: 'Haiku' },
  model: 'claude-haiku',
  key: 'sk',
  endpoint: '',
};

const PRIVATE: PrivateModelStatus = {
  model: { id: 'qwen', name: 'Qwen', url: 'https://huggingface.co/q', size: 1000, sha256: 'a' },
  phase: { kind: 'none' },
  smaller: true,
  used: 0,
};

const SETTINGS = {
  enabled: true,
  provider: 'auto',
  model: 'auto',
  autoSuggest: true,
  messages: '10',
  localServer: '',
} as const;

/** The bar with everything it needs played: a chat open in an account, and Claude answering. */
function harness(answer = 'Yes, 8 works!\nCan we do 9?') {
  let setup: Setup = READY;
  let chat: ReadChat | null = CHAT;
  let model: PrivateModelStatus = PRIVATE;
  let assistant: Record<string, unknown> = { ...SETTINGS };
  const allowed = new Set<string>();
  const states: AssistantBarState[] = [];
  const deps: BarDependencies = {
    core: {
      setup: vi.fn(() => Promise.resolve(setup)),
      ask: vi.fn(() => Promise.resolve(answer)),
    },
    settings: {
      current: () => ({ assistant }) as never,
      update: vi.fn((change: (settings: never) => { assistant: Record<string, unknown> }) => {
        assistant = change({ assistant } as never).assistant;
      }),
    },
    chats: {
      isAllowed: (account, name) => allowed.has(`${account}/${name}`),
      allow: vi.fn((account: string, name: string) => {
        allowed.add(`${account}/${name}`);
        return Promise.resolve();
      }),
    },
    accounts: {
      active: () => 'account',
      readActiveChat: vi.fn(() => Promise.resolve(chat)),
      readUnreadSummary: vi.fn(() =>
        Promise.resolve([{ name: 'Bo', unread: 2, messages: [{ outgoing: false, text: 'Hi?' }] }]),
      ),
      readDraft: vi.fn(() => Promise.resolve<string | null>('running late')),
      replaceDraft: vi.fn(() => Promise.resolve(true)),
      pressEnter: vi.fn(() => Promise.resolve(true)),
    },
    privateModels: {
      status: () => Promise.resolve(model),
      download: vi.fn(),
      smaller: vi.fn(() => Promise.resolve()),
      outOfMemory: vi.fn(),
    },
    languages: ['pt', 'en'],
    openSettings: vi.fn(),
    writeClipboard: vi.fn(),
    show: vi.fn(),
    publish: (state) => states.push(state),
  };
  const bar = createAssistantBar(deps);
  return {
    bar,
    deps,
    states,
    allow: () => allowed.add('account/Ana'),
    last: () => bar.state(),
    setSetup: (next: Setup) => {
      setup = next;
    },
    setChat: (next: ReadChat | null) => {
      chat = next;
    },
    setModel: (next: PrivateModelStatus) => {
      model = next;
    },
    settings: () => assistant,
  };
}

const ids = (state: AssistantBarState) => state.buttons.map(({ id }) => id);

describe('createAssistantBar', () => {
  it('offers the rewrites and names the model in use, and shows as the settings say', async () => {
    const t = harness();
    expect(t.last().rewrites.map(({ value }) => value)).toEqual([
      'friendlier',
      'formal',
      'shorter',
      'translate:pt',
      'translate:en',
    ]);
    await t.bar.refresh();
    expect(t.deps.show).toHaveBeenCalledWith(true);
    expect(t.last().choice).toEqual({
      label: 'Model',
      current: 'auto',
      options: [
        { value: 'auto', label: 'Auto (recommended): Haiku' },
        { value: 'claude-opus', label: 'Opus' },
        { value: 'claude-haiku', label: 'Haiku' },
      ],
    });
    t.setSetup({ ...READY, auto: undefined });
    t.settings()['model'] = 'claude-opus';
    await t.bar.refresh();
    expect(t.last().choice?.current).toBe('claude-opus');
    expect(t.last().choice?.options[0]?.label).toBe('Auto (recommended)');
  });

  it('asks before reading a chat for the first time, and shows what is sent when asked', async () => {
    const t = harness();
    await t.bar.suggest();
    expect(t.last().status).toBe(
      'Allow the assistant to read this chat? It sends the latest messages to Claude (Anthropic) when you ask.',
    );
    expect(ids(t.last())).toEqual(['allow', 'what-sent']);
    expect(t.deps.core.ask).not.toHaveBeenCalled();
    await t.bar.button('what-sent');
    expect(t.last().status).toBe('This is exactly what is sent:');
    expect(t.last().result).toBe(
      `${INSTRUCTIONS}\n\nChat: Ana\nThem: Dinner tonight?\nMe: See you at 8`,
    );
    expect(ids(t.last())).toEqual(['allow', 'close']);
    await t.bar.button('allow');
    expect(t.deps.chats.allow).toHaveBeenCalledWith('account', 'Ana');
    expect(t.last().suggestions).toEqual(['Yes, 8 works!', 'Can we do 9?']);
    expect(t.last().status).toBe('');
    expect(t.states.some((state) => state.working && state.status === 'Thinking…')).toBe(true);
  });

  it('says the messages stay on this computer with a private model or a local server', async () => {
    const t = harness();
    for (const provider of ['built-in', 'local'] as const) {
      t.setSetup({ ...READY, provider });
      await t.bar.summarize();
      expect(t.last().status).toBe(
        'Allow the assistant to read this chat? Its messages stay on this computer.',
      );
    }
  });

  it('allows only the chat the consent was asked in, while it is still open', async () => {
    const t = harness();
    await t.bar.suggest();
    t.setChat({ ...CHAT, name: 'Bo' });
    await t.bar.button('allow');
    expect(t.last().status).toBe('You opened another chat, so this is gone. Ask again here.');
    expect(t.deps.chats.allow).not.toHaveBeenCalled();
    t.setChat(CHAT);
    await t.bar.suggest();
    t.setChat({ ...CHAT, name: 'Bo' });
    await t.bar.button('what-sent');
    expect(t.last().result).toBeNull();
    t.setChat(null);
    await t.bar.suggest();
    expect(t.last().status).toBe('Open a chat first.');
    await t.bar.button('allow');
    expect(t.deps.chats.allow).not.toHaveBeenCalled();
  });

  it('suggests, summarizes and writes what the user describes in an allowed chat', async () => {
    const t = harness('- Dinner at 8.');
    t.allow();
    await t.bar.summarize();
    expect(t.deps.core.ask).toHaveBeenCalledWith(
      READY,
      SUMMARY_INSTRUCTIONS,
      expect.stringContaining('Them: Dinner tonight?'),
    );
    expect(t.last().result).toBe('- Dinner at 8.');
    expect(ids(t.last())).toEqual(['copy', 'close']);
    await t.bar.button('copy');
    expect(t.deps.writeClipboard).toHaveBeenCalledWith('- Dinner at 8.');
    expect(t.last().status).toBe('Copied.');
    await t.bar.button('close');
    expect(t.last().result).toBeNull();
    await t.bar.prompt('say I am late');
    expect(vi.mocked(t.deps.core.ask).mock.calls.at(-1)?.[2]).toContain(
      'What I want to say: say I am late',
    );
    expect(t.last().suggestions).toEqual(['- Dinner at 8.']);
  });

  it('says when the model had nothing to suggest', async () => {
    const t = harness('\n  \n');
    t.allow();
    await t.bar.suggest();
    expect(t.last().status).toBe('The model had nothing to suggest. Try again.');
  });

  it('rewrites the draft in the picked way, and puts the rewrite in its place on Use', async () => {
    const t = harness('“Running a little late, sorry!”');
    t.allow();
    await t.bar.rewrite('louder');
    expect(t.deps.core.ask).not.toHaveBeenCalled();
    await t.bar.rewrite('translate:pt');
    expect(vi.mocked(t.deps.core.ask).mock.calls[0]?.[1]).toContain('translated into Portuguese');
    expect(vi.mocked(t.deps.core.ask).mock.calls[0]?.[2]).toBe('running late');
    expect(t.last().result).toBe('Running a little late, sorry!');
    expect(ids(t.last())).toEqual(['use', 'copy', 'close']);
    await t.bar.button('use');
    expect(t.deps.accounts.replaceDraft).toHaveBeenCalledWith('Running a little late, sorry!');
    expect(t.last().result).toBeNull();
    vi.mocked(t.deps.accounts.readDraft).mockResolvedValueOnce('  ');
    await t.bar.rewrite('shorter');
    expect(t.last().status).toBe('Type a draft in the message box first.');
  });

  it('keeps a rewrite on screen when its chat is gone or the draft cannot be replaced', async () => {
    const t = harness('Shorter');
    t.allow();
    await t.bar.rewrite('shorter');
    vi.mocked(t.deps.accounts.replaceDraft).mockResolvedValueOnce(false);
    await t.bar.button('use');
    expect(t.last().result).toBe('Shorter');
    t.setChat({ ...CHAT, name: 'Bo' });
    await t.bar.button('use');
    expect(t.deps.accounts.replaceDraft).toHaveBeenCalledOnce();
  });

  it('shows what is sent for a rewrite, or that there is no draft yet', async () => {
    const t = harness();
    await t.bar.rewrite('formal');
    await t.bar.button('what-sent');
    expect(t.last().result).toContain('more formal and polite');
    expect(t.last().result).toContain('running late');
    await t.bar.rewrite('formal');
    vi.mocked(t.deps.accounts.readDraft).mockResolvedValueOnce(null);
    await t.bar.button('what-sent');
    expect(t.last().status).toBe('Type a draft in the message box first.');
    expect(t.last().result).toBeNull();
  });

  it('puts a suggestion in the message box, or sends it on its own button', async () => {
    const t = harness();
    t.allow();
    await t.bar.suggest();
    await t.bar.use(1);
    expect(t.deps.accounts.replaceDraft).toHaveBeenCalledWith('Can we do 9?');
    await t.bar.use(7);
    await t.bar.send(0);
    expect(t.deps.accounts.pressEnter).toHaveBeenCalledOnce();
    expect(t.last().suggestions).toEqual([]);
    await t.bar.send(0);
    expect(t.deps.accounts.pressEnter).toHaveBeenCalledOnce();
    await t.bar.suggest();
    vi.mocked(t.deps.accounts.replaceDraft).mockResolvedValueOnce(false);
    await t.bar.send(0);
    expect(t.deps.accounts.pressEnter).toHaveBeenCalledOnce();
  });

  it('catches up after showing exactly what is sent, and sends that alone', async () => {
    const t = harness('- Bo says hi.');
    await t.bar.catchUp();
    const digest = 'Chat: Bo\nUnread: 2\nLatest message: Hi?';
    expect(t.last().result).toBe(`${CATCH_UP_INSTRUCTIONS}\n\n${digest}`);
    expect(t.last().status).toContain('No chat is opened or marked as read.');
    expect(ids(t.last())).toEqual(['send', 'close']);
    expect(t.deps.core.ask).not.toHaveBeenCalled();
    await t.bar.button('send');
    expect(t.deps.core.ask).toHaveBeenCalledExactlyOnceWith(READY, CATCH_UP_INSTRUCTIONS, digest);
    expect(t.last().result).toBe('- Bo says hi.');
    await t.bar.button('send');
    expect(t.deps.core.ask).toHaveBeenCalledOnce();
    vi.mocked(t.deps.accounts.readUnreadSummary).mockResolvedValueOnce([]);
    await t.bar.catchUp();
    expect(t.last().status).toBe('No chat has unread messages.');
  });

  it('closes a catch-up preview without sending it', async () => {
    const t = harness();
    await t.bar.catchUp();
    await t.bar.button('close');
    expect(t.last().result).toBeNull();
  });

  it('says what is missing, with a one-click fix', async () => {
    const t = harness();
    const cases: [Partial<Setup>, string, string][] = [
      [
        { missing: 'setup', provider: undefined },
        'Set up the assistant to start: choose where it thinks.',
        'Set up…',
      ],
      [{ missing: 'key' }, 'Paste your API key for Claude (Anthropic) to start.', 'Paste a key…'],
      [
        { missing: 'model', provider: 'openai' },
        'OpenAI listed no model. Check its key, or that it runs.',
        'Open settings',
      ],
      [
        { missing: 'model', provider: 'local' },
        'The model server on this computer does not answer. Start it, then try again.',
        'Open settings',
      ],
      [
        { missing: 'download', provider: 'built-in' },
        'Download the private model to start.',
        'Set up…',
      ],
    ];
    for (const [change, status, fix] of cases) {
      t.setSetup({ ...READY, ...change, models: [] });
      await t.bar.suggest();
      expect([t.last().status, t.last().buttons[0]?.label]).toEqual([status, fix]);
      expect(t.last().choice).toBeUndefined();
    }
    await t.bar.button('fix');
    expect(t.deps.openSettings).toHaveBeenCalledOnce();
    expect(t.deps.accounts.readActiveChat).not.toHaveBeenCalled();
    await t.bar.catchUp();
    expect(t.deps.accounts.readUnreadSummary).not.toHaveBeenCalled();
  });

  it('says how the private model’s download stands, and resumes it or tries the smaller one', async () => {
    const t = harness();
    t.setSetup({ ...READY, provider: 'built-in', missing: 'download', models: [] });
    const said = async (phase: PrivateModelStatus['phase'], smaller = true) => {
      t.setModel({ ...PRIVATE, phase, smaller });
      await t.bar.suggest();
      return [t.last().status, t.last().buttons.map(({ label }) => label)];
    };
    expect(await said({ kind: 'downloading', done: 400 })).toEqual([
      'Downloading: 40% (1 MB of 1 MB)',
      [],
    ]);
    expect(await said({ kind: 'paused', problem: '', done: 500 })).toEqual([
      'Paused at 50%.',
      ['Resume download'],
    ]);
    await t.bar.button('fix');
    expect(t.deps.privateModels.download).toHaveBeenCalledOnce();
    expect(await said({ kind: 'paused', problem: 'failed', done: 500 })).toEqual([
      'The download stopped at 50%. Check your connection, then resume.',
      ['Resume download'],
    ]);
    expect(await said({ kind: 'paused', problem: 'disk-full', done: 0 })).toEqual([
      'Not enough disk space: free up 1 MB, then resume.',
      ['Resume download'],
    ]);
    expect(await said({ kind: 'damaged' })).toEqual([
      'The download was damaged, so it was deleted. Download it again.',
      ['Download'],
    ]);
    expect(await said({ kind: 'out-of-memory' })).toEqual([
      'This computer doesn’t have enough memory for this model.',
      ['Try the smaller model'],
    ]);
    await t.bar.button('fix');
    expect(t.deps.privateModels.smaller).toHaveBeenCalledOnce();
    expect(await said({ kind: 'out-of-memory' }, false)).toEqual([
      'This computer doesn’t have enough memory for the private model. Close other apps, then try again.',
      [],
    ]);
    await t.bar.button('fix');
  });

  it('explains a failed request, offering a key or the smaller model where that mends it', async () => {
    const t = harness();
    t.allow();
    const failing = async (error: unknown, provider: Setup['provider'] = 'anthropic') => {
      t.setSetup({ ...READY, provider });
      vi.mocked(t.deps.core.ask).mockRejectedValueOnce(error);
      await t.bar.suggest();
      return [t.last().status, t.last().buttons.map(({ label }) => label)];
    };
    expect(await failing(new ProviderError('auth'))).toEqual([
      'Claude (Anthropic) did not accept your key.',
      ['Paste a key…'],
    ]);
    expect(await failing(new ProviderError('rate-limited'), 'openai')).toEqual([
      'OpenAI is busy, or your quota is used up. Try again later.',
      [],
    ]);
    expect(await failing(new ProviderError('network'), 'local')).toEqual([
      'The model server on this computer could not be reached.',
      [],
    ]);
    expect((await failing(new ProviderError('timeout')))[0]).toBe(
      'Claude (Anthropic) took too long to answer.',
    );
    expect((await failing(new ProviderError('refused')))[0]).toBe('The model declined to answer.');
    expect((await failing(new ProviderError('bad-request')))[0]).toBe(
      'Claude (Anthropic) did not accept the request. Try another model.',
    );
    expect((await failing(new ProviderError('cancelled')))[0]).toBe('Stopped.');
    expect(await failing(new Error('quoting a chat'))).toEqual([
      'Something went wrong. Try again.',
      [],
    ]);
    expect(await failing(new ProviderError('out-of-memory'), 'built-in')).toEqual([
      'This computer doesn’t have enough memory for this model.',
      ['Try the smaller model'],
    ]);
    expect(t.deps.privateModels.outOfMemory).toHaveBeenCalledOnce();
    t.setModel({ ...PRIVATE, smaller: false });
    expect((await failing(new ProviderError('out-of-memory'), 'built-in'))[1]).toEqual([]);
    t.setSetup(READY);
    vi.mocked(t.deps.core.ask).mockRejectedValueOnce(new ProviderError('timeout'));
    await t.bar.catchUp();
    await t.bar.button('send');
    expect(t.last().status).toBe('Claude (Anthropic) took too long to answer.');
  });

  it('switches to an offered model, and suggests again with it if suggestions showed', async () => {
    const t = harness();
    t.allow();
    await t.bar.refresh();
    await t.bar.choose('claude-gone');
    expect(t.deps.settings.update).not.toHaveBeenCalled();
    await t.bar.choose('claude-opus');
    expect(t.settings()['model']).toBe('claude-opus');
    expect(t.deps.core.ask).not.toHaveBeenCalled();
    await t.bar.suggest();
    await t.bar.choose('auto');
    expect(t.settings()['model']).toBe('auto');
    expect(t.deps.core.ask).toHaveBeenCalledTimes(2);
  });

  it('suggests on its own as messages arrive, only where it may already read the chat', async () => {
    const t = harness();
    await t.bar.suggestOnArrival();
    expect(t.deps.core.ask).not.toHaveBeenCalled();
    expect(t.last().status).toBe('');
    t.allow();
    t.setSetup({ ...READY, missing: 'key' });
    await t.bar.suggestOnArrival();
    expect(t.deps.accounts.readActiveChat).toHaveBeenCalledOnce();
    t.setSetup(READY);
    await t.bar.suggestOnArrival();
    expect(t.last().suggestions).toHaveLength(2);
  });

  it('takes suggestions away once another chat is open, and keeps them in their own chat', async () => {
    const t = harness();
    t.allow();
    await t.bar.suggest();
    await t.bar.chatRedrawn();
    expect(t.deps.accounts.readActiveChat).toHaveBeenLastCalledWith(1);
    expect(t.last().suggestions).toEqual(['Yes, 8 works!', 'Can we do 9?']);
    t.setChat({ ...CHAT, name: 'Bo' });
    await t.bar.chatRedrawn();
    expect(t.last().suggestions).toEqual([]);
    expect(t.last().status).toBe('');
    vi.mocked(t.deps.accounts.readActiveChat).mockClear();
    await t.bar.chatRedrawn();
    expect(t.deps.accounts.readActiveChat).not.toHaveBeenCalled();
  });

  it('takes a summary or a consent question away when its chat closes, but not the bar', async () => {
    const t = harness('- Dinner at 8.');
    t.allow();
    await t.bar.summarize();
    t.setChat(null);
    await t.bar.chatRedrawn();
    expect(t.last().result).toBeNull();
    t.setChat({ ...CHAT, name: 'Bo' });
    await t.bar.suggest();
    expect(ids(t.last())).toEqual(['allow', 'what-sent']);
    t.setChat(CHAT);
    await t.bar.chatRedrawn();
    expect(ids(t.last())).toEqual([]);
    await t.bar.send(0);
    vi.mocked(t.deps.accounts.readActiveChat).mockClear();
    await t.bar.chatRedrawn();
    expect(t.deps.accounts.readActiveChat).not.toHaveBeenCalled();
  });

  it('checks the chat once the request that runs ends, and leaves a chat it cannot read', async () => {
    const t = harness();
    t.allow();
    let finish: (answer: string) => void = () => undefined;
    vi.mocked(t.deps.core.ask).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const asking = t.bar.suggest();
    await vi.waitFor(() => {
      expect(t.deps.core.ask).toHaveBeenCalledOnce();
    });
    await t.bar.chatRedrawn();
    t.setChat({ ...CHAT, name: 'Bo' });
    finish('One');
    await asking;
    expect(t.last().suggestions).toEqual([]);
    t.setChat(CHAT);
    await t.bar.suggest();
    vi.mocked(t.deps.accounts.readActiveChat).mockRejectedValueOnce(new Error('unreadable'));
    await t.bar.chatRedrawn();
    expect(t.last().suggestions).toEqual(['Yes, 8 works!', 'Can we do 9?']);
  });

  it('runs one request at a time, and accepts only the buttons it shows', async () => {
    const t = harness();
    t.allow();
    let finish: (answer: string) => void = () => undefined;
    vi.mocked(t.deps.core.ask).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = t.bar.suggest();
    await vi.waitFor(() => {
      expect(t.deps.core.ask).toHaveBeenCalledOnce();
    });
    await t.bar.summarize();
    await t.bar.catchUp();
    finish('One');
    await first;
    expect(t.deps.core.ask).toHaveBeenCalledOnce();
    await t.bar.button('allow');
    await t.bar.button('fix');
    expect(t.deps.chats.allow).not.toHaveBeenCalled();
    expect(t.deps.openSettings).not.toHaveBeenCalled();
  });

  it('answers nothing when the setup broke between asking and the user’s click', async () => {
    const t = harness();
    await t.bar.suggest();
    t.setSetup({ ...READY, missing: 'key' });
    await t.bar.button('allow');
    expect(t.deps.core.ask).not.toHaveBeenCalled();
    expect(t.last().status).toContain('Paste your API key');
    t.setSetup(READY);
    await t.bar.catchUp();
    t.setSetup({ ...READY, missing: 'key' });
    await t.bar.button('send');
    expect(t.deps.core.ask).not.toHaveBeenCalled();
  });

  it('leaves what the user reads alone on refresh, and clears a fixed setup problem', async () => {
    const t = harness('- Summary');
    t.allow();
    await t.bar.summarize();
    await t.bar.refresh();
    expect(t.last().result).toBe('- Summary');
    await t.bar.button('close');
    t.setSetup({ ...READY, missing: 'key' });
    await t.bar.refresh();
    expect(t.last().status).toContain('Paste your API key');
    t.setSetup(READY);
    await t.bar.refresh();
    expect(t.last().status).toBe('');
    t.settings()['enabled'] = false;
    await t.bar.refresh();
    expect(t.deps.show).toHaveBeenLastCalledWith(false);
  });

  it('follows the private model’s download while it has nothing else to show', async () => {
    const t = harness();
    t.setModel({ ...PRIVATE, phase: { kind: 'downloading', done: 500 } });
    await t.bar.privateModelChanged();
    expect(t.last().status).toMatch(/^Downloading: 50%/);
    t.setModel({ ...PRIVATE, phase: { kind: 'ready' } });
    await t.bar.privateModelChanged();
    expect(t.last().status).toBe('');
    t.allow();
    await t.bar.suggest();
    t.setModel({ ...PRIVATE, phase: { kind: 'downloading', done: 600 } });
    await t.bar.privateModelChanged();
    expect(t.last().suggestions).toHaveLength(2);
  });
});
