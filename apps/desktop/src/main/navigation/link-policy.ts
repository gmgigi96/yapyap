export type LinkAction =
  | { readonly kind: 'stay' }
  | { readonly kind: 'external'; readonly url: string }
  | { readonly kind: 'deep-link'; readonly url: string }
  | { readonly kind: 'drop' };

const STAY: LinkAction = { kind: 'stay' };
const DROP: LinkAction = { kind: 'drop' };
const PHONE = /^\+?\d{1,20}$/;
const PHONE_SEPARATORS = /[\s().-]/g;
const EMAIL = /^[\w.+-]+@[\w-]+(?:\.[\w-]+)+$/;

/**
 * YapYap registers `app:` with Chromium as standard: Chromium gives it a
 * real origin, while the WHATWG parser in Node treats it as opaque.
 */
function originOf(url: URL): string {
  return url.protocol === 'app:' ? `app://${url.host}` : url.origin;
}

/** True when `url` belongs to `home`. Opaque origins never match, even each other. */
export function isSameOrigin(url: string, home: string | undefined): boolean {
  if (!URL.canParse(url)) {
    return false;
  }
  const origin = originOf(new URL(url));
  return origin !== 'null' && origin === home;
}

function isSendLink(url: URL, phone: string | null, text: string | null): boolean {
  const validPhone = phone === null || PHONE.test(phone);
  return url.host === 'send' && validPhone && (phone !== null || text !== null);
}

/**
 * `whatsapp://send?phone=…&text=…` becomes the equivalent WhatsApp Web URL.
 * Anything else, including other `whatsapp:` actions, is dropped.
 */
function deepLink(url: URL, home: string | undefined): LinkAction {
  const phone = url.searchParams.get('phone');
  const text = url.searchParams.get('text');
  if (!isSendLink(url, phone, text) || home?.startsWith('http') !== true) {
    return DROP;
  }
  const target = new URL('/send', home);
  if (phone !== null) {
    target.searchParams.set('phone', phone);
  }
  if (text !== null) {
    target.searchParams.set('text', text);
  }
  return { kind: 'deep-link', url: target.href };
}

/** Phone numbers keep only digits and a leading '+', so nothing else reaches the dialer. */
function telLink(url: URL): LinkAction {
  const number = url.pathname.replace(PHONE_SEPARATORS, '');
  return PHONE.test(number) ? { kind: 'external', url: `tel:${number}` } : DROP;
}

function mailtoLink(url: URL): LinkAction {
  const recipients = url.pathname === '' ? [] : url.pathname.split(',');
  const valid = recipients.every((recipient) => EMAIL.test(recipient));
  return valid && (recipients.length > 0 || url.search !== '')
    ? { kind: 'external', url: url.href }
    : DROP;
}

const SCHEME_HANDLERS: Readonly<
  Record<string, (url: URL, home: string | undefined) => LinkAction>
> = {
  'http:': (url) => ({ kind: 'external', url: url.href }),
  'https:': (url) => ({ kind: 'external', url: url.href }),
  'mailto:': mailtoLink,
  'tel:': telLink,
  'whatsapp:': deepLink,
};

/**
 * Decides where a link from a view whose home origin is `home` (undefined for
 * popups and other web contents YapYap did not create) may go. Links
 * leave the app re-serialized by the URL parser, so control characters and
 * whitespace the parser strips never reach the operating system.
 */
export function classifyLink(raw: string, home: string | undefined): LinkAction {
  if (!URL.canParse(raw)) {
    return DROP;
  }
  if (isSameOrigin(raw, home)) {
    return STAY;
  }
  const url = new URL(raw);
  const handler = SCHEME_HANDLERS[url.protocol];
  return handler === undefined ? DROP : handler(url, home);
}
