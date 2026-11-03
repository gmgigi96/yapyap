import { isSet, type Environment } from '../environment.ts';

type DisplayBackendSetting = 'auto' | 'wayland' | 'x11';

type Backend = 'wayland' | 'x11';

/** Where the choice came from, strongest first. */
type BackendSource = 'command line' | 'environment' | 'settings' | 'automatic';

export interface DisplayBackend {
  /** The value for Chromium's `--ozone-platform` switch, when YapYap must set it. */
  readonly ozonePlatform: Backend | undefined;
  /** The backend Chromium ends up on; undefined off Linux. */
  readonly active: Backend | undefined;
  readonly source: BackendSource;
  /** Why a chosen backend was not used, for the log. */
  readonly fallback: string | undefined;
}

export interface BackendInputs {
  readonly platform: string;
  readonly setting: DisplayBackendSetting;
  readonly argv: readonly string[];
  readonly env: Environment;
}

const BACKEND_NAMES: Readonly<Record<Backend, string>> = { wayland: 'Wayland', x11: 'X11' };

const OZONE_FLAG = /^--ozone-platform(?:-hint)?=(\S*)$/;

/** What Chromium's automatic choice picks: Wayland whenever a Wayland display exists. */
function automatic(env: Environment): Backend {
  return isSet(env, 'WAYLAND_DISPLAY') ? 'wayland' : 'x11';
}

/** A Chromium value; anything but the two backends means its automatic choice. */
function backendOf(value: string, env: Environment): Backend {
  return value === 'wayland' || value === 'x11' ? value : automatic(env);
}

function fromCommandLine(argv: readonly string[]): string | undefined {
  return argv.map((arg) => OZONE_FLAG.exec(arg)?.[1]).find((value) => value !== undefined);
}

/** A forced backend whose display server is missing would stop Chromium from starting. */
function fromSettings(setting: Backend, env: Environment): DisplayBackend {
  const display = setting === 'wayland' ? 'WAYLAND_DISPLAY' : 'DISPLAY';
  if (isSet(env, display)) {
    return { ozonePlatform: setting, active: setting, source: 'settings', fallback: undefined };
  }
  return {
    ozonePlatform: undefined,
    active: automatic(env),
    source: 'automatic',
    fallback: `The ${BACKEND_NAMES[setting]} display backend was chosen in settings, but ${display} is not set; using the automatic choice.`,
  };
}

/**
 * Chooses how YapYap talks to the Linux display server. Command-line flags
 * and the environment win over the setting, so a user can always get a
 * working window back without editing settings.
 */
export function chooseDisplayBackend(inputs: BackendInputs): DisplayBackend {
  const none = { ozonePlatform: undefined, fallback: undefined };
  if (inputs.platform !== 'linux') {
    return { ...none, active: undefined, source: 'automatic' };
  }
  const flag = fromCommandLine(inputs.argv);
  if (flag !== undefined) {
    return { ...none, active: backendOf(flag, inputs.env), source: 'command line' };
  }
  // Electron no longer reads this variable itself, but users and launchers still set it.
  const hint = inputs.env['ELECTRON_OZONE_PLATFORM_HINT'] ?? '';
  if (hint !== '') {
    const active = backendOf(hint, inputs.env);
    return { ...none, ozonePlatform: active, active, source: 'environment' };
  }
  if (inputs.setting !== 'auto') {
    return fromSettings(inputs.setting, inputs.env);
  }
  return { ...none, active: automatic(inputs.env), source: 'automatic' };
}

/** One line for diagnostics. */
export function describeDisplayBackend(backend: DisplayBackend): string {
  return backend.active === undefined
    ? 'native'
    : `${BACKEND_NAMES[backend.active]} (${backend.source})`;
}
