import { CHROME_CHANNELS, DOWNLOAD_ACTIONS, type DownloadAction } from '../../shared/chrome-api.ts';
import { en } from '../../shared/messages/en.ts';
import type { DownloadList } from './download-list.ts';
import { argumentsOf, noArguments } from '../ipc/arguments.ts';
import type { ChromeHandler } from '../ipc/chrome.ts';
import type { ChromePage } from '../chrome/window-opener.ts';

export const DOWNLOADS_PAGE: ChromePage = {
  path: 'downloads.html',
  window: {
    title: en.windows.downloads,
    width: 520,
    height: 480,
    minWidth: 380,
    minHeight: 280,
    minimizable: false,
  },
};

const isAction = (value: unknown): value is DownloadAction =>
  DOWNLOAD_ACTIONS.includes(value as DownloadAction);

/** The Downloads window's operations; a download is named by its id, never its path. */
export function downloadsHandlers(list: DownloadList): ChromeHandler[] {
  return [
    { channel: CHROME_CHANNELS.downloadsList, accepts: noArguments, handle: () => list.entries() },
    {
      channel: CHROME_CHANNELS.downloadsAct,
      accepts: argumentsOf(Number.isSafeInteger, isAction),
      handle: (_call, id, action) => {
        list.act(id as number, action as DownloadAction);
      },
    },
    {
      channel: CHROME_CHANNELS.downloadsClear,
      accepts: noArguments,
      handle: () => {
        list.clear();
      },
    },
  ];
}
