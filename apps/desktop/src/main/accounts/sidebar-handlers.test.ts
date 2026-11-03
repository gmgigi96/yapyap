import { describe, expect, it, vi } from 'vitest';
import type { SidebarAccount } from '../../shared/chrome-api.ts';
import { defaultSettings } from '../settings/decode.ts';
import type { Settings } from '../settings/schema.ts';
import type { ViewRegistry } from '../security/views.ts';
import { attachSidebar, sidebarHandlers, type SidebarSlot } from './sidebar-handlers.ts';

const account = (id: string): SidebarAccount => ({
  id,
  name: id,
  color: 'green',
  unread: 0,
  muted: false,
  active: id === 'a',
  sharing: id === 'b',
  avatar: undefined,
});

const source = (ids: string[], compact = false) => ({
  state: { accounts: ids.map(account), compact, doNotDisturb: false },
  switchTo: vi.fn(),
  stopSharing: vi.fn(),
});

function setup(load: () => Promise<unknown> = () => Promise.resolve()) {
  const port = {
    webContents: { loadURL: vi.fn(load), send: vi.fn() },
    setWidth: vi.fn(),
  };
  const views: ViewRegistry = new WeakMap();
  const slot: SidebarSlot = {};
  const warn = vi.fn();
  return { port, views, slot, warn, show: attachSidebar(port, views, slot, warn) };
}

describe('attachSidebar', () => {
  it('registers its page as chrome, and keeps the whole window for one account', () => {
    const t = setup();
    expect(t.views.get(t.port.webContents)).toEqual({
      zone: 'chrome',
      home: 'app://chrome',
      label: 'YapYap',
    });
    const one = source(['a']);
    t.show(one);
    expect(t.port.setWidth).toHaveBeenCalledWith(0);
    expect(t.port.webContents.loadURL).not.toHaveBeenCalled();
    expect(t.slot.current).toBe(one);
  });

  it('docks for several accounts, loads its page once and sends every state', () => {
    const t = setup();
    const two = source(['a', 'b']);
    t.show(two);
    t.show(source(['a', 'b'], true));
    expect(t.port.setWidth.mock.calls).toEqual([[220], [64]]);
    expect(t.port.webContents.loadURL).toHaveBeenCalledExactlyOnceWith('app://chrome/sidebar.html');
    expect(t.port.webContents.send).toHaveBeenCalledWith('sidebar:state-changed', two.state);
    expect(t.port.webContents.send).toHaveBeenCalledTimes(2);
  });

  it('warns when its page cannot load', async () => {
    const t = setup(() => Promise.reject(new Error('gone')));
    t.show(source(['a', 'b']));
    await vi.waitFor(() => {
      expect(t.warn).toHaveBeenCalledWith('Could not load the account sidebar.');
    });
  });
});

describe('sidebarHandlers', () => {
  function handlers() {
    const slot: SidebarSlot = {};
    const update = vi.fn();
    const list = sidebarHandlers(slot, { update });
    const handler = (channel: string) => {
      const found = list.find((candidate) => candidate.channel === channel);
      if (found === undefined) {
        throw new Error(`No handler for ${channel}`);
      }
      return found;
    };
    return { slot, update, handler, call: { sender: {} } };
  }

  it('answers the state, or null before the accounts open', () => {
    const t = handlers();
    expect(t.handler('sidebar:state').handle(t.call)).toBeNull();
    t.slot.current = source(['a', 'b']);
    expect(t.handler('sidebar:state').handle(t.call)).toBe(t.slot.current.state);
    expect(t.handler('sidebar:state').accepts(['extra'])).toBe(false);
  });

  it('switches only to an account it lists', () => {
    const t = handlers();
    const switchTo = t.handler('sidebar:switch');
    expect(switchTo.accepts(['a'])).toBe(false);
    const current = source(['a', 'b']);
    t.slot.current = current;
    expect(switchTo.accepts(['b'])).toBe(true);
    expect(switchTo.accepts(['z'])).toBe(false);
    expect(switchTo.accepts([1])).toBe(false);
    expect(switchTo.accepts(['b', 'extra'])).toBe(false);
    switchTo.handle(t.call, 'b');
    expect(current.switchTo).toHaveBeenCalledWith('b');
  });

  it('stops a share only for a listed account that is sharing', () => {
    const t = handlers();
    const stop = t.handler('sidebar:stop-sharing');
    expect(stop.accepts(['b'])).toBe(false);
    const current = source(['a', 'b']);
    t.slot.current = current;
    expect(stop.accepts(['b'])).toBe(true);
    expect(stop.accepts(['a'])).toBe(false);
    expect(stop.accepts(['b', 'extra'])).toBe(false);
    stop.handle(t.call, 'b');
    expect(current.stopSharing).toHaveBeenCalledWith('b');
  });

  it('stores the layout in the settings', () => {
    const t = handlers();
    const setCompact = t.handler('sidebar:set-compact');
    expect(setCompact.accepts([true])).toBe(true);
    expect(setCompact.accepts(['yes'])).toBe(false);
    expect(setCompact.accepts([true, false])).toBe(false);
    setCompact.handle(t.call, true);
    const [change] = t.update.mock.calls[0] as [(settings: Settings) => Settings];
    const settings = defaultSettings();
    expect(change(settings)).toEqual({
      ...settings,
      appearance: { ...settings.appearance, compactSidebar: true },
    });
  });
});
