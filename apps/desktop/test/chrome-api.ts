import { vi } from 'vitest';
import type { ChromeApi } from '../src/shared/chrome-api.ts';

/** Fakes for some operations of some groups; every other operation is a bare `vi.fn()`. */
type ChromeApiOverrides = { readonly [Group in keyof ChromeApi]?: Partial<ChromeApi[Group]> };

/** `satisfies` makes a new `ChromeApi` operation fail to compile here, the one place to add it. */
function blank() {
  return {
    about: { info: vi.fn(), copyTechnicalDetails: vi.fn() },
    recovery: { problem: vi.fn(), retry: vi.fn(), clearCache: vi.fn(), copyDiagnostics: vi.fn() },
    settings: {
      get: vi.fn(),
      set: vi.fn(),
      restart: vi.fn(),
      export: vi.fn(),
      import: vi.fn(),
      chooseFolder: vi.fn(),
    },
    assistant: {
      view: vi.fn(),
      saveKey: vi.fn(),
      forgetKey: vi.fn(),
      testKey: vi.fn(),
      findServers: vi.fn(),
      privateModel: vi.fn(),
      forgetChat: vi.fn(),
    },
    agents: {
      view: vi.fn(),
      create: vi.fn(),
      revoke: vi.fn(),
      narrow: vi.fn(),
      newPort: vi.fn(),
      openChat: vi.fn(),
      copy: vi.fn(),
    },
    chat: { openNumber: vi.fn() },
    accounts: {
      list: vi.fn(),
      save: vi.fn(),
      remove: vi.fn(),
      permissions: vi.fn(),
      forgetPermissions: vi.fn(),
    },
    sidebar: {
      state: vi.fn(),
      switchTo: vi.fn(),
      setCompact: vi.fn(),
      stopSharing: vi.fn(),
      onState: vi.fn(),
    },
    report: { diagnostics: vi.fn(), open: vi.fn() },
    picker: { offer: vi.fn(), choose: vi.fn(), cancel: vi.fn() },
    shortcuts: { list: vi.fn(), set: vi.fn() },
    downloads: { list: vi.fn(), act: vi.fn(), clear: vi.fn() },
    spelling: { languages: vi.fn(), choose: vi.fn() },
    customCode: { get: vi.fn(), save: vi.fn(), preview: vi.fn() },
    proxyLogin: { request: vi.fn(), answer: vi.fn() },
  } satisfies ChromeApi;
}

/**
 * A whole `window.yapyap` for renderer tests. The result keeps the overrides'
 * own types, so a test can read `api.accounts.save.mock.calls`.
 */
export function fakeChromeApi<Overrides extends ChromeApiOverrides>(
  overrides?: Overrides,
): ChromeApi & Overrides {
  const api: ChromeApi = blank();
  for (const [group, operations] of Object.entries(overrides ?? {})) {
    Object.assign(api[group as keyof ChromeApi], operations);
  }
  return api as ChromeApi & Overrides;
}
