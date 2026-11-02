import { describe, expect, it, vi } from 'vitest';
import { accountNotifier, notificationIcon, type NativeOptions } from './notifier.ts';

function setup(heading?: string) {
  const natives: {
    options: NativeOptions;
    show: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    click: () => void;
    reply: (text: string) => void;
  }[] = [];
  let time = 0;
  const deps = {
    create: vi.fn((options: NativeOptions) => {
      const listeners = new Map<string, (details?: { reply: string }) => void>();
      const native = {
        options,
        show: vi.fn(),
        close: vi.fn(),
        on: vi.fn((event: string, listener: (details?: { reply: string }) => void) => {
          listeners.set(event, listener);
        }),
        click: () => {
          listeners.get('click')?.();
        },
        reply: (text: string) => {
          listeners.get('reply')?.({ reply: text });
        },
      };
      natives.push(native);
      return native;
    }),
    isSupported: vi.fn(() => true),
    inlineReply: false,
    privacy: vi.fn(() => ({ sender: true, text: true })),
    now: () => time,
    wait: vi.fn(() => new Promise<void>(() => undefined)),
    warn: vi.fn(),
  };
  const account = {
    heading: () => heading,
    silenced: vi.fn(() => false),
    onClick: vi.fn(),
    onReply: vi.fn(),
    picture: vi.fn((url: string) => Promise.resolve<string | undefined>(`data:${url}`)),
  };
  return {
    deps,
    account,
    natives,
    notifier: accountNotifier(deps, account),
    advance: (ms: number) => {
      time += ms;
    },
  };
}

const request = (id: string, extra: object = {}) => ({ id, title: 'Alice', body: 'Hi', ...extra });

describe('accountNotifier', () => {
  it('shows a notification with the page’s title, text and sound setting', () => {
    const t = setup();
    t.notifier.show(request('1', { silent: true }));
    expect(t.natives[0]?.options).toEqual({ title: 'Alice', body: 'Hi', silent: true });
    expect(t.natives[0]?.show).toHaveBeenCalledOnce();
  });

  it('names the account when there are several', () => {
    const t = setup('Work');
    t.notifier.show(request('1'));
    expect(t.natives[0]?.options.title).toBe('Work: Alice');
  });

  it('hides the sender or the text when the privacy options say so', () => {
    const t = setup('Work');
    t.deps.privacy.mockReturnValueOnce({ sender: false, text: true });
    t.notifier.show(request('1'));
    t.deps.privacy.mockReturnValueOnce({ sender: true, text: false });
    t.notifier.show(request('2'));
    expect(t.natives.map((native) => native.options)).toEqual([
      { title: 'Work: WhatsApp', body: 'Hi', silent: false },
      { title: 'Work: Alice', body: 'New message', silent: false },
    ]);
  });

  it('shows nothing while the account is silenced, and that counts against no limit', () => {
    const t = setup();
    t.account.silenced.mockReturnValue(true);
    for (let index = 0; index < 31; index += 1) {
      t.notifier.show(request(String(index)));
    }
    t.account.silenced.mockReturnValue(false);
    t.notifier.show(request('later'));
    expect(t.deps.create).toHaveBeenCalledOnce();
    expect(t.deps.warn).not.toHaveBeenCalled();
  });

  it('offers an inline reply where the system has one, and passes the reply on', () => {
    const t = setup();
    const replying = accountNotifier({ ...t.deps, inlineReply: true }, t.account);
    replying.show(request('3'));
    expect(t.natives[0]?.options).toEqual({
      title: 'Alice',
      body: 'Hi',
      silent: false,
      hasReply: true,
      replyPlaceholder: 'Reply',
    });
    t.natives[0]?.reply('On my way');
    expect(t.account.onReply).toHaveBeenCalledWith('3', 'On my way');
  });

  it('tells the account which notification was clicked', () => {
    const t = setup();
    t.notifier.show(request('7'));
    t.natives[0]?.click();
    expect(t.account.onClick).toHaveBeenCalledWith('7');
  });

  it('withdraws what WhatsApp closes, and everything on quit', () => {
    const t = setup();
    t.notifier.show(request('1'));
    t.notifier.show(request('2'));
    t.notifier.close('1');
    t.notifier.close(1);
    t.notifier.close('unknown');
    expect(t.natives[0]?.close).toHaveBeenCalledOnce();
    t.notifier.closeAll();
    expect(t.natives[1]?.close).toHaveBeenCalledOnce();
    expect(t.natives[0]?.close).toHaveBeenCalledOnce();
  });

  it('replaces a notification with the same tag', () => {
    const t = setup();
    t.notifier.show(request('1', { tag: 'chat' }));
    t.notifier.show(request('2', { tag: 'other' }));
    t.notifier.show(request('3', { tag: 'chat' }));
    t.notifier.show(request('4'));
    t.notifier.show(request('5'));
    expect(t.natives.map((native) => native.close.mock.calls.length)).toEqual([1, 0, 0, 0, 0]);
  });

  it('keeps long text within limits', () => {
    const t = setup();
    t.notifier.show({ id: '1', title: 'x'.repeat(300), body: 'y'.repeat(1200) });
    expect(t.natives[0]?.options.title).toHaveLength(256);
    expect(t.natives[0]?.options.body).toHaveLength(1000);
    t.notifier.show({ id: '2', title: 'Alice' });
    expect(t.natives[1]?.options).toEqual({ title: 'Alice', body: '', silent: false });
  });

  it.each([42, 'x'.repeat(2049)])('shows a notification without an odd picture: %j', (icon) => {
    const t = setup();
    t.notifier.show(request('1', { icon }));
    expect(t.account.picture).not.toHaveBeenCalled();
    expect(t.natives[0]?.options).toEqual({ title: 'Alice', body: 'Hi', silent: false });
  });

  it.each([
    null,
    'text',
    { id: 1, title: 'Alice' },
    { id: 'x'.repeat(33), title: 'Alice' },
    { id: '1', title: 42 },
    { id: '1', title: 'Alice', body: {} },
    { id: '1', title: 'Alice', tag: 3 },
    { id: '1', title: 'Alice', silent: 'yes' },
  ])('drops a malformed request without logging its content: %j', (malformed) => {
    const t = setup();
    t.notifier.show(malformed);
    expect(t.deps.create).not.toHaveBeenCalled();
    expect(t.deps.warn).toHaveBeenCalledWith('Dropped a malformed notification from WhatsApp.');
  });

  it('shows at most 30 notifications a minute', () => {
    const t = setup();
    for (let index = 0; index < 31; index += 1) {
      t.notifier.show(request(String(index)));
    }
    expect(t.deps.create).toHaveBeenCalledTimes(30);
    expect(t.deps.warn).toHaveBeenCalledWith(
      'Dropped a notification: WhatsApp sent too many at once.',
    );
    t.advance(60_000);
    t.notifier.show(request('later'));
    expect(t.deps.create).toHaveBeenCalledTimes(31);
  });

  it('logs a missing notification service once per outage and tries again later', () => {
    const t = setup();
    t.deps.isSupported.mockReturnValue(false);
    t.notifier.show(request('1'));
    t.notifier.show(request('2'));
    expect(t.deps.warn).toHaveBeenCalledOnce();
    t.deps.isSupported.mockReturnValue(true);
    t.notifier.show(request('3'));
    expect(t.deps.create).toHaveBeenCalledOnce();
    t.deps.isSupported.mockReturnValue(false);
    t.notifier.show(request('4'));
    expect(t.deps.warn).toHaveBeenCalledTimes(2);
  });
});

describe('accountNotifier with chat pictures', () => {
  const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

  it('shows the chat’s picture once it is fetched', async () => {
    const t = setup();
    t.notifier.show(request('1', { icon: 'https://pps.whatsapp.net/a' }));
    expect(t.deps.create).not.toHaveBeenCalled();
    await flush();
    expect(t.account.picture).toHaveBeenCalledWith('https://pps.whatsapp.net/a');
    expect(t.natives[0]?.options).toEqual({
      title: 'Alice',
      body: 'Hi',
      silent: false,
      icon: 'data:https://pps.whatsapp.net/a',
    });
  });

  it('fetches nothing when the sender is hidden, since the picture would tell who wrote', () => {
    const t = setup();
    t.deps.privacy.mockReturnValue({ sender: false, text: true });
    t.notifier.show(request('1', { icon: 'https://pps.whatsapp.net/a' }));
    expect(t.account.picture).not.toHaveBeenCalled();
    expect(t.natives[0]?.options).toEqual({ title: 'WhatsApp', body: 'Hi', silent: false });
  });

  it('leaves the picture out when the sender is hidden while it is fetched', async () => {
    const t = setup();
    t.notifier.show(request('1', { icon: 'https://pps.whatsapp.net/a' }));
    t.deps.privacy.mockReturnValue({ sender: false, text: true });
    await flush();
    expect(t.natives[0]?.options).toEqual({ title: 'WhatsApp', body: 'Hi', silent: false });
  });

  it('shows the notification without a picture that cannot be fetched', async () => {
    const t = setup();
    t.account.picture.mockResolvedValueOnce(undefined);
    t.notifier.show(request('1', { icon: 'https://example.com/a' }));
    await flush();
    expect(t.natives[0]?.options).toEqual({ title: 'Alice', body: 'Hi', silent: false });
  });

  it('waits for a slow picture only briefly, and keeps it once it comes', async () => {
    const t = setup();
    let deliver: (picture: string) => void = () => undefined;
    t.account.picture.mockReturnValueOnce(
      new Promise((resolve) => {
        deliver = resolve;
      }),
    );
    t.deps.wait.mockResolvedValueOnce(undefined);
    t.notifier.show(request('1', { icon: 'https://pps.whatsapp.net/a' }));
    await flush();
    expect(t.deps.wait).toHaveBeenCalledWith(1500);
    expect(t.natives[0]?.options).toEqual({ title: 'Alice', body: 'Hi', silent: false });
    deliver('data:late');
    await flush();
    t.notifier.show(request('2', { icon: 'https://pps.whatsapp.net/a' }));
    await flush();
    expect(t.account.picture).toHaveBeenCalledOnce();
    expect(t.natives[1]?.options.icon).toBe('data:late');
  });

  it('fetches each chat’s picture once, keeping the 50 most recent', async () => {
    const t = setup();
    for (let index = 0; index < 51; index += 1) {
      t.notifier.show(
        request(String(index), { icon: `https://pps.whatsapp.net/${String(index)}` }),
      );
      await flush();
      t.advance(60_000);
    }
    t.notifier.show(request('again', { icon: 'https://pps.whatsapp.net/50' }));
    t.notifier.show(request('first', { icon: 'https://pps.whatsapp.net/0' }));
    await flush();
    expect(t.account.picture).toHaveBeenCalledTimes(52);
    expect(t.account.picture).toHaveBeenLastCalledWith('https://pps.whatsapp.net/0');
    expect(t.natives.at(-2)?.options.icon).toBe('data:https://pps.whatsapp.net/50');
  });

  it('keeps a picture used again among the most recent', async () => {
    const t = setup();
    const show = async (id: string, picture: number) => {
      t.notifier.show(request(id, { icon: `https://pps.whatsapp.net/${String(picture)}` }));
      await flush();
      t.advance(60_000);
    };
    for (let index = 0; index < 50; index += 1) {
      await show(String(index), index);
    }
    await show('again', 0);
    await show('new', 50);
    await show('first', 0);
    await show('second', 1);
    expect(t.account.picture).toHaveBeenCalledTimes(52);
    expect(t.account.picture).toHaveBeenLastCalledWith('https://pps.whatsapp.net/1');
  });

  it('never shows a notification the page closed while its picture was fetched', async () => {
    const t = setup();
    t.notifier.show(request('1', { icon: 'https://pps.whatsapp.net/a' }));
    t.notifier.close('1');
    await flush();
    t.notifier.show(request('2', { icon: 'https://pps.whatsapp.net/b' }));
    t.notifier.closeAll();
    await flush();
    expect(t.deps.create).not.toHaveBeenCalled();
  });

  it('never shows a waiting notification that one with its tag replaced', async () => {
    const t = setup();
    t.notifier.show(request('1', { icon: 'https://pps.whatsapp.net/a', tag: 'chat' }));
    t.notifier.show(request('2', { icon: 'https://pps.whatsapp.net/b', tag: 'other' }));
    t.notifier.show(request('3', { tag: 'chat' }));
    await flush();
    expect(t.natives.map((native) => native.options.title)).toEqual(['Alice', 'Alice']);
    expect(t.natives.map((native) => native.options.icon)).toEqual([
      undefined,
      'data:https://pps.whatsapp.net/b',
    ]);
  });

  it('keeps waiting notifications without a tag when another arrives', async () => {
    const t = setup();
    t.notifier.show(request('1', { icon: 'https://pps.whatsapp.net/a' }));
    t.notifier.show(request('2'));
    await flush();
    expect(t.deps.create).toHaveBeenCalledTimes(2);
  });
});

describe('notificationIcon', () => {
  it('decodes the chat’s picture, or keeps YapYap’s own icon', () => {
    const decode = (url: string) => `image of ${url}`;
    expect(notificationIcon('data:a', 'own', decode)).toBe('image of data:a');
    expect(notificationIcon(undefined, 'own', decode)).toBe('own');
  });
});
