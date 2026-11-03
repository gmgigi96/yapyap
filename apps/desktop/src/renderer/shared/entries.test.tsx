import { beforeEach, describe, expect, it, vi } from 'vitest';
import { en } from '../../shared/messages/en.ts';
import { About } from '../about/About.tsx';
import { Accounts } from '../accounts/Accounts.tsx';
import { CustomCodeEditor } from '../custom-code/CustomCode.tsx';
import { Downloads } from '../downloads/Downloads.tsx';
import { NewChat } from '../new-chat/NewChat.tsx';
import { cancelOnEscape, Picker } from '../picker/Picker.tsx';
import { ProxyLogin } from '../proxy-login/ProxyLogin.tsx';
import { Recovery } from '../recovery/Recovery.tsx';
import { ProblemReport } from '../report/ProblemReport.tsx';
import { Settings } from '../settings/Settings.tsx';
import { Shortcuts } from '../shortcuts/Shortcuts.tsx';
import { Sidebar } from '../sidebar/Sidebar.tsx';
import { SpellingLanguagesPage } from '../spelling-languages/SpellingLanguages.tsx';
import { Welcome } from '../welcome/Welcome.tsx';
import { closeOnEscape, mount } from './mount.tsx';

vi.mock('./mount.tsx', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  mount: vi.fn(),
}));

const close = { escape: closeOnEscape };
const windows = en.windows;

/**
 * Every chrome page's entry, what it mounts, and how: the window title
 * matches what the main process names the window, and dialog-like windows
 * close on Escape. Pages that keep a draft handle Escape themselves.
 */
const ENTRIES = [
  ['about', () => import('../about/main.tsx'), About, { title: windows.about, ...close }],
  ['accounts', () => import('../accounts/main.tsx'), Accounts, { title: windows.accounts }],
  [
    'custom code',
    () => import('../custom-code/main.tsx'),
    CustomCodeEditor,
    { title: windows.customCode },
  ],
  [
    'downloads',
    () => import('../downloads/main.tsx'),
    Downloads,
    { title: windows.downloads, ...close },
  ],
  ['new chat', () => import('../new-chat/main.tsx'), NewChat, { title: windows.newChat, ...close }],
  [
    'picker',
    () => import('../picker/main.tsx'),
    Picker,
    { title: windows.picker, escape: cancelOnEscape },
  ],
  [
    'proxy sign-in',
    () => import('../proxy-login/main.tsx'),
    ProxyLogin,
    { title: windows.proxyLogin, ...close },
  ],
  ['recovery', () => import('../recovery/main.tsx'), Recovery, undefined],
  ['report', () => import('../report/main.tsx'), ProblemReport, { title: windows.report }],
  [
    'settings',
    () => import('../settings/main.tsx'),
    Settings,
    { title: windows.settings, ...close },
  ],
  [
    'shortcuts',
    () => import('../shortcuts/main.tsx'),
    Shortcuts,
    { title: windows.shortcuts, ...close },
  ],
  ['sidebar', () => import('../sidebar/main.tsx'), Sidebar, undefined],
  [
    'spelling languages',
    () => import('../spelling-languages/main.tsx'),
    SpellingLanguagesPage,
    { title: windows.spellingLanguages, ...close },
  ],
  ['welcome', () => import('../welcome/main.tsx'), Welcome, { title: windows.welcome, ...close }],
] as const;

describe('chrome page entries', () => {
  beforeEach(() => {
    vi.mocked(mount).mockClear();
  });

  it.each(ENTRIES)('the %s entry mounts its page', async (_name, load, page, options) => {
    await load();
    const expected = options === undefined ? [page] : [page, options];
    expect(vi.mocked(mount).mock.calls).toEqual([expected]);
  });
});
