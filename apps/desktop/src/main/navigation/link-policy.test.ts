import { describe, expect, it } from 'vitest';
import { classifyLink, isSameOrigin } from './link-policy.ts';

const HOME = 'https://web.whatsapp.com';

describe('isSameOrigin', () => {
  it('compares parsed origins and never matches opaque or missing homes', () => {
    expect(isSameOrigin('https://web.whatsapp.com/path?q=1', HOME)).toBe(true);
    expect(isSameOrigin('https://web.whatsapp.com:8443/', HOME)).toBe(false);
    expect(isSameOrigin('http://web.whatsapp.com/', HOME)).toBe(false);
    expect(isSameOrigin('https://web.whatsapp.com.evil.example/', HOME)).toBe(false);
    expect(isSameOrigin('data:text/html,x', 'null')).toBe(false);
    expect(isSameOrigin('https://web.whatsapp.com/', undefined)).toBe(false);
    expect(isSameOrigin('not a url', HOME)).toBe(false);
  });

  it('gives app: URLs the scheme-and-host origin Chromium gives registered schemes', () => {
    expect(isSameOrigin('app://chrome/about.html', 'app://chrome')).toBe(true);
    expect(isSameOrigin('app://chrome:1/about.html', 'app://chrome')).toBe(false);
    expect(isSameOrigin('app://evil/about.html', 'app://chrome')).toBe(false);
    expect(isSameOrigin('app://engine/', 'app://chrome')).toBe(false);
    expect(isSameOrigin('other://chrome/x', 'other://chrome')).toBe(false);
  });
});

describe('classifyLink', () => {
  it('keeps same-origin links in the view', () => {
    expect(classifyLink('https://web.whatsapp.com/send?phone=1', HOME)).toEqual({ kind: 'stay' });
  });

  it.each([
    ['https://example.com/a?b=1#c', 'https://example.com/a?b=1#c'],
    ['http://example.com', 'http://example.com/'],
    ['  https://example.com/x\n', 'https://example.com/x'],
    ['https://exa\tmple.com/', 'https://example.com/'],
    [
      'mailto:someone@example.com?subject=hi there',
      'mailto:someone@example.com?subject=hi%20there',
    ],
    ['tel:+351 912 345 678', 'tel:+351912345678'],
    ['tel:(555) 123-4567', 'tel:5551234567'],
    ['mailto:a@example.com,b@example.org', 'mailto:a@example.com,b@example.org'],
    ['mailto:a@mail.example.co.uk', 'mailto:a@mail.example.co.uk'],
    ['mailto:?subject=Hi', 'mailto:?subject=Hi'],
    ['Mailto:a@example.com\u0000', 'mailto:a@example.com'],
  ])('opens %j in the default browser as %j', (raw, url) => {
    expect(classifyLink(raw, HOME)).toEqual({ kind: 'external', url });
  });

  it.each([
    [
      'whatsapp://send?phone=351912345678&text=Hello there',
      '/send?phone=351912345678&text=Hello+there',
    ],
    ['whatsapp://send?phone=%2B351912345678', '/send?phone=%2B351912345678'],
    ['whatsapp://send?text=Hi', '/send?text=Hi'],
  ])('turns %j into WhatsApp Web %j', (raw, path) => {
    expect(classifyLink(raw, HOME)).toEqual({ kind: 'deep-link', url: `${HOME}${path}` });
  });

  it.each([
    'javascript:alert(1)',
    'file:///etc/passwd',
    'ftp://example.com/',
    'data:text/html,<script>1</script>',
    'smb://share/x',
    'tel:+1;phone-context=evil',
    'tel:',
    'tel:123456789012345678901',
    'mailto:',
    'mailto:not-an-address',
    'mailto:a b@example.com',
    'mailto:a@example.com,',
    'mailto:a@example.com>x',
    'mailto:a@localhost',
    'mailto:a\u0000b@example.com',
    'mailto:a%40b@example.com',
    'ms-settings:privacy',
    'whatsapp://send',
    'whatsapp://send?phone=12ab',
    'whatsapp://send?phone=123456789012345678901',
    'whatsapp://call?phone=1',
    'not a url',
    '',
  ])('drops %j', (raw) => {
    expect(classifyLink(raw, HOME)).toEqual({ kind: 'drop' });
  });

  it('never turns deep links into navigation for a home that is not WhatsApp Web', () => {
    expect(classifyLink('whatsapp://send?text=Hi', 'app://chrome')).toEqual({ kind: 'drop' });
    expect(classifyLink('whatsapp://send?text=Hi', undefined)).toEqual({ kind: 'drop' });
  });
});
