import type { NotificationBridge } from '../../shared/notification-api.ts';

type Handler = ((this: EventTarget, event: Event) => unknown) | null;

/** The options YapYap reads; anything else the page passes is ignored. */
interface ShimOptions {
  readonly body?: unknown;
  readonly tag?: unknown;
  readonly silent?: unknown;
  readonly icon?: unknown;
}

/**
 * Replaces the page's `Notification` with a stand-in that hands each
 * notification to YapYap (ADR 0011). It runs in WhatsApp's main world, sent
 * there as source text, so it must not use anything from outside its body.
 */
export function installNotificationShim(bridgeName: string): void {
  const bridge = Reflect.get(globalThis, bridgeName) as NotificationBridge;
  const open = new Map<string, PageNotification>();
  let count = 0;
  class PageNotification extends EventTarget {
    static readonly permission = 'granted';
    static requestPermission(): Promise<string> {
      return Promise.resolve('granted');
    }
    onclick: Handler = null;
    onclose: Handler = null;
    readonly id: string;
    constructor(title: unknown, options: ShimOptions = {}) {
      super();
      count += 1;
      this.id = String(count);
      open.set(this.id, this);
      const { body, tag, silent, icon } = options;
      // YapYap checks every field; the page's own objects never cross over.
      bridge.show({ id: this.id, title, body, tag, silent, icon });
    }
    fire(type: 'click' | 'close'): void {
      const event = new Event(type);
      (type === 'click' ? this.onclick : this.onclose)?.call(this, event);
      this.dispatchEvent(event);
    }
    close(): void {
      if (open.delete(this.id)) {
        bridge.close(this.id);
        this.fire('close');
      }
    }
  }
  bridge.onClick((id) => {
    open.get(id)?.fire('click');
  });
  Reflect.set(globalThis, 'Notification', PageNotification);
}
