import type {
  AgentNarrowingStep,
  AgentsView,
  AgentTokenCreated,
  AgentTokenSpec,
} from './agents-api.ts';
import type { SettingValue } from './settings-fields.ts';
import type { CustomCode } from './custom-code.ts';
import type { ActiveShortcut } from './shortcuts.ts';

/** What the About window shows; built in main, rendered by the chrome renderer. */
export interface AboutInfo {
  readonly name: string;
  readonly version: string;
  readonly channel: string;
  readonly electron: string;
  readonly chromium: string;
  readonly node: string;
  readonly os: string;
  readonly license: string;
  /** The rendering mode, such as software rendering in safe mode. */
  readonly graphics: string;
}

/** Why WhatsApp is not showing, as the recovery screen explains it. */
export interface RecoveryProblem {
  readonly kind: 'unsupported' | 'blank' | 'load-failed' | 'crashed';
  readonly description: string;
}

/** A service the user brings an API key for. */
export type KeyedProvider = 'anthropic' | 'openai';

/** What the user can do with the private model now. */
export type PrivateModelAction = 'download' | 'pause' | 'resume' | 'remove' | 'smaller';

/** A model server found on this computer, as Settings lists it. */
export interface FoundServer {
  readonly server: string;
  readonly endpoint: string;
  readonly models: readonly string[];
}

/**
 * Settings › Assistant (ADR 0017): who answers, how each place it can
 * think stands, the provider's models, and the chats it may read. The
 * preferences themselves are settings fields; this is the rest.
 */
export interface AssistantView {
  /** Who answers now, or null while nothing is set up. */
  readonly inUse: 'built-in' | 'anthropic' | 'openai' | 'local' | null;
  /** What keeps the assistant from answering, in the user's words; empty once nothing does. */
  readonly status: string;
  /** Whether a key is saved, by provider; never the key itself. */
  readonly keys: Readonly<Record<KeyedProvider, boolean>>;
  readonly privateModel: {
    /** Its download size, as people read it. */
    readonly size: string;
    readonly status: string;
    readonly actions: readonly PrivateModelAction[];
  };
  /** What the provider in use lists, and the model Auto picks; empty until it is set up. */
  readonly models: readonly { readonly id: string; readonly label: string }[];
  readonly auto: string | null;
  /** The chats the assistant may read, by account; a name YapYap could not keep safely is null. */
  readonly chats: readonly {
    readonly account: string;
    readonly accountName: string;
    readonly chats: readonly { readonly id: string; readonly name: string | null }[];
  }[];
}

/** The settings window's view of the settings. */
export interface SettingsSnapshot {
  /** Keyed by field ID, for the fields in `SETTING_FIELDS`. */
  readonly values: Readonly<Record<string, SettingValue>>;
  /** A changed setting only takes effect after a restart. */
  readonly restartPending: boolean;
  /** Why the last change of a field did not take effect, keyed by field ID. */
  readonly problems: Readonly<Record<string, string>>;
  /** Fields shown but not changeable here, with the reason, keyed by field ID. */
  readonly unavailable: Readonly<Record<string, string>>;
}

/** How an export or import ended, with what to tell the user. */
export interface TransferResult {
  readonly outcome: 'done' | 'cancelled' | 'failed';
  /** Empty when there is nothing to say, as after a cancel. */
  readonly message: string;
}

/** A screen or window the user can share, with a small preview. */
export interface PickerSource {
  readonly id: string;
  readonly name: string;
  readonly kind: 'screen' | 'window';
  /** A `data:` image URL. */
  readonly thumbnail: string;
}

/** What the screen-sharing picker offers. */
export interface PickerOffer {
  readonly sources: readonly PickerSource[];
  /** Whether system audio can be shared too (Windows only). */
  readonly offerAudio: boolean;
}

/** An account as the sidebar shows it. */
export interface SidebarAccount {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  /** Unread chats, from WhatsApp's title; a muted account shows none. */
  readonly unread: number;
  readonly muted: boolean;
  readonly active: boolean;
  /** Sharing a screen or window right now, which the sidebar always shows (#161). */
  readonly sharing: boolean;
  /** The account's WhatsApp profile photo as a data URL, once YapYap has read it (#87). */
  readonly avatar: string | undefined;
}

/** What the sidebar shows: the running accounts and how to lay them out. */
export interface SidebarState {
  readonly accounts: readonly SidebarAccount[];
  /** Avatars only, in a narrow strip. */
  readonly compact: boolean;
  readonly doNotDisturb: boolean;
}

/** The API the chrome preload exposes as `window.yapyap`, one function per operation. */
export interface ChromeApi {
  readonly about: {
    readonly info: () => Promise<AboutInfo>;
    readonly copyTechnicalDetails: () => Promise<void>;
  };
  readonly recovery: {
    readonly problem: () => Promise<RecoveryProblem | null>;
    readonly retry: () => Promise<void>;
    readonly clearCache: () => Promise<void>;
    readonly copyDiagnostics: () => Promise<void>;
  };
  readonly settings: {
    readonly get: () => Promise<SettingsSnapshot>;
    readonly set: (id: string, value: SettingValue) => Promise<SettingsSnapshot>;
    readonly restart: () => Promise<void>;
    readonly export: () => Promise<TransferResult>;
    readonly import: () => Promise<TransferResult>;
    /** Asks in the system's folder dialog; read the settings again afterwards. */
    readonly chooseFolder: (id: string) => Promise<void>;
  };
  /** Settings › Assistant and the Welcome's assistant step (ADR 0017). */
  readonly assistant: {
    readonly view: () => Promise<AssistantView>;
    /** Keeps a key, encrypted; false when this system cannot keep it safely. */
    readonly saveKey: (provider: KeyedProvider, key: string) => Promise<boolean>;
    readonly forgetKey: (provider: KeyedProvider) => Promise<void>;
    /** Asks the provider for its models with the saved key: '' when it works, else what failed, in words. */
    readonly testKey: (provider: KeyedProvider) => Promise<string>;
    /** Looks for model servers on this computer, at the usual addresses. */
    readonly findServers: () => Promise<readonly FoundServer[]>;
    readonly privateModel: (action: PrivateModelAction) => Promise<void>;
    readonly forgetChat: (account: string, id: string) => Promise<void>;
  };
  /** Settings › Agents: the MCP server's tokens and what agents did (ADR 0019). */
  readonly agents: {
    readonly view: () => Promise<AgentsView>;
    /** A new token, shown once; or why YapYap refused it. */
    readonly create: (spec: AgentTokenSpec) => Promise<AgentTokenCreated>;
    readonly revoke: (id: string) => Promise<void>;
    /** Takes one scope, account or chat away; false when the token would be left with none. */
    readonly narrow: (id: string, step: AgentNarrowingStep) => Promise<boolean>;
    /** Moves the server to another port; agents must then be given the new address. */
    readonly newPort: () => Promise<void>;
    /** The name of the chat open in `account`, to add to a token; null when none is open. */
    readonly openChat: (account: string) => Promise<string | null>;
    /** Copies a new token, or a command that holds it, which chrome pages cannot do themselves. */
    readonly copy: (text: string) => Promise<void>;
  };
  readonly chat: {
    /** Opens the chat with an international number; false when WhatsApp cannot yet. */
    readonly openNumber: (number: string) => Promise<boolean>;
  };
  readonly accounts: {
    readonly list: () => Promise<AccountList>;
    /** Null when YapYap refused the change, such as turning off the last running account. */
    readonly save: (id: string, change: AccountChange) => Promise<AccountList | null>;
    /**
     * Asks the user first, so the list may come back unchanged; null when
     * YapYap refused, such as for the last running account.
     */
    readonly remove: (id: string) => Promise<AccountList | null>;
    /** `audio` and `video` the account was allowed until YapYap quits; null while it is off. */
    readonly permissions: (id: string) => Promise<readonly string[] | null>;
    readonly forgetPermissions: (id: string) => Promise<readonly string[] | null>;
  };
  readonly sidebar: {
    readonly state: () => Promise<SidebarState>;
    readonly switchTo: (id: string) => Promise<void>;
    readonly setCompact: (compact: boolean) => Promise<void>;
    readonly stopSharing: (id: string) => Promise<void>;
    /** YapYap sends the new state whenever it changes; the page never asks what to listen to. */
    readonly onState: (listener: (state: SidebarState) => void) => void;
  };
  readonly report: {
    /** The sanitized diagnostics the report would carry, for the user to review. */
    readonly diagnostics: () => Promise<string>;
    /** Copies the report and opens GitHub's form with it; YapYap itself sends nothing. */
    readonly open: (description: string) => Promise<void>;
  };
  readonly picker: {
    readonly offer: () => Promise<PickerOffer>;
    readonly choose: (id: string, audio: boolean) => Promise<void>;
    readonly cancel: () => Promise<void>;
  };
  readonly shortcuts: {
    readonly list: () => Promise<ShortcutList>;
    /** New keys for one shortcut, or null to go back to YapYap's own. */
    readonly set: (id: string, accelerator: string | null) => Promise<ShortcutChange>;
  };
  readonly downloads: {
    readonly list: () => Promise<readonly DownloadEntry[]>;
    readonly act: (id: number, action: DownloadAction) => Promise<void>;
    /** Forgets downloads that have ended; their files stay. */
    readonly clear: () => Promise<void>;
  };
  readonly spelling: {
    readonly languages: () => Promise<SpellingLanguages>;
    /** Every language must have a dictionary; an empty list means the system's language. */
    readonly choose: (languages: readonly string[]) => Promise<SpellingLanguages>;
  };
  readonly customCode: {
    readonly get: () => Promise<CustomCodeView>;
    /** Saves every scope at once; scopes that are not listed are dropped. */
    readonly save: (code: CustomCode) => Promise<CustomCodeView>;
    /** Shows unsaved CSS for one scope in its WhatsApp pages; null goes back to the saved CSS. */
    readonly preview: (scope: string, css: string | null) => Promise<void>;
  };
  readonly proxyLogin: {
    readonly request: () => Promise<ProxyLoginRequest>;
    /** Null cancels the sign-in. */
    readonly answer: (credentials: ProxyLoginAnswer | null) => Promise<void>;
  };
}

/** The custom code, and the scopes it can apply to: all accounts first, then each account. */
export interface CustomCodeView {
  readonly code: CustomCode;
  readonly scopes: readonly { readonly id: string; readonly label: string }[];
}

/** What the Downloads window can ask of one download. */
export type DownloadAction = 'pause' | 'resume' | 'cancel' | 'show';

export const DOWNLOAD_ACTIONS: readonly DownloadAction[] = ['pause', 'resume', 'cancel', 'show'];

/** One download of this session, as the Downloads window shows it. */
export interface DownloadEntry {
  readonly id: number;
  readonly name: string;
  readonly state: 'progressing' | 'paused' | 'completed' | 'cancelled' | 'interrupted';
  readonly received: number;
  /** Zero when the server did not say. */
  readonly total: number;
  readonly canResume: boolean;
}

/** The shortcuts of the platform YapYap runs on, with its own keys. */
export interface ShortcutList {
  readonly platform: string;
  readonly shortcuts: readonly ActiveShortcut[];
  readonly global: readonly GlobalShortcutState[];
}

/** A shortcut that works from any app, and whether the system granted its keys. */
export interface GlobalShortcutState {
  readonly id: string;
  readonly label: string;
  /** Empty when it has no keys. */
  readonly accelerator: string;
  readonly registered: boolean;
}

/** The shortcuts after a change, and why it was refused; empty when it was not. */
export interface ShortcutChange extends ShortcutList {
  readonly problem: string;
}

/** How many spelling languages can be on at once; each one is a dictionary to load. */
export const MAX_SPELLING_LANGUAGES = 10;

/** What the Spelling Languages window shows. */
export interface SpellingLanguages {
  readonly enabled: boolean;
  /** The languages with a dictionary; empty on macOS, which picks languages itself. */
  readonly available: readonly string[];
  readonly chosen: readonly string[];
  /** What is checked now: the chosen languages, or the system's. */
  readonly inUse: readonly string[];
}

/** A proxy asking the user to sign in. */
export interface ProxyLoginRequest {
  readonly host: string;
  readonly port: number;
  /** The proxy refused the last username and password tried. */
  readonly failed: boolean;
  /** Whether this computer can keep the password encrypted. */
  readonly canRemember: boolean;
}

export interface ProxyLoginAnswer {
  readonly username: string;
  readonly password: string;
  readonly remember: boolean;
}

/** An account as YapYap's own windows and menus show it. */
export interface AccountSummary {
  readonly id: string;
  readonly name: string;
  /** One of {@link AccountList.colors}. */
  readonly color: string;
  /** An account that is off keeps its data but runs no WhatsApp. */
  readonly enabled: boolean;
  /** A muted account shows no notifications and plays no sounds while out of sight. */
  readonly muted: boolean;
  /** The account's own proxy; empty uses Settings → Network. */
  readonly proxy: string;
  /** The account the main window shows. */
  readonly active: boolean;
}

export interface AccountList {
  readonly accounts: readonly AccountSummary[];
  /** The colors an account can take, in the order to offer them. */
  readonly colors: readonly string[];
}

/** What the Accounts window can change about an account. */
export interface AccountChange {
  readonly name: string;
  readonly color: string;
  readonly enabled: boolean;
  readonly muted: boolean;
  readonly proxy: string;
}

export const CHROME_CHANNELS = {
  aboutInfo: 'about:info',
  copyTechnicalDetails: 'about:copy-technical-details',
  recoveryProblem: 'recovery:problem',
  recoveryRetry: 'recovery:retry',
  recoveryClearCache: 'recovery:clear-cache',
  recoveryCopyDiagnostics: 'recovery:copy-diagnostics',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsRestart: 'settings:restart',
  settingsExport: 'settings:export',
  settingsImport: 'settings:import',
  settingsChooseFolder: 'settings:choose-folder',
  pickerOffer: 'picker:offer',
  pickerChoose: 'picker:choose',
  pickerCancel: 'picker:cancel',
  chatOpenNumber: 'chat:open-number',
  accountsList: 'accounts:list',
  accountsSave: 'accounts:save',
  accountsRemove: 'accounts:remove',
  accountsPermissions: 'accounts:permissions',
  accountsForgetPermissions: 'accounts:forget-permissions',
  sidebarState: 'sidebar:state',
  sidebarSwitch: 'sidebar:switch',
  sidebarSetCompact: 'sidebar:set-compact',
  sidebarStopSharing: 'sidebar:stop-sharing',
  reportDiagnostics: 'report:diagnostics',
  reportOpen: 'report:open',
  shortcutsList: 'shortcuts:list',
  shortcutsSet: 'shortcuts:set',
  downloadsList: 'downloads:list',
  downloadsAct: 'downloads:act',
  downloadsClear: 'downloads:clear',
  spellingLanguages: 'spelling:languages',
  spellingChoose: 'spelling:choose',
  customCodeGet: 'custom-code:get',
  customCodeSave: 'custom-code:save',
  customCodePreview: 'custom-code:preview',
  proxyLoginRequest: 'proxy-login:request',
  proxyLoginAnswer: 'proxy-login:answer',
  assistantView: 'assistant:view',
  assistantSaveKey: 'assistant:save-key',
  assistantForgetKey: 'assistant:forget-key',
  assistantTestKey: 'assistant:test-key',
  assistantFindServers: 'assistant:find-servers',
  assistantPrivateModel: 'assistant:private-model',
  assistantForgetChat: 'assistant:forget-chat',
  agentsView: 'agents:view',
  agentsCreate: 'agents:create',
  agentsRevoke: 'agents:revoke',
  agentsNarrow: 'agents:narrow',
  agentsNewPort: 'agents:new-port',
  agentsOpenChat: 'agents:open-chat',
  agentsCopy: 'agents:copy',
} as const;

/** Tells the sidebar how the accounts stand. */
export const SIDEBAR_STATE_EVENT = 'sidebar:state-changed';

/** What the main process sends on each event channel, the only ones a chrome page hears. */
export interface ChromeEvents {
  readonly [SIDEBAR_STATE_EVENT]: SidebarState;
}
