import { describe, expect, it, vi } from 'vitest';
import type { ViewInfo } from '../security/views.ts';
import {
  guardSession,
  type CaptureChoice,
  type CaptureSource,
  type DisplayCapturePort,
  type SessionGuardDependencies,
  type SessionPort,
} from './session-guard.ts';

const HOME = 'https://web.whatsapp.com';
const WHATSAPP: ViewInfo = { zone: 'whatsapp', home: HOME, label: 'Personal' };
const CHROME: ViewInfo = { zone: 'chrome', home: 'app://chrome', label: 'YapYap' };
const SOURCE: CaptureSource = { id: 'screen:1:0', name: 'Entire screen' };

interface Handlers {
  request: Parameters<SessionPort['setPermissionRequestHandler']>[0];
  check: Parameters<SessionPort['setPermissionCheckHandler']>[0];
  device: Parameters<SessionPort['setDevicePermissionHandler']>[0];
  display: Parameters<SessionPort['setDisplayMediaRequestHandler']>[0];
}

function setup(capture: Partial<DisplayCapturePort> = {}) {
  const whatsapp = {};
  const chrome = {};
  const frame = {};
  const views = new WeakMap<object, ViewInfo>([
    [whatsapp, WHATSAPP],
    [chrome, CHROME],
  ]);
  const deps = {
    views,
    askMedia: vi.fn(() => Promise.resolve(true)),
    openExternal: vi.fn(() => Promise.resolve()),
    warn: vi.fn(),
    capture: {
      contentsOfFrame: vi.fn(() => whatsapp),
      isVisibleAndFocused: vi.fn(() => true),
      pick: undefined,
      useSystemPicker: false,
      ...capture,
    },
  } satisfies SessionGuardDependencies;
  const handlers: Partial<Handlers> = {};
  const session = {
    setPermissionRequestHandler: vi.fn((handler: Handlers['request']) => {
      handlers.request = handler;
    }),
    setPermissionCheckHandler: vi.fn((handler: Handlers['check']) => {
      handlers.check = handler;
    }),
    setDevicePermissionHandler: vi.fn((handler: Handlers['device']) => {
      handlers.device = handler;
    }),
    setDisplayMediaRequestHandler: vi.fn((handler: Handlers['display']) => {
      handlers.display = handler;
    }),
  } satisfies SessionPort;
  const memory = guardSession(session, deps);
  const { request, check, device, display } = handlers as Handlers;
  const ask = (contents: object | null, permission: string, details: object = {}) =>
    new Promise<boolean>((resolve) => {
      request(contents, permission, resolve, { requestingUrl: `${HOME}/`, ...details });
    });
  const share = (request: { frame: object | null; securityOrigin?: string }) =>
    new Promise<unknown>((resolve) => {
      display({ securityOrigin: HOME, ...request }, resolve);
    });
  return { deps, session, whatsapp, chrome, frame, ask, check, device, share, memory };
}

const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('permission requests', () => {
  it('allows the WhatsApp allowlist only from the WhatsApp origin', async () => {
    const t = setup();
    expect(await t.ask(t.whatsapp, 'notifications')).toBe(true);
    expect(await t.ask(t.whatsapp, 'geolocation')).toBe(false);
    expect(
      await t.ask(t.whatsapp, 'notifications', { requestingUrl: 'https://ads.example/' }),
    ).toBe(false);
    expect(await t.ask(t.whatsapp, 'notifications', { requestingUrl: undefined })).toBe(false);
  });

  it('denies every request from app chrome, unknown and missing web contents', async () => {
    const t = setup();
    expect(await t.ask(t.chrome, 'notifications', { requestingUrl: 'app://chrome/' })).toBe(false);
    expect(await t.ask({}, 'notifications')).toBe(false);
    expect(await t.ask(null, 'notifications')).toBe(false);
  });

  it('asks before using the camera or microphone, naming the account, and remembers yes', async () => {
    const t = setup();
    expect(await t.ask(t.whatsapp, 'media', { mediaTypes: ['audio', 'video'] })).toBe(true);
    expect(t.deps.askMedia).toHaveBeenCalledExactlyOnceWith(WHATSAPP, ['audio', 'video']);
    expect(await t.ask(t.whatsapp, 'media', { mediaTypes: ['video'] })).toBe(true);
    expect(t.deps.askMedia).toHaveBeenCalledOnce();
  });

  it('tells which devices it remembers, and forgets them to ask again (#77)', async () => {
    const t = setup();
    expect(t.memory.allowed()).toEqual([]);
    await t.ask(t.whatsapp, 'media', { mediaTypes: ['video'] });
    expect(t.memory.allowed()).toEqual(['video']);
    t.memory.forget();
    expect(t.memory.allowed()).toEqual([]);
    await t.ask(t.whatsapp, 'media', { mediaTypes: ['video'] });
    expect(t.deps.askMedia).toHaveBeenCalledTimes(2);
  });

  it('asks only about devices that are not allowed yet', async () => {
    const t = setup();
    await t.ask(t.whatsapp, 'media', { mediaTypes: ['audio'] });
    await t.ask(t.whatsapp, 'media', { mediaTypes: ['audio', 'video'] });
    expect(t.deps.askMedia.mock.calls).toEqual([
      [WHATSAPP, ['audio']],
      [WHATSAPP, ['video']],
    ]);
  });

  it('asks again after the user says no, and denies when the prompt fails', async () => {
    const t = setup();
    t.deps.askMedia.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('closed'));
    expect(await t.ask(t.whatsapp, 'media', { mediaTypes: ['audio'] })).toBe(false);
    expect(await t.ask(t.whatsapp, 'media', { mediaTypes: ['audio'] })).toBe(false);
    expect(t.deps.askMedia).toHaveBeenCalledTimes(2);
  });

  it('routes external-app launches through the link policy and refuses them to Chromium', async () => {
    const t = setup();
    const external = (externalURL?: string) => t.ask(t.whatsapp, 'openExternal', { externalURL });
    expect(await external('mailto:someone@example.com')).toBe(false);
    expect(await external('ms-settings:privacy')).toBe(false);
    expect(await external(undefined)).toBe(false);
    expect(t.deps.openExternal).toHaveBeenCalledExactlyOnceWith('mailto:someone@example.com');
  });

  it('routes external-app launches from web contents YapYap does not know', async () => {
    const t = setup();
    expect(await t.ask(null, 'openExternal', { externalURL: 'https://example.com/' })).toBe(false);
    expect(t.deps.openExternal).toHaveBeenCalledExactlyOnceWith('https://example.com/');
  });

  it('logs a failed external launch without the link', async () => {
    const t = setup();
    t.deps.openExternal.mockRejectedValueOnce(new Error('no handler'));
    await t.ask(t.whatsapp, 'openExternal', { externalURL: 'tel:+351912345678' });
    await settle();
    expect(t.deps.warn).toHaveBeenCalledExactlyOnceWith('Could not open an external link.');
  });
});

describe('permission checks', () => {
  it('answers the allowlist only for WhatsApp on its own origin', () => {
    const t = setup();
    expect(t.check(t.whatsapp, 'notifications', HOME, {})).toBe(true);
    // Electron's form of the origin, with a trailing slash.
    expect(t.check(t.whatsapp, 'notifications', `${HOME}/`, {})).toBe(true);
    expect(t.check(t.whatsapp, 'notifications', 'https://ads.example', {})).toBe(false);
    expect(t.check(t.whatsapp, 'hid', HOME, {})).toBe(false);
    expect(t.check(t.chrome, 'notifications', 'app://chrome', {})).toBe(false);
    expect(t.check(null, 'notifications', HOME, {})).toBe(false);
  });

  it('lets WhatsApp go on to ask for media, which the request then puts to the user', async () => {
    const t = setup();
    expect(t.check(t.whatsapp, 'media', `${HOME}/`, { mediaType: 'audio' })).toBe(true);
    expect(t.check(t.whatsapp, 'media', `${HOME}/`, { mediaType: 'video' })).toBe(true);
    expect(t.check(t.whatsapp, 'media', 'https://ads.example/', { mediaType: 'audio' })).toBe(
      false,
    );
    expect(t.check(t.chrome, 'media', 'app://chrome/', { mediaType: 'audio' })).toBe(false);
    t.deps.askMedia.mockResolvedValueOnce(false);
    expect(await t.ask(t.whatsapp, 'media', { mediaTypes: ['audio'] })).toBe(false);
    expect(t.deps.askMedia).toHaveBeenCalledOnce();
  });
});

describe('device access', () => {
  it('denies every HID, USB and serial device', () => {
    expect(setup().device()).toBe(false);
  });
});

describe('screen sharing', () => {
  const picked: CaptureChoice = { video: SOURCE, audio: 'loopback' };
  const pickWith = (choice: CaptureChoice | undefined = picked) =>
    vi.fn<(contents: object) => Promise<CaptureChoice | undefined>>(() => Promise.resolve(choice));
  // A media request that names no device is screen capture, from getDisplayMedia or legacy getUserMedia.
  const askToCapture = (t: ReturnType<typeof setup>, details: object = {}) =>
    t.ask(t.whatsapp, 'media', { mediaTypes: [], ...details });

  it('asks for the macOS system picker only when the platform offers it', () => {
    const t = setup({ useSystemPicker: true });
    expect(t.session.setDisplayMediaRequestHandler).toHaveBeenCalledWith(expect.any(Function), {
      useSystemPicker: true,
    });
  });

  it('lets the user pick before granting, then shares exactly that pick once', async () => {
    const pick = pickWith();
    const t = setup({ pick });
    expect(await askToCapture(t)).toBe(true);
    expect(pick).toHaveBeenCalledExactlyOnceWith(t.whatsapp);
    expect(t.deps.capture.isVisibleAndFocused).toHaveBeenCalledWith(t.whatsapp);
    expect(t.deps.askMedia).not.toHaveBeenCalled();
    expect(await t.share({ frame: t.frame })).toEqual(picked);
    expect(t.deps.capture.contentsOfFrame).toHaveBeenCalledWith(t.frame);
    expect(await t.share({ frame: t.frame })).toBeNull();
  });

  it('treats a media request without device types as screen capture too', async () => {
    const pick = pickWith();
    const t = setup({ pick });
    expect(await t.ask(t.whatsapp, 'media')).toBe(true);
    expect(pick).toHaveBeenCalledOnce();
  });

  it('lets the user pick for display-capture, as Electron 45 names screen capture', async () => {
    const pick = pickWith();
    const t = setup({ pick });
    expect(await t.ask(t.whatsapp, 'display-capture')).toBe(true);
    expect(pick).toHaveBeenCalledExactlyOnceWith(t.whatsapp);
    expect(t.deps.askMedia).not.toHaveBeenCalled();
    expect(await t.ask(t.chrome, 'display-capture')).toBe(false);
    expect(pick).toHaveBeenCalledOnce();
  });

  it('denies and forgets an earlier pick when the user cancels or the picker fails', async () => {
    const pick = vi
      .fn<(contents: object) => Promise<CaptureChoice | undefined>>()
      .mockResolvedValueOnce(picked)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('portal unavailable'));
    const t = setup({ pick });
    expect(await askToCapture(t)).toBe(true);
    expect(await askToCapture(t)).toBe(false);
    expect(await t.share({ frame: t.frame })).toBeNull();
    expect(await askToCapture(t)).toBe(false);
  });

  it('leaves macOS to its system picker and grants nothing where no picker exists', async () => {
    expect(await askToCapture(setup({ useSystemPicker: true }))).toBe(true);
    expect(await askToCapture(setup())).toBe(false);
  });

  it.each<[string, Partial<DisplayCapturePort>, (t: ReturnType<typeof setup>) => Promise<boolean>]>(
    [
      [
        'the window is hidden or unfocused',
        { isVisibleAndFocused: () => false },
        (t) => askToCapture(t),
      ],
      [
        'it comes from another origin',
        {},
        (t) => askToCapture(t, { requestingUrl: 'https://ads.example/' }),
      ],
      [
        'it comes from app chrome',
        {},
        (t) => t.ask(t.chrome, 'media', { mediaTypes: [], requestingUrl: 'app://chrome/' }),
      ],
      ['its web contents are gone', {}, (t) => t.ask(null, 'media', { mediaTypes: [] })],
    ],
  )('denies without picking when %s', async (_, capture, request) => {
    const pick = pickWith();
    const t = setup({ pick, useSystemPicker: true, ...capture });
    expect(await request(t)).toBe(false);
    expect(pick).not.toHaveBeenCalled();
  });

  it.each<[string, Partial<DisplayCapturePort>, { frame: object | null; securityOrigin?: string }]>(
    [
      ['the frame is gone', {}, { frame: null }],
      ['the frame has no web contents', { contentsOfFrame: () => undefined }, { frame: {} }],
      ['the frame is not WhatsApp', { contentsOfFrame: () => ({}) }, { frame: {} }],
      ['the frame is on another origin', {}, { frame: {}, securityOrigin: 'https://ads.example' }],
    ],
  )('shares nothing when %s', async (_, capture, request) => {
    const t = setup({ pick: pickWith(), ...capture });
    await askToCapture(t);
    expect(await t.share(request)).toBeNull();
  });

  it('drops the pick after a refused share, so a later one cannot reuse it', async () => {
    const t = setup({ pick: pickWith() });
    await askToCapture(t);
    expect(await t.share({ frame: t.frame, securityOrigin: 'https://ads.example' })).toBeNull();
    expect(await t.share({ frame: t.frame })).toBeNull();
  });

  it('logs a request that ended before its source could be shared', async () => {
    const t = setup({ pick: pickWith() });
    await askToCapture(t);
    const display = t.session.setDisplayMediaRequestHandler.mock.calls[0]?.[0];
    display?.({ frame: t.frame, securityOrigin: HOME }, () => {
      throw new Error('Render frame was disposed');
    });
    await settle();
    expect(t.deps.warn).toHaveBeenCalledExactlyOnceWith(
      'A screen-sharing request ended before its source could be shared.',
    );
  });
});

describe('YapYap’s own pages', () => {
  it('get no microphone, now or when checked', async () => {
    const t = setup();
    expect(await t.ask(t.chrome, 'media', { mediaTypes: ['audio'] })).toBe(false);
    expect(t.check(t.chrome, 'media', 'app://chrome/', {})).toBe(false);
  });
});
