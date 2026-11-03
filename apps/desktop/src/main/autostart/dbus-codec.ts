/**
 * Just enough of the D-Bus wire format for the Background portal (#234):
 * little-endian messages with the types it uses. A variant is written as
 * `[signature, value]`, a dictionary as a `Map`.
 */

export type DBusValue =
  number | boolean | string | readonly DBusValue[] | ReadonlyMap<string, DBusValue> | Variant;

/** A variant: the signature of the value it holds, and the value. */
export interface Variant {
  readonly signature: string;
  readonly value: DBusValue;
}

export const variant = (signature: string, value: DBusValue): Variant => ({ signature, value });

const ALIGN: Readonly<Record<string, number>> = {
  y: 1,
  b: 4,
  u: 4,
  s: 4,
  o: 4,
  g: 1,
  v: 1,
  a: 4,
  '(': 8,
  '{': 8,
};

/** How a value of the first type in `signature` is aligned. */
function alignOf(signature: string): number {
  const align = ALIGN[signature.charAt(0)];
  if (align === undefined) {
    throw new Error(`Unsupported signature: ${signature}`);
  }
  return align;
}

/** How each bracket changes the nesting depth of a signature. */
const DEPTH: Readonly<Record<string, number>> = { '(': 1, '{': 1, ')': -1, '}': -1 };

/** The length of the struct or dictionary entry that `signature` starts with. */
function bracketed(signature: string): number {
  let depth = 0;
  for (let index = 0; index < signature.length; index += 1) {
    depth += DEPTH[signature.charAt(index)] ?? 0;
    if (depth === 0) {
      return index + 1;
    }
  }
  throw new Error(`Unbalanced signature: ${signature}`);
}

const isBracket = (head: string): boolean => head === '(' || head === '{';

const isText = (head: string): boolean => head === 's' || head === 'o' || head === 'g';

/** The length of the first complete type in `signature`. */
export function firstType(signature: string): number {
  const head = signature.charAt(0);
  if (head === 'a') {
    return 1 + firstType(signature.slice(1));
  }
  if (isBracket(head)) {
    return bracketed(signature);
  }
  alignOf(signature);
  return 1;
}

/** Splits a signature into its complete types. */
export function types(signature: string): string[] {
  const found: string[] = [];
  for (let rest = signature; rest !== '';) {
    const length = firstType(rest);
    found.push(rest.slice(0, length));
    rest = rest.slice(length);
  }
  return found;
}

/** A 32-bit number's bytes, least significant first. */
const littleEndian = (value: number): number[] => [
  value & 0xff,
  (value >>> 8) & 0xff,
  (value >>> 16) & 0xff,
  value >>> 24,
];

/** Writes values into a growing buffer, aligned as D-Bus requires. */
export class Writer {
  private readonly bytes: number[] = [];

  get length(): number {
    return this.bytes.length;
  }

  pad(to: number): void {
    while (this.bytes.length % to !== 0) {
      this.bytes.push(0);
    }
  }

  uint32(value: number): void {
    this.pad(4);
    this.bytes.push(...littleEndian(value));
  }

  raw(data: readonly number[]): void {
    this.bytes.push(...data);
  }

  write(signature: string, value: DBusValue): void {
    const head = signature.charAt(0);
    this.pad(alignOf(signature));
    if (head === 'v') {
      const held = value as Variant;
      this.text('g', held.signature);
      this.write(held.signature, held.value);
    } else if (head === 'a') {
      this.array(signature.slice(1), value);
    } else if (isBracket(head)) {
      this.struct(signature.slice(1, -1), value as readonly DBusValue[]);
    } else {
      this.basic(head, value);
    }
  }

  private basic(head: string, value: DBusValue): void {
    if (head === 'y') {
      this.bytes.push(value as number);
    } else if (isText(head)) {
      this.text(head, value as string);
    } else {
      this.uint32(head === 'b' ? Number(value === true) : (value as number));
    }
  }

  done(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }

  private text(kind: string, text: string): void {
    const encoded = [...new TextEncoder().encode(text)];
    if (kind === 'g') {
      this.bytes.push(encoded.length);
    } else {
      this.uint32(encoded.length);
    }
    this.bytes.push(...encoded, 0);
  }

  private array(element: string, value: DBusValue): void {
    const items: readonly DBusValue[] =
      value instanceof Map
        ? [...(value as ReadonlyMap<string, DBusValue>)].map(([key, item]): DBusValue => [
            key,
            item,
          ])
        : (value as readonly DBusValue[]);
    this.uint32(0);
    const lengthAt = this.bytes.length - 4;
    this.pad(alignOf(element));
    const start = this.bytes.length;
    for (const item of items) {
      this.write(element, item);
    }
    const size = this.bytes.length - start;
    this.bytes.splice(lengthAt, 4, ...littleEndian(size));
  }

  private struct(inner: string, fields: readonly DBusValue[]): void {
    for (const [index, type] of types(inner).entries()) {
      this.write(type, fields[index] ?? 0);
    }
  }
}

/** Reads values from a message, aligned as they were written. */
export class Reader {
  private readonly bytes: Uint8Array;
  private offset: number;

  constructor(bytes: Uint8Array, offset = 0) {
    this.bytes = bytes;
    this.offset = offset;
  }

  get position(): number {
    return this.offset;
  }

  pad(to: number): void {
    this.offset += (to - (this.offset % to)) % to;
  }

  uint32(): number {
    this.pad(4);
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, 4);
    this.offset += 4;
    return view.getUint32(0, true);
  }

  read(signature: string): DBusValue {
    const head = signature.charAt(0);
    this.pad(alignOf(signature));
    if (head === 'v') {
      const held = this.text(this.byte());
      return variant(held, this.read(held));
    }
    if (head === 'a') {
      return this.array(signature.slice(1));
    }
    if (isBracket(head)) {
      return types(signature.slice(1, -1)).map((type) => this.read(type));
    }
    return this.basic(head);
  }

  private basic(head: string): DBusValue {
    if (head === 'y') {
      return this.byte();
    }
    if (isText(head)) {
      return this.text(head === 'g' ? this.byte() : this.uint32());
    }
    const number = this.uint32();
    return head === 'b' ? number === 1 : number;
  }

  private byte(): number {
    const value = this.bytes[this.offset];
    if (value === undefined) {
      throw new Error('The message ended early.');
    }
    this.offset += 1;
    return value;
  }

  private text(length: number): string {
    const end = this.offset + length;
    if (end >= this.bytes.length) {
      throw new Error('The message ended early.');
    }
    const decoded = new TextDecoder().decode(this.bytes.subarray(this.offset, end));
    this.offset = end + 1;
    return decoded;
  }

  private array(element: string): DBusValue {
    const size = this.uint32();
    this.pad(alignOf(element));
    const end = this.offset + size;
    const items: DBusValue[] = [];
    while (this.offset < end) {
      items.push(this.read(element));
    }
    if (element.startsWith('{')) {
      return new Map(items.map((entry) => entry as [string, DBusValue]));
    }
    return items;
  }
}
