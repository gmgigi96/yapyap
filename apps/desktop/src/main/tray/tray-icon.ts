import { followSettings, type SettingsService } from '../settings/service.ts';
import { trayIconChoice, type TrayIconChoice } from './icon-choice.ts';
import { drawSymbolicIcon } from './symbolic-icon.ts';

/** An image as Electron's `nativeImage` makes it. */
export interface TrayImage {
  setTemplateImage(template: boolean): void;
}

export interface ImageFactory {
  readonly fromPath: (path: string) => TrayImage;
  readonly fromBitmap: (
    bitmap: Buffer,
    options: { width: number; height: number; scaleFactor: number },
  ) => TrayImage;
}

/** The image for a choice: the app icon from disk, or the drawn symbolic one. */
export function trayImage(
  choice: TrayIconChoice,
  images: ImageFactory,
  colorIcon: string,
): TrayImage {
  if (choice === 'color') {
    return images.fromPath(colorIcon);
  }
  // A template is drawn dark; macOS recolors it for the menu bar.
  const { bitmap, ...size } = drawSymbolicIcon(choice === 'light' ? 'light' : 'dark');
  const image = images.fromBitmap(bitmap, size);
  image.setTemplateImage(choice === 'template');
  return image;
}

/** Electron's `nativeTheme`, as far as the panel's shade goes. */
export interface SchemeSource {
  readonly shouldUseDarkColors: boolean;
  /** Windows only: whether the taskbar is dark, which can differ from the app scheme. */
  readonly shouldUseDarkColorsForSystemIntegratedUI: boolean;
  on(event: 'updated', listener: () => void): unknown;
}

/** Whether the panel the tray sits in is dark. */
export function darkPanel(scheme: SchemeSource, platform: string): boolean {
  return platform === 'win32'
    ? scheme.shouldUseDarkColorsForSystemIntegratedUI
    : scheme.shouldUseDarkColors;
}

export interface TrayIconDependencies {
  readonly platform: string;
  readonly settings: Pick<SettingsService, 'current' | 'onChange'>;
  readonly scheme: SchemeSource;
  readonly image: (choice: TrayIconChoice) => unknown;
}

/** Shows the icon the setting asks for, again whenever the setting or the scheme changes. */
export function followTrayIconSetting(
  tray: { setImage(image: unknown): void },
  deps: TrayIconDependencies,
): void {
  const apply = (): void => {
    const style = deps.settings.current().appearance.trayIcon;
    tray.setImage(
      deps.image(trayIconChoice(style, deps.platform, darkPanel(deps.scheme, deps.platform))),
    );
  };
  followSettings(deps.settings, apply);
  deps.scheme.on('updated', apply);
}
