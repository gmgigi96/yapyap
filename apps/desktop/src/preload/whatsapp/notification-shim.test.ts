// Node’s EventTarget follows the spec; happy-dom’s also calls on* handlers when dispatching.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installNotificationShim } from './notification-shim.ts';

interface Shim extends EventTarget {
  readonly id: string;
  onclick: ((event: Event) => unknown) | null;
  onclose: ((event: Event) => unknown) | null;
  close(): void;
}

type ShimClass = (new (title: unknown, options?: object) => Shim) & {
  readonly permission: string;
  requestPermission(): Promise<string>;
};

function install() {
  let clicked: ((id: string) => void) | undefined;
  const bridge = {
    show: vi.fn(),
    close: vi.fn(),
    onClick: vi.fn((listener: (id: string) => void) => {
      clicked = listener;
    }),
  };
  Reflect.set(globalThis, 'testBridge', bridge);
  installNotificationShim('testBridge');
  const Notification = Reflect.get(globalThis, 'Notification') as ShimClass;
  return { bridge, Notification, click: (id: string) => clicked?.(id) };
}

const original = Reflect.get(globalThis, 'Notification') as unknown;

afterEach(() => {
  Reflect.set(globalThis, 'Notification', original);
  Reflect.deleteProperty(globalThis, 'testBridge');
});

describe('installNotificationShim', () => {
  it('says notifications are allowed, as WhatsApp expects once YapYap grants them', async () => {
    const { Notification } = install();
    expect(Notification.permission).toBe('granted');
    await expect(Notification.requestPermission()).resolves.toBe('granted');
  });

  it('hands each notification to YapYap with its own ID, and only the fields it reads', () => {
    const { Notification, bridge } = install();
    const first = new Notification('Alice', {
      body: 'Hi',
      tag: 'chat-1',
      silent: true,
      icon: 'https://example.com/a.png',
      data: { message: 1 },
    });
    const second = new Notification('Bob');
    expect(first.id).not.toBe(second.id);
    expect(bridge.show.mock.calls).toEqual([
      [
        {
          id: first.id,
          title: 'Alice',
          body: 'Hi',
          tag: 'chat-1',
          silent: true,
          icon: 'https://example.com/a.png',
        },
      ],
      [
        {
          id: second.id,
          title: 'Bob',
          body: undefined,
          tag: undefined,
          silent: undefined,
          icon: undefined,
        },
      ],
    ]);
  });

  it('withdraws a notification WhatsApp closes, once, and tells the page', () => {
    const { Notification, bridge } = install();
    const notification = new Notification('Alice');
    notification.onclose = vi.fn();
    const listener = vi.fn();
    notification.addEventListener('close', listener);
    notification.close();
    notification.close();
    expect(bridge.close).toHaveBeenCalledExactlyOnceWith(notification.id);
    expect(notification.onclose).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledOnce();
  });

  it('passes a click on the native notification to the page', () => {
    const { Notification, click } = install();
    const notification = new Notification('Alice');
    const listener = vi.fn();
    notification.addEventListener('click', listener);
    click(notification.id);
    notification.onclick = vi.fn();
    click(notification.id);
    click('unknown');
    expect(listener).toHaveBeenCalledTimes(2);
    expect(notification.onclick).toHaveBeenCalledOnce();
  });

  it('ignores clicks on notifications the page already closed', () => {
    const { Notification, click } = install();
    const notification = new Notification('Alice');
    const listener = vi.fn();
    notification.addEventListener('click', listener);
    notification.close();
    click(notification.id);
    expect(listener).not.toHaveBeenCalled();
  });
});
