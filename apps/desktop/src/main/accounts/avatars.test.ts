import { describe, expect, it, vi } from 'vitest';
import { accountAvatars, isAvatarUrl, shrinkAvatar, type AvatarPage } from './avatars.ts';

const HOME = 'https://web.whatsapp.com';
const PHOTO = 'https://pps.whatsapp.net/v/me.jpg?oh=token';

function setup() {
  let now = 0;
  const timers = new Map<number, () => void>();
  let next = 0;
  const deps = {
    home: HOME,
    toDataUrl: vi.fn(
      (bytes: Uint8Array): string | undefined => `data:image/png;base64,${String(bytes.length)}`,
    ),
    now: () => now,
    onChange: vi.fn(),
    schedule: vi.fn((callback: () => void) => {
      next += 1;
      timers.set(next, callback);
      return next;
    }),
    cancel: vi.fn((timer: number) => {
      timers.delete(timer);
    }),
  };
  const page = (src: unknown, body = new Uint8Array(3), ok = true) => {
    const fetch = vi.fn(() => Promise.resolve(new Response(body, { status: ok ? 200 : 404 })));
    const executeJavaScriptInIsolatedWorld = vi.fn<AvatarPage['executeJavaScriptInIsolatedWorld']>(
      () => Promise.resolve(src),
    );
    const isDestroyed = vi.fn(() => false);
    return { executeJavaScriptInIsolatedWorld, session: { fetch }, fetch, isDestroyed };
  };
  return {
    deps,
    avatars: accountAvatars(deps),
    page,
    advance: (ms: number) => {
      now += ms;
    },
    timers,
    /** Lets the minute pass and runs the retry waiting for it, if any. */
    retry: async () => {
      now += 60_000;
      const pending = [...timers];
      timers.clear();
      for (const [, callback] of pending) {
        callback();
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

describe('isAvatarUrl', () => {
  it('accepts WhatsApp’s media hosts over HTTPS and the page’s own origin', () => {
    expect(isAvatarUrl(PHOTO, HOME)).toBe(true);
    expect(isAvatarUrl('http://127.0.0.1:4000/media/avatar.png', 'http://127.0.0.1:4000')).toBe(
      true,
    );
  });

  it.each([
    'http://pps.whatsapp.net/me.jpg',
    'https://whatsapp.net.example.org/me.jpg',
    'https://example.org/me.jpg',
    'file:///etc/passwd',
    'not a url',
  ])('refuses %s', (url) => {
    expect(isAvatarUrl(url, HOME)).toBe(false);
  });
});

describe('accountAvatars', () => {
  it('fetches the photo through the account’s session and keeps it as a small image', async () => {
    const t = setup();
    const page = t.page(PHOTO);
    await t.avatars.refresh('a', page);
    expect(page.fetch).toHaveBeenCalledExactlyOnceWith(PHOTO);
    expect(t.avatars.avatarOf('a')).toBe('data:image/png;base64,3');
    expect(t.deps.onChange).toHaveBeenCalledOnce();
  });

  it('reads again only once due: soon while there is no photo, rarely once there is', async () => {
    const t = setup();
    const missing = t.page(null);
    await t.avatars.refresh('a', missing);
    await t.avatars.refresh('a', missing);
    expect(missing.executeJavaScriptInIsolatedWorld).toHaveBeenCalledOnce();
    t.advance(60_000);
    const found = t.page(PHOTO);
    await t.avatars.refresh('a', found);
    t.advance(60_000);
    await t.avatars.refresh('a', found);
    expect(found.executeJavaScriptInIsolatedWorld).toHaveBeenCalledOnce();
    t.advance(30 * 60_000);
    await t.avatars.refresh('a', found);
    expect(found.executeJavaScriptInIsolatedWorld).toHaveBeenCalledTimes(2);
    expect(t.deps.onChange).toHaveBeenCalledOnce();
  });

  it('looks again every minute while there is no photo, without a title change', async () => {
    const t = setup();
    const page = t.page(null);
    await t.avatars.refresh('a', page);
    expect(t.deps.schedule).toHaveBeenCalledExactlyOnceWith(expect.any(Function), 60_000);
    await t.retry();
    page.executeJavaScriptInIsolatedWorld.mockResolvedValue(PHOTO);
    await t.retry();
    expect(page.executeJavaScriptInIsolatedWorld).toHaveBeenCalledTimes(3);
    expect(t.avatars.avatarOf('a')).toBe('data:image/png;base64,3');
    expect(t.timers.size).toBe(0);
  });

  it('stops looking after ten reads in a row without a photo', async () => {
    const t = setup();
    const page = t.page(null);
    await t.avatars.refresh('a', page);
    for (let read = 0; read < 12; read += 1) {
      await t.retry();
    }
    expect(page.executeJavaScriptInIsolatedWorld).toHaveBeenCalledTimes(10);
  });

  it('does not look again at a page that is gone, or for a forgotten account', async () => {
    const t = setup();
    const gone = t.page(null);
    gone.isDestroyed.mockReturnValue(true);
    await t.avatars.refresh('a', gone);
    expect(t.deps.schedule).not.toHaveBeenCalled();
    await t.avatars.refresh('b', t.page(null));
    t.avatars.forget('b');
    expect(t.deps.cancel).toHaveBeenCalledOnce();
    expect(t.timers.size).toBe(0);
  });

  it('drops a photo that went away, and says so', async () => {
    const t = setup();
    await t.avatars.refresh('a', t.page(PHOTO));
    t.advance(30 * 60_000);
    await t.avatars.refresh('a', t.page(null));
    expect(t.avatars.avatarOf('a')).toBeUndefined();
    expect(t.deps.onChange).toHaveBeenCalledTimes(2);
  });

  it('fetches nothing from elsewhere, and keeps nothing failed, too big or not an image', async () => {
    const t = setup();
    const elsewhere = t.page('https://example.org/me.jpg');
    await t.avatars.refresh('a', elsewhere);
    expect(elsewhere.fetch).not.toHaveBeenCalled();
    for (const page of [
      t.page(PHOTO, new Uint8Array(3), false),
      t.page(PHOTO, new Uint8Array(2 * 1024 * 1024 + 1)),
    ]) {
      t.advance(60_000);
      await t.avatars.refresh('a', page);
    }
    t.deps.toDataUrl.mockReturnValueOnce(undefined);
    t.advance(60_000);
    await t.avatars.refresh('a', t.page(PHOTO));
    const broken = t.page(PHOTO);
    broken.executeJavaScriptInIsolatedWorld.mockRejectedValueOnce(new Error('gone'));
    t.advance(60_000);
    await t.avatars.refresh('a', broken);
    expect(t.avatars.avatarOf('a')).toBeUndefined();
    expect(t.deps.onChange).not.toHaveBeenCalled();
  });

  it('forgets a removed account', async () => {
    const t = setup();
    await t.avatars.refresh('a', t.page(PHOTO));
    t.avatars.forget('a');
    expect(t.avatars.avatarOf('a')).toBeUndefined();
    const again = t.page(PHOTO);
    await t.avatars.refresh('a', again);
    expect(again.fetch).toHaveBeenCalledOnce();
  });
});

describe('shrinkAvatar', () => {
  it('keeps a 64-pixel copy of an image, and nothing of what is not one', () => {
    const resize = vi.fn(() => ({ toDataURL: () => 'data:image/png;base64,small' }));
    expect(shrinkAvatar({ isEmpty: () => false, resize })).toBe('data:image/png;base64,small');
    expect(resize).toHaveBeenCalledWith({ width: 64, height: 64, quality: 'good' });
    expect(shrinkAvatar({ isEmpty: () => true, resize })).toBeUndefined();
  });
});

describe('accountAvatars picture', () => {
  it('fetches a picture the page names on the account’s session, under the photo’s rules', async () => {
    const t = setup();
    const page = t.page(undefined);
    await expect(t.avatars.picture(page, PHOTO)).resolves.toBe('data:image/png;base64,3');
    expect(page.fetch).toHaveBeenCalledWith(PHOTO);
    expect(page.executeJavaScriptInIsolatedWorld).not.toHaveBeenCalled();
  });

  it('fetches nothing from other hosts, and never throws', async () => {
    const t = setup();
    const page = t.page(undefined);
    await expect(t.avatars.picture(page, 'https://example.com/a.png')).resolves.toBeUndefined();
    expect(page.fetch).not.toHaveBeenCalled();
    page.fetch.mockRejectedValueOnce(new Error('offline'));
    await expect(t.avatars.picture(page, PHOTO)).resolves.toBeUndefined();
  });

  it('keeps no picture over 2 MB', async () => {
    const t = setup();
    const page = t.page(undefined, new Uint8Array(2 * 1024 * 1024 + 1));
    await expect(t.avatars.picture(page, PHOTO)).resolves.toBeUndefined();
  });
});
