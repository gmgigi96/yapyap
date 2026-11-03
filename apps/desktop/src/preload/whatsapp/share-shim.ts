import type { ShareBridge } from '../../shared/api/share-api.ts';

/** The parts of a media track and stream the stand-in uses; the preload has no DOM types. */
interface Track {
  readonly readyState: string;
  stop(): void;
}

interface Stream {
  getVideoTracks(): Track[];
  getTracks(): Track[];
}

type Capture = (this: unknown, ...args: unknown[]) => Promise<Stream>;

interface CaptureMethods {
  getDisplayMedia?: Capture;
  getUserMedia?: Capture;
}

/** Chromium's legacy desktop capture: getUserMedia with a desktop source. */
interface LegacyConstraints {
  readonly video?: { readonly mandatory?: { readonly chromeMediaSource?: unknown } };
}

/**
 * Tells YapYap when WhatsApp shares a screen or window, and lets YapYap
 * stop it, so the share can always be seen and ended outside the page
 * (#161). Like the notification stand-in (ADR 0011), it runs in WhatsApp's
 * main world as source text, so it must not use anything from outside its
 * body. It reports IDs only; the stream never leaves the page.
 */
export function installShareShim(bridgeName: string): void {
  const bridge = Reflect.get(globalThis, bridgeName) as ShareBridge;
  // Without media devices there is nothing to share, so nothing to watch.
  const proto: CaptureMethods =
    (Reflect.get(globalThis, 'MediaDevices') as { prototype: CaptureMethods } | undefined)
      ?.prototype ?? {};
  const shares = new Map<string, Stream>();
  const checkMs = 500;
  // Every screen capture has a video track; the share ends with the last one.
  const watch = (stream: Stream): Stream => {
    const id = globalThis.crypto.randomUUID();
    shares.set(id, stream);
    bridge.started(id);
    // A stopped track fires nothing, so a share is checked until it ends.
    const timer = setInterval(() => {
      if (stream.getVideoTracks().every((track) => track.readyState === 'ended')) {
        clearInterval(timer);
        shares.delete(id);
        bridge.ended(id);
      }
    }, checkMs);
    return stream;
  };
  const wrap = (name: keyof CaptureMethods, watched: (args: unknown[]) => boolean): void => {
    const original = proto[name];
    if (original !== undefined) {
      proto[name] = function capture(...args) {
        const captured = original.apply(this, args);
        return watched(args) ? captured.then(watch) : captured;
      };
    }
  };
  wrap('getDisplayMedia', () => true);
  wrap('getUserMedia', ([constraints]) => {
    const source = (constraints as LegacyConstraints | undefined)?.video?.mandatory;
    return source?.chromeMediaSource === 'desktop' || source?.chromeMediaSource === 'screen';
  });
  bridge.onStop((id) => {
    for (const track of shares.get(id)?.getTracks() ?? []) {
      track.stop();
    }
  });
}
