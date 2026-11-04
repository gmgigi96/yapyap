/** The global the WhatsApp preload exposes to the page for its screen shares (#161). */
export const SHARE_BRIDGE = 'yapyapScreenShare';

/** Fixed channels, one per operation, between the WhatsApp preload and the main process. */
export const SHARE_CHANNELS = {
  started: 'whatsapp:share-started',
  ended: 'whatsapp:share-ended',
  stop: 'whatsapp:share-stop',
} as const;

/** What the page's stand-in for screen capture calls: IDs only, never the stream. */
export interface ShareBridge {
  readonly started: (id: string) => void;
  readonly ended: (id: string) => void;
  readonly onStop: (listener: (id: string) => void) => void;
}
