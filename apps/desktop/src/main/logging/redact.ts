/**
 * Scrubs anything personal a log line could pick up from an error message or
 * a path. YapYap never logs message content on purpose; this is the net
 * under that rule for what slips through.
 */
const RULES: readonly (readonly [RegExp, string])[] = [
  // Bearer and basic credentials, and key=value secrets in URLs or messages.
  [/\b(bearer|basic)\s+[\w.~+/=-]+/gi, '$1 [token]'],
  [/\b(token|key|secret|password|passwd|auth|session|sig|signature)=[^\s&;,]+/gi, '$1=[token]'],
  // The local part allows every character RFC 5322 does. RFC 5321's length
  // limits keep the pattern linear on long lines without an @.
  [/[^\s@<>()[\],;:"\\]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63})+/g, '[email]'],
  // Long runs of letters and digits look like keys or session identifiers.
  [/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}\b/g, '[token]'],
  // Phone numbers: seven or more digits with a leading + or bracket, and
  // spaces, brackets or dashes between them. Dots are left out, so version
  // numbers such as 152.0.7977.167 survive.
  [/[+(]?\d(?:[\s()-]{0,2}\d){6,}/g, '[phone]'],
];

/** `home` is replaced with `~` first, so user names in paths never appear. */
export function redact(line: string, home: string): string {
  const withoutHome = home.length > 1 ? line.replaceAll(home, '~') : line;
  return RULES.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    withoutHome,
  );
}
