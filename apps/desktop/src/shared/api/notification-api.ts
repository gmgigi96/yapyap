/** The global the WhatsApp preload exposes to the page for its notifications (ADR 0011). */
export const NOTIFICATION_BRIDGE = 'yapyapNotifications';

/** Fixed channels, one per operation, between the WhatsApp preload and the main process. */
export const NOTIFICATION_CHANNELS = {
  show: 'whatsapp:notification-show',
  close: 'whatsapp:notification-close',
  click: 'whatsapp:notification-click',
} as const;

/**
 * What the page asked for, before YapYap checks it: the page can pass
 * anything, so every field but the stand-in's own ID is unknown.
 */
interface NotificationRequest {
  readonly id: string;
  readonly title: unknown;
  readonly body: unknown;
  readonly tag: unknown;
  readonly silent: unknown;
  readonly icon: unknown;
}

/** What the stand-in for the page's `Notification` calls. */
export interface NotificationBridge {
  readonly show: (request: NotificationRequest) => void;
  readonly close: (id: string) => void;
  readonly onClick: (listener: (id: string) => void) => void;
}
