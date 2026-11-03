import {
  CHROME_CHANNELS,
  SIDEBAR_STATE_EVENT,
  type ChromeEvents,
  type AboutInfo,
  type AccountList,
  type AssistantView,
  type ChromeApi,
  type FoundServer,
  type DownloadEntry,
  type PickerOffer,
  type ShortcutChange,
  type ShortcutList,
  type CustomCodeView,
  type ProxyLoginRequest,
  type RecoveryProblem,
  type SettingsSnapshot,
  type SidebarState,
  type SpellingLanguages,
  type TransferResult,
} from '../../shared/chrome-api.ts';

type Invoke = (channel: string, ...args: unknown[]) => Promise<unknown>;
/** Hears one of the events the main process sends. */
type Listen = <Event extends keyof ChromeEvents>(
  event: Event,
  listener: (payload: ChromeEvents[Event]) => void,
) => void;

function assistantBridge(invoke: Invoke): ChromeApi['assistant'] {
  return {
    view: () => invoke(CHROME_CHANNELS.assistantView) as Promise<AssistantView>,
    saveKey: (provider, key) =>
      invoke(CHROME_CHANNELS.assistantSaveKey, provider, key) as Promise<boolean>,
    forgetKey: async (provider) => {
      await invoke(CHROME_CHANNELS.assistantForgetKey, provider);
    },
    testKey: (provider) => invoke(CHROME_CHANNELS.assistantTestKey, provider) as Promise<string>,
    findServers: () =>
      invoke(CHROME_CHANNELS.assistantFindServers) as Promise<readonly FoundServer[]>,
    privateModel: async (action) => {
      await invoke(CHROME_CHANNELS.assistantPrivateModel, action);
    },
    forgetChat: async (account, id) => {
      await invoke(CHROME_CHANNELS.assistantForgetChat, account, id);
    },
  };
}

function accountsBridge(invoke: Invoke): ChromeApi['accounts'] {
  return {
    list: () => invoke(CHROME_CHANNELS.accountsList) as Promise<AccountList>,
    save: (id, change) =>
      invoke(CHROME_CHANNELS.accountsSave, id, change) as Promise<AccountList | null>,
    remove: (id) => invoke(CHROME_CHANNELS.accountsRemove, id) as Promise<AccountList | null>,
    permissions: (id) =>
      invoke(CHROME_CHANNELS.accountsPermissions, id) as Promise<readonly string[] | null>,
    forgetPermissions: (id) =>
      invoke(CHROME_CHANNELS.accountsForgetPermissions, id) as Promise<readonly string[] | null>,
  };
}

function sidebarBridge(invoke: Invoke, listen: Listen): ChromeApi['sidebar'] {
  return {
    state: () => invoke(CHROME_CHANNELS.sidebarState) as Promise<SidebarState>,
    switchTo: async (id) => {
      await invoke(CHROME_CHANNELS.sidebarSwitch, id);
    },
    setCompact: async (compact) => {
      await invoke(CHROME_CHANNELS.sidebarSetCompact, compact);
    },
    stopSharing: async (id) => {
      await invoke(CHROME_CHANNELS.sidebarStopSharing, id);
    },
    onState: (listener) => {
      listen(SIDEBAR_STATE_EVENT, listener);
    },
  };
}

function pickerBridge(invoke: Invoke): ChromeApi['picker'] {
  return {
    offer: () => invoke(CHROME_CHANNELS.pickerOffer) as Promise<PickerOffer>,
    choose: async (id, audio) => {
      await invoke(CHROME_CHANNELS.pickerChoose, id, audio);
    },
    cancel: async () => {
      await invoke(CHROME_CHANNELS.pickerCancel);
    },
  };
}

function downloadsBridge(invoke: Invoke): ChromeApi['downloads'] {
  return {
    list: () => invoke(CHROME_CHANNELS.downloadsList) as Promise<readonly DownloadEntry[]>,
    act: async (id, action) => {
      await invoke(CHROME_CHANNELS.downloadsAct, id, action);
    },
    clear: async () => {
      await invoke(CHROME_CHANNELS.downloadsClear);
    },
  };
}

function shortcutsBridge(invoke: Invoke): ChromeApi['shortcuts'] {
  return {
    list: () => invoke(CHROME_CHANNELS.shortcutsList) as Promise<ShortcutList>,
    set: (id, accelerator) =>
      invoke(CHROME_CHANNELS.shortcutsSet, id, accelerator) as Promise<ShortcutChange>,
  };
}

function customCodeBridge(invoke: Invoke): ChromeApi['customCode'] {
  return {
    get: () => invoke(CHROME_CHANNELS.customCodeGet) as Promise<CustomCodeView>,
    save: (code) => invoke(CHROME_CHANNELS.customCodeSave, code) as Promise<CustomCodeView>,
    preview: async (scope, css) => {
      await invoke(CHROME_CHANNELS.customCodePreview, scope, css);
    },
  };
}

function reportBridge(invoke: Invoke): ChromeApi['report'] {
  return {
    diagnostics: () => invoke(CHROME_CHANNELS.reportDiagnostics) as Promise<string>,
    open: async (description) => {
      await invoke(CHROME_CHANNELS.reportOpen, description);
    },
  };
}

function spellingBridge(invoke: Invoke): ChromeApi['spelling'] {
  return {
    languages: () => invoke(CHROME_CHANNELS.spellingLanguages) as Promise<SpellingLanguages>,
    // A copy, so the page cannot change the list while it is on its way.
    choose: (languages) =>
      invoke(CHROME_CHANNELS.spellingChoose, [...languages]) as Promise<SpellingLanguages>,
  };
}

function proxyLoginBridge(invoke: Invoke): ChromeApi['proxyLogin'] {
  return {
    request: () => invoke(CHROME_CHANNELS.proxyLoginRequest) as Promise<ProxyLoginRequest>,
    answer: async (credentials) => {
      // A copy with only the expected fields, so nothing else rides along.
      await invoke(
        CHROME_CHANNELS.proxyLoginAnswer,
        credentials === null
          ? null
          : {
              username: credentials.username,
              password: credentials.password,
              remember: credentials.remember,
            },
      );
    },
  };
}

function settingsBridge(invoke: Invoke): ChromeApi['settings'] {
  return {
    get: () => invoke(CHROME_CHANNELS.settingsGet) as Promise<SettingsSnapshot>,
    set: (id, value) => invoke(CHROME_CHANNELS.settingsSet, id, value) as Promise<SettingsSnapshot>,
    restart: async () => {
      await invoke(CHROME_CHANNELS.settingsRestart);
    },
    export: () => invoke(CHROME_CHANNELS.settingsExport) as Promise<TransferResult>,
    import: () => invoke(CHROME_CHANNELS.settingsImport) as Promise<TransferResult>,
    chooseFolder: async (id) => {
      await invoke(CHROME_CHANNELS.settingsChooseFolder, id);
    },
  };
}

const running = (invoke: Invoke, channel: string) => async (): Promise<void> => {
  await invoke(channel);
};

function aboutBridge(invoke: Invoke): ChromeApi['about'] {
  return {
    info: () => invoke(CHROME_CHANNELS.aboutInfo) as Promise<AboutInfo>,
    copyTechnicalDetails: running(invoke, CHROME_CHANNELS.copyTechnicalDetails),
  };
}

function recoveryBridge(invoke: Invoke): ChromeApi['recovery'] {
  return {
    problem: () => invoke(CHROME_CHANNELS.recoveryProblem) as Promise<RecoveryProblem | null>,
    retry: running(invoke, CHROME_CHANNELS.recoveryRetry),
    clearCache: running(invoke, CHROME_CHANNELS.recoveryClearCache),
    copyDiagnostics: running(invoke, CHROME_CHANNELS.recoveryCopyDiagnostics),
  };
}

/**
 * Builds the chrome API from a single invoke function and a single listen
 * function. Each operation and event has its own fixed channel, so the page
 * can never choose what it calls or hears.
 */
export function createChromeBridge(invoke: Invoke, listen: Listen): ChromeApi {
  return {
    about: aboutBridge(invoke),
    recovery: recoveryBridge(invoke),
    settings: settingsBridge(invoke),
    assistant: assistantBridge(invoke),
    chat: {
      openNumber: (number) => invoke(CHROME_CHANNELS.chatOpenNumber, number) as Promise<boolean>,
    },
    accounts: accountsBridge(invoke),
    sidebar: sidebarBridge(invoke, listen),
    report: reportBridge(invoke),
    spelling: spellingBridge(invoke),
    picker: pickerBridge(invoke),
    shortcuts: shortcutsBridge(invoke),
    downloads: downloadsBridge(invoke),
    customCode: customCodeBridge(invoke),
    proxyLogin: proxyLoginBridge(invoke),
  };
}
