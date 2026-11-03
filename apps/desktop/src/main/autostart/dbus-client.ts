import type { DBusValue } from './dbus-codec.ts';
import { decode, encode, messageLength, MessageType, type Message } from './dbus-message.ts';

/** The socket to the session bus, as a stream of bytes. */
export interface BusSocket {
  write(data: Uint8Array | string): void;
  on(event: 'data', listener: (data: Uint8Array) => void): void;
  on(event: 'close', listener: () => void): void;
  end(): void;
}

/** A method to call: who, where, and what with. */
interface Call {
  readonly destination: string;
  readonly path: string;
  readonly interface: string;
  readonly member: string;
  readonly signature?: string;
  readonly body?: readonly DBusValue[];
}

/** A connection to the session bus, as the Background portal needs one. */
export interface Bus {
  /** This connection's unique name on the bus, such as `:1.42`. */
  readonly name: string;
  /** The reply's body; rejects with the error's name when the call fails. */
  readonly call: (call: Call) => Promise<readonly DBusValue[]>;
  /** Runs `listener` for every signal this connection receives. */
  readonly onSignal: (listener: (signal: Message) => void) => void;
  readonly close: () => void;
}

/** The bus itself, which answers `Hello` and `AddMatch`. */
export const BUS = {
  destination: 'org.freedesktop.DBus',
  path: '/org/freedesktop/DBus',
  interface: 'org.freedesktop.DBus',
} as const;

/** The EXTERNAL mechanism's reply, which carries the server's GUID. */
const AUTHENTICATED = /^OK [0-9a-f]+\r\n$/;

/** Authenticates with the process's user ID, as the bus checks it on the socket. */
function authenticate(socket: BusSocket, uid: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let answer = '';
    let settled = false;
    const hex = Buffer.from(String(uid)).toString('hex');
    socket.on('data', (data) => {
      // After the handshake, the same stream carries messages, which are not ours to read.
      if (settled) {
        return;
      }
      answer += new TextDecoder().decode(data);
      if (!answer.endsWith('\r\n')) {
        return;
      }
      settled = true;
      if (AUTHENTICATED.test(answer)) {
        socket.write('BEGIN\r\n');
        resolve();
      } else {
        reject(new Error('The session bus refused to authenticate YapYap.'));
      }
    });
    socket.write(`\0AUTH EXTERNAL ${hex}\r\n`);
  });
}

/** Cuts the stream into messages, and hands each whole one on. */
function messages(socket: BusSocket, handle: (message: Message) => void): void {
  let pending = new Uint8Array();
  socket.on('data', (data) => {
    pending = Uint8Array.from([...pending, ...data]);
    for (
      let length = messageLength(pending);
      length !== undefined;
      length = messageLength(pending)
    ) {
      handle(decode(pending.subarray(0, length)));
      pending = pending.slice(length);
    }
  });
}

/** Calls waiting for their reply, by serial. */
type Waiting = Map<
  number,
  { resolve: (body: readonly DBusValue[]) => void; reject: (error: Error) => void }
>;

/** Hands a signal to every listener, and a reply or error to the call it answers. */
function route(
  message: Message,
  waiting: Waiting,
  listeners: readonly ((signal: Message) => void)[],
): void {
  if (message.type === MessageType.signal) {
    for (const listener of listeners) {
      listener(message);
    }
    return;
  }
  const serial = message.replySerial ?? 0;
  const waiter = waiting.get(serial);
  waiting.delete(serial);
  if (message.type === MessageType.error) {
    waiter?.reject(new Error(message.errorName ?? 'org.freedesktop.DBus.Error.Failed'));
  } else {
    waiter?.resolve(message.body);
  }
}

/** Opens a session bus connection on `socket`, authenticated as `uid` (#234). */
export async function connectBus(socket: BusSocket, uid: number): Promise<Bus> {
  await authenticate(socket, uid);
  let serial = 0;
  const waiting: Waiting = new Map();
  const listeners: ((signal: Message) => void)[] = [];
  messages(socket, (message) => {
    route(message, waiting, listeners);
  });
  socket.on('close', () => {
    for (const waiter of waiting.values()) {
      waiter.reject(new Error('The session bus closed the connection.'));
    }
    waiting.clear();
  });
  const call = (target: Call): Promise<readonly DBusValue[]> =>
    new Promise((resolve, reject) => {
      serial += 1;
      waiting.set(serial, { resolve, reject });
      socket.write(encode({ ...target, type: MessageType.call, serial, body: target.body ?? [] }));
    });
  const [name] = await call({ ...BUS, member: 'Hello' });
  return {
    call,
    name: name as string,
    onSignal: (listener) => {
      listeners.push(listener);
    },
    close: () => {
      socket.end();
    },
  };
}
