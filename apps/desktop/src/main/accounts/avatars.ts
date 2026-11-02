import { runInAdapterWorld, type AdapterPage } from '../../adapter/world.ts';
import { OWN_AVATAR } from '../../adapter/own-avatar.ts';
import { isSameOrigin } from '../navigation/link-policy.ts';

/** An account's WhatsApp page, as reading its profile photo needs it. */
export interface AvatarPage extends AdapterPage {
  /** The account's own session, so the photo comes with its login, not the default one. */
  readonly session: { fetch(url: string): Promise<Response> };
  isDestroyed(): boolean;
}

export interface AvatarDependencies<Timer = unknown> {
  /** WhatsApp's origin, from which a photo may also come (the fake page in tests). */
  readonly home: string;
  /** The image as a small square data URL, or undefined when it is not one. */
  readonly toDataUrl: (bytes: Uint8Array) => string | undefined;
  readonly now: () => number;
  /** A photo appeared, changed or went away, so the sidebar shows it. */
  readonly onChange: () => void;
  readonly schedule: (callback: () => void, ms: number) => Timer;
  readonly cancel: (timer: Timer) => void;
}

/** Each account's profile photo, which the sidebar shows instead of its initial (#87). */
export interface AccountAvatars {
  /** Reads the account's photo again, if it is due; never throws. */
  readonly refresh: (id: string, page: AvatarPage) => Promise<void>;
  readonly avatarOf: (id: string) => string | undefined;
  readonly forget: (id: string) => void;
  /**
   * A picture the page names, such as a chat's in a notification, fetched
   * under the same rules as the account's own photo; never throws.
   */
  readonly picture: (page: Pick<AvatarPage, 'session'>, url: string) => Promise<string | undefined>;
}

/** Until a photo is found, WhatsApp may still be loading; after, it rarely changes. */
const RETRY_MS = 60_000;
const REFRESH_MS = 1_800_000;
/**
 * Reads in a row without a photo before YapYap waits for the page title to
 * change again. The first read often comes while WhatsApp is still loading,
 * and the title may then stay the same for hours.
 */
const RETRIES = 10;
/** WhatsApp's profile photos are a few tens of kilobytes; nothing bigger is read. */
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Whether the page's photo may be fetched: over HTTPS from WhatsApp's media
 * hosts, or from the page's own origin. Anything else the page names stays
 * unfetched, so a changed page cannot make YapYap request other addresses.
 */
export function isAvatarUrl(url: string, home: string): boolean {
  if (!URL.canParse(url)) {
    return false;
  }
  const { protocol, hostname } = new URL(url);
  const media = protocol === 'https:' && hostname.endsWith('.whatsapp.net');
  return media || isSameOrigin(url, home);
}

type ImageDependencies = Pick<AvatarDependencies, 'home' | 'toDataUrl'>;

async function fetchImage(
  page: Pick<AvatarPage, 'session'>,
  src: unknown,
  deps: ImageDependencies,
): Promise<string | undefined> {
  if (typeof src !== 'string' || !isAvatarUrl(src, deps.home)) {
    return undefined;
  }
  const response = await page.session.fetch(src);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return response.ok && bytes.byteLength <= MAX_BYTES ? deps.toDataUrl(bytes) : undefined;
}

async function readAvatar(page: AvatarPage, deps: ImageDependencies): Promise<string | undefined> {
  return fetchImage(page, await runInAdapterWorld(page, OWN_AVATAR), deps);
}

/** Reads again a minute after each miss, up to {@link RETRIES} misses in a row. */
function retries<Timer>(deps: Pick<AvatarDependencies<Timer>, 'schedule' | 'cancel'>) {
  const misses = new Map<string, number>();
  const timers = new Map<string, Timer>();
  const stop = (id: string): void => {
    const timer = timers.get(id);
    if (timer !== undefined) {
      deps.cancel(timer);
      timers.delete(id);
    }
  };
  return {
    stop: (id: string): void => {
      stop(id);
      misses.delete(id);
    },
    /** After a read: found resets the count, a miss schedules `again` unless it is time to wait. */
    after: (id: string, found: boolean, page: AvatarPage, again: () => void): void => {
      const missed = found ? 0 : (misses.get(id) ?? 0) + 1;
      misses.set(id, missed);
      stop(id);
      if (missed > 0 && missed < RETRIES && !page.isDestroyed()) {
        timers.set(id, deps.schedule(again, RETRY_MS));
      }
    },
  };
}

export function accountAvatars<Timer>(deps: AvatarDependencies<Timer>): AccountAvatars {
  const avatars = new Map<string, string>();
  const due = new Map<string, number>();
  const retry = retries(deps);
  const store = (id: string, avatar: string | undefined): void => {
    if (avatar === avatars.get(id)) {
      return;
    }
    if (avatar === undefined) {
      avatars.delete(id);
    } else {
      avatars.set(id, avatar);
    }
    deps.onChange();
  };
  const refresh = async (id: string, page: AvatarPage): Promise<void> => {
    if (deps.now() < (due.get(id) ?? 0)) {
      return;
    }
    const avatar = await readAvatar(page, deps).catch(() => undefined);
    due.set(id, deps.now() + (avatar === undefined ? RETRY_MS : REFRESH_MS));
    store(id, avatar);
    retry.after(id, avatar !== undefined, page, () => void refresh(id, page));
  };
  return {
    refresh,
    avatarOf: (id) => avatars.get(id),
    forget: (id) => {
      retry.stop(id);
      avatars.delete(id);
      due.delete(id);
    },
    picture: (page, url) => fetchImage(page, url, deps).catch(() => undefined),
  };
}

/** An image as Electron's `nativeImage` holds it. */
interface ShrinkableImage {
  isEmpty(): boolean;
  resize(options: { width: number; height: number; quality: 'good' }): { toDataURL(): string };
}

/**
 * The photo as a 64-pixel PNG data URL: enough for the sidebar's avatar at
 * any scale, and nothing else of the downloaded image survives. Undefined
 * when the bytes were no image.
 */
export function shrinkAvatar(image: ShrinkableImage): string | undefined {
  return image.isEmpty()
    ? undefined
    : image.resize({ width: 64, height: 64, quality: 'good' }).toDataURL();
}
