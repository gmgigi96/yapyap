import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeEmitter } from '../../../test/emitter.ts';
import { TRANSIENT_POPUP_MS } from '../navigation/navigation-guard.ts';
import { installSecurity, type GuardedContents } from './security.ts';
import { rendererPreferences } from '../window/web-preferences.ts';

type Listener = (...args: never[]) => void;

function setup() {
  const appListeners = new Map<string, Listener>();
  const app = {
    on: vi.fn((event: string, listener: Listener) => appListeners.set(event, listener)),
  };
  const { on, fire } = fakeEmitter();
  let openHandler: (details: { url: string }) => unknown = () => undefined;
  const contents = {
    on,
    setWindowOpenHandler: vi.fn((handler: typeof openHandler) => {
      openHandler = handler;
    }),
    loadURL: vi.fn(() => Promise.resolve()),
    once: vi.fn(),
  };
  const home = 'https://web.whatsapp.com';
  const views = new WeakMap([[contents, { zone: 'whatsapp' as const, home, label: 'WhatsApp' }]]);
  const openExternal = vi.fn(() => Promise.resolve());
  const capture = {
    contentsOfFrame: vi.fn(),
    isVisibleAndFocused: vi.fn(),
    pick: undefined,
    useSystemPicker: false,
  };
  const askMedia = vi.fn(() => Promise.resolve(false));
  const identity = { userAgent: 'Chrome UA', chromeVersion: '152.0.7977.167' };
  const whatsAppPreload = '/app/preload/whatsapp.cjs';
  installSecurity(app, {
    views,
    openExternal,
    warn: vi.fn(),
    askMedia,
    capture,
    identity,
    whatsAppPreload,
  });
  appListeners.get('web-contents-created')?.(...([{}, contents as GuardedContents] as never[]));
  const createContents = (other: object): void => {
    appListeners.get('web-contents-created')?.(...([{}, other] as never[]));
  };
  const createSession = (session: object): void => {
    appListeners.get('session-created')?.(...([session] as never[]));
  };
  return {
    contents,
    views: views as WeakMap<object, unknown>,
    fire,
    openExternal,
    createContents,
    createSession,
    open: (url: string) => openHandler({ url }),
  };
}

describe('secureAllWebContents', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('guards each web contents against webviews, Bluetooth and off-origin navigation', () => {
    const t = setup();
    const attach = { preventDefault: vi.fn() };
    t.fire('will-attach-webview', attach);
    const bluetooth = { preventDefault: vi.fn() };
    const choose = vi.fn();
    t.fire('select-bluetooth-device', bluetooth, [], choose);
    expect(bluetooth.preventDefault).toHaveBeenCalledOnce();
    expect(choose).toHaveBeenCalledExactlyOnceWith('');
    const leave = { url: 'https://example.com/', isMainFrame: true, preventDefault: vi.fn() };
    const stay = { url: 'https://web.whatsapp.com/x', isMainFrame: true, preventDefault: vi.fn() };
    t.fire('will-navigate', leave);
    t.fire('will-navigate', stay);
    expect(attach.preventDefault).toHaveBeenCalledOnce();
    expect(leave.preventDefault).toHaveBeenCalledOnce();
    expect(stay.preventDefault).not.toHaveBeenCalled();
    expect(t.openExternal).toHaveBeenCalledExactlyOnceWith('https://example.com/');
  });

  it('gives transient popups the hardened preferences and discards them on a timer', () => {
    const t = setup();
    // WhatsApp's windows get its preload too, so its notifications work in calls.
    expect(t.open('about:blank')).toEqual({
      action: 'allow',
      overrideBrowserWindowOptions: {
        show: false,
        webPreferences: rendererPreferences({ preload: '/app/preload/whatsapp.cjs' }),
      },
    });
    const popup = {
      webContents: { once: vi.fn(), on: vi.fn(), getURL: () => '' },
      isDestroyed: () => false,
      destroy: vi.fn(),
      show: vi.fn(),
      close: vi.fn(),
    };
    t.fire('did-create-window', popup);
    // The popup belongs to the account that opened it, as far as every guard goes.
    expect(t.views.get(popup.webContents)).toEqual(t.views.get(t.contents));
    vi.advanceTimersByTime(TRANSIENT_POPUP_MS - 1);
    expect(popup.destroy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(popup.destroy).toHaveBeenCalledOnce();
  });

  it('gives no zone to a popup of a web contents YapYap did not create', () => {
    const t = setup();
    const stranger = { ...t.contents, on: vi.fn<(event: string, listener: Listener) => void>() };
    t.createContents(stranger);
    const [, created] =
      stranger.on.mock.calls.find(([event]) => event === 'did-create-window') ?? [];
    const popup = {
      webContents: { once: vi.fn(), on: vi.fn(), getURL: () => '' },
      isDestroyed: () => false,
      destroy: vi.fn(),
      show: vi.fn(),
      close: vi.fn(),
    };
    created?.(...([popup] as never[]));
    expect(t.views.get(popup.webContents)).toBeUndefined();
    const [opened] = stranger.setWindowOpenHandler.mock.calls.at(-1) ?? [];
    expect(opened?.({ url: 'about:blank' })).toEqual({
      action: 'allow',
      overrideBrowserWindowOptions: { show: false, webPreferences: rendererPreferences({}) },
    });
  });

  it('treats web contents YapYap did not create as having no home', () => {
    const t = setup();
    const stranger = {
      ...t.contents,
      on: vi.fn<(event: string, listener: (event: unknown) => void) => void>(),
    };
    t.createContents(stranger);
    const [, listener] = stranger.on.mock.calls.find(([event]) => event === 'will-navigate') ?? [];
    const event = { url: 'https://web.whatsapp.com/', isMainFrame: true, preventDefault: vi.fn() };
    listener?.(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('applies the permission policy and the Chrome identity to every new session', () => {
    const t = setup();
    const session = {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
      setDevicePermissionHandler: vi.fn(),
      setDisplayMediaRequestHandler: vi.fn(),
      setUserAgent: vi.fn(),
      setSpellCheckerEnabled: vi.fn(),
      setSpellCheckerLanguages: vi.fn(),
      webRequest: { onBeforeSendHeaders: vi.fn() },
    };
    t.createSession(session);
    expect(session.setPermissionRequestHandler).toHaveBeenCalledOnce();
    expect(session.setUserAgent).toHaveBeenCalledExactlyOnceWith('Chrome UA');
    expect(session.setDisplayMediaRequestHandler).toHaveBeenCalledWith(expect.any(Function), {
      useSystemPicker: false,
    });
  });

  it('stops every session from fetching spelling dictionaries', () => {
    const t = setup();
    const session = {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
      setDevicePermissionHandler: vi.fn(),
      setDisplayMediaRequestHandler: vi.fn(),
      setUserAgent: vi.fn(),
      setSpellCheckerEnabled: vi.fn(),
      setSpellCheckerLanguages: vi.fn(),
      webRequest: { onBeforeSendHeaders: vi.fn() },
    };
    t.createSession(session);
    expect(session.setSpellCheckerEnabled).toHaveBeenCalledExactlyOnceWith(false);
    expect(session.setSpellCheckerLanguages).toHaveBeenCalledExactlyOnceWith([]);
  });
});
