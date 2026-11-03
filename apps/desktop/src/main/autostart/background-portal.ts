import { randomBytes } from 'node:crypto';
import { createConnection } from 'node:net';
import { variant, type DBusValue, type Variant } from './dbus-codec.ts';
import type { Environment } from '../support/environment.ts';
import { BUS, connectBus, type Bus } from './dbus-client.ts';

const PORTAL = {
  destination: 'org.freedesktop.portal.Desktop',
  path: '/org/freedesktop/portal/desktop',
} as const;

const REQUEST = 'org.freedesktop.portal.Request';

/** What to ask the Background portal for: to start at login or not, and why. */
export interface BackgroundRequest {
  readonly autostart: boolean;
  /** Shown to the user in the portal's dialog. */
  readonly reason: string;
  /** What the login starts; the portal adds the Flatpak's own launch around it. */
  readonly commandline: readonly string[];
}

/** The path the portal answers a request on, from the caller's unique name and its token. */
export const requestPath = (sender: string, token: string): string =>
  `/org/freedesktop/portal/desktop/request/${sender.slice(1).replaceAll('.', '_')}/${token}`;

/** A fresh token, so a request's answer cannot be mistaken for another's. */
export const requestToken = (): string => `yapyap${randomBytes(8).toString('hex')}`;

/** The portal's answer: 0 granted, 1 cancelled by the user, 2 anything else. */
function answerOn(bus: Bus, path: string): Promise<readonly DBusValue[]> {
  return new Promise((resolve) => {
    bus.onSignal((signal) => {
      if (signal.path === path && signal.interface === REQUEST && signal.member === 'Response') {
        resolve(signal.body);
      }
    });
  });
}

/**
 * Asks the Background portal to start YapYap at login, or no longer (#234).
 * The portal asks the user and writes the autostart entry itself. Resolves
 * with whether YapYap now starts at login; rejects when the user or the
 * system refused.
 */
export async function requestBackground(
  bus: Bus,
  request: BackgroundRequest,
  token = requestToken(),
): Promise<boolean> {
  const path = requestPath(bus.name, token);
  // Listening first, so an answer that comes at once is not missed.
  const answered = answerOn(bus, path);
  const rule = `type='signal',interface='${REQUEST}',member='Response',path='${path}'`;
  await bus.call({ ...BUS, member: 'AddMatch', signature: 's', body: [rule] });
  const options = new Map<string, Variant>([
    ['handle_token', variant('s', token)],
    ['reason', variant('s', request.reason)],
    ['autostart', variant('b', request.autostart)],
    ['commandline', variant('as', [...request.commandline])],
    ['dbus-activatable', variant('b', false)],
  ]);
  await bus.call({
    ...PORTAL,
    interface: 'org.freedesktop.portal.Background',
    member: 'RequestBackground',
    signature: 'sa{sv}',
    body: ['', options],
  });
  const [code, results] = await answered;
  if (code !== 0) {
    throw new Error('The request to start at login was refused.');
  }
  const granted = (results as ReadonlyMap<string, Variant> | undefined)?.get('autostart');
  return granted?.value === true;
}

/** The socket of the session bus `address` names: its first `unix:path=` or `unix:abstract=` entry. */
export function sessionBusPath(address: string): string {
  for (const entry of address.split(';')) {
    const [transport, rest = ''] = entry.split(':', 2);
    const options = new Map(
      rest.split(',').map((option) => option.split('=', 2) as [string, string]),
    );
    const path = options.get('path');
    const abstract = options.get('abstract');
    if (transport === 'unix' && path !== undefined) {
      return path;
    }
    if (transport === 'unix' && abstract !== undefined) {
      return `\0${abstract}`;
    }
  }
  throw new Error('No session bus to reach the Background portal.');
}

/** A connection to the session bus at `address`, as the user `uid`. */
async function openSessionBus(address: string, uid: number): Promise<Bus> {
  const socket = createConnection({ path: sessionBusPath(address) });
  return connectBus(socket, uid);
}

/** What reaching the session bus needs from the process. */
export interface BusProcess {
  readonly env: Environment;
  readonly getuid?: () => number;
}

/**
 * Asks the Background portal for autostart, on a connection of its own that
 * lasts as long as the request (#234). Resolves with whether YapYap now
 * starts at login.
 */
export function backgroundAsker(
  process: BusProcess,
  reason: string,
): (autostart: boolean) => Promise<boolean> {
  return async (autostart) => {
    const bus = await openSessionBus(
      process.env['DBUS_SESSION_BUS_ADDRESS'] ?? '',
      process.getuid?.() ?? 0,
    );
    try {
      // The Flatpak's command, which the portal runs in the sandbox at login.
      return await requestBackground(bus, { autostart, reason, commandline: ['yapyap'] });
    } finally {
      bus.close();
    }
  };
}
