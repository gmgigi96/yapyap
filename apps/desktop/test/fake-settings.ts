import { vi, type Mock } from 'vitest';
import { defaultSettings } from '../src/main/settings/decode.ts';
import type { Settings } from '../src/main/settings/schema.ts';
import type { SettingsService } from '../src/main/settings/service.ts';

type Section = Exclude<keyof Settings, 'schemaVersion'>;

/** Some values of some sections, such as `{ spelling: { enabled: true } }`. */
type SectionValues = { readonly [Name in Section]?: Partial<Settings[Name]> };

/** `settings` with `values` set in their sections. */
function withValues(settings: Settings, values: SectionValues): Settings {
  const sections = Object.entries(values).map(([name, given]) => [
    name,
    { ...settings[name as Section], ...given },
  ]);
  return { ...settings, ...(Object.fromEntries(sections) as Partial<Settings>) };
}

interface FakeSettings extends SettingsService {
  readonly update: Mock<SettingsService['update']>;
  /** Sets `values` through `update`, as the settings window would. */
  readonly change: (values: SectionValues) => void;
}

/**
 * The default settings with `values` set, held in memory. Like the real
 * service, `update` applies the change and then tells every listener; it is
 * a spy, so a test can also check what was saved.
 */
export function fakeSettings(values: SectionValues = {}): FakeSettings {
  let settings = withValues(defaultSettings(), values);
  const listeners: ((settings: Settings) => void)[] = [];
  const update = vi.fn<SettingsService['update']>((change) => {
    settings = change(settings);
    for (const listener of listeners) {
      listener(settings);
    }
  });
  return {
    current: () => settings,
    notice: undefined,
    firstRun: false,
    update,
    onChange: (listener) => {
      listeners.push(listener);
    },
    change: (next) => {
      update((current) => withValues(current, next));
    },
  };
}
