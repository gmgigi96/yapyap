import { describe, expect, it, vi } from 'vitest';
import { fakeSettings } from '../../../test/fake-settings.ts';
import { followHiddenReadsSetting } from './hidden-reads.ts';

describe('followHiddenReadsSetting', () => {
  it('keeps background throttling on by default and follows changes', () => {
    const contents = { setBackgroundThrottling: vi.fn() };
    const settings = fakeSettings();
    followHiddenReadsSetting(contents, settings);
    expect(contents.setBackgroundThrottling).toHaveBeenLastCalledWith(true);
    settings.change({ privacy: { unreadWhileHidden: false } });
    expect(contents.setBackgroundThrottling).toHaveBeenLastCalledWith(false);
  });
});
