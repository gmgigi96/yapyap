import { describe, expect, it } from 'vitest';
import { isSet } from './environment.ts';

describe('isSet', () => {
  it('counts a variable with a value', () => {
    expect(isSet({ FLATPAK_ID: 'org.guita.YapYap' }, 'FLATPAK_ID')).toBe(true);
  });

  it('counts a missing or empty variable as unset', () => {
    expect(isSet({}, 'FLATPAK_ID')).toBe(false);
    expect(isSet({ FLATPAK_ID: '' }, 'FLATPAK_ID')).toBe(false);
    expect(isSet({ FLATPAK_ID: undefined }, 'FLATPAK_ID')).toBe(false);
  });
});
