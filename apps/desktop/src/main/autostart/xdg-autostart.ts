import { isAbsolute, join } from 'node:path';
import type { Environment } from '../environment.ts';
import { APP_ID, PRODUCT_NAME } from '../identity/product.ts';
import type { AutostartPort } from './autostart.ts';

interface XdgFiles {
  readonly exists: (path: string) => boolean;
  readonly read: (path: string) => string;
  readonly mkdir: (path: string) => void;
  readonly write: (path: string, text: string) => void;
  readonly remove: (path: string) => void;
}

export interface XdgAutostartOptions {
  readonly env: Environment;
  readonly home: string;
  readonly execPath: string;
  readonly files: XdgFiles;
}

/** Quotes an `Exec` argument as the Desktop Entry Specification requires. */
export function quoteExecArgument(argument: string): string {
  const escaped = argument.replaceAll(/["`$\\]/g, String.raw`\$&`).replaceAll('%', '%%');
  return `"${escaped}"`;
}

/** The autostart entry; desktops read only these keys from it. */
export function autostartEntry(executable: string): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${PRODUCT_NAME}`,
    `Exec=${quoteExecArgument(executable)}`,
    `Icon=${APP_ID}`,
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n');
}

/** The program an autostart entry starts, undone from {@link quoteExecArgument}. */
export function entryExecutable(entry: string): string | undefined {
  const quoted = /^Exec="((?:[^"\\]|\\.)*)"$/m.exec(entry)?.[1];
  return quoted?.replaceAll(/\\(.)/g, '$1').replaceAll('%%', '%');
}

/** Autostart through `$XDG_CONFIG_HOME/autostart`, which Linux desktops read at login. */
export function xdgAutostart(options: XdgAutostartOptions): AutostartPort {
  const configured = options.env['XDG_CONFIG_HOME'];
  // The specification says to ignore a relative or empty value.
  const configHome =
    configured !== undefined && isAbsolute(configured) ? configured : join(options.home, '.config');
  const dir = join(configHome, 'autostart');
  const path = join(dir, `${APP_ID}.desktop`);
  // An AppImage runs from a mount that changes every launch; start the image itself.
  const appImage = options.env['APPIMAGE'] ?? '';
  const executable = appImage === '' ? options.execPath : appImage;
  const { files } = options;
  return {
    enabled: () => files.exists(path),
    enable: () => {
      files.mkdir(dir);
      files.write(path, autostartEntry(executable));
    },
    disable: () => {
      if (files.exists(path)) {
        files.remove(path);
      }
    },
    // The entry is shared by every YapYap on this computer, so it is taken
    // over only when the program it starts is gone, as when an AppImage moved.
    refresh: () => {
      const current = entryExecutable(files.read(path));
      if (current === undefined || !files.exists(current)) {
        files.write(path, autostartEntry(executable));
      }
    },
  };
}
