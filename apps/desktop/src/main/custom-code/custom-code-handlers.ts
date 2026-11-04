import { CHROME_CHANNELS, type CustomCodeView } from '../../shared/api/chrome-api.ts';
import { ALL_ACCOUNTS, isSnippetText, type CustomCode } from '../../shared/custom-code.ts';
import { en } from '../../shared/messages/en.ts';
import { isCustomCode, type CustomCodeController } from './custom-code.ts';
import { argumentsOf, isString, noArguments } from '../ipc/arguments.ts';
import type { ChromeHandler } from '../ipc/chrome.ts';
import type { ChromePage } from '../chrome/window-opener.ts';

/** Where the user edits their own CSS and JavaScript (#72). */
export const CUSTOM_CODE_PAGE: ChromePage = {
  path: 'custom-code.html',
  window: {
    title: en.windows.customCode,
    width: 640,
    height: 720,
    minWidth: 480,
    minHeight: 480,
    minimizable: false,
  },
};

type AccountList = () => readonly { readonly id: string; readonly name: string }[];

function viewOf(code: CustomCodeController, accounts: AccountList): CustomCodeView {
  return {
    code: code.current(),
    scopes: [
      { id: ALL_ACCOUNTS, label: en.customCode.allAccounts },
      ...accounts().map(({ id, name }) => ({ id, label: name })),
    ],
  };
}

/** Keeps the scopes that still exist, and only snippets that hold something. */
function tidy(code: CustomCode, known: ReadonlySet<string>): CustomCode {
  const snippets = Object.entries(code.snippets).filter(
    ([scope, { css, js }]) => known.has(scope) && (css !== '' || js !== ''),
  );
  return { enabled: code.enabled, snippets: Object.fromEntries(snippets) };
}

/**
 * The Custom CSS and JavaScript window's operations (#72): read the code
 * and its scopes, save it, and preview unsaved CSS. Only whole, well-formed
 * code within its size limits gets through.
 */
export function customCodeHandlers(
  code: CustomCodeController,
  accounts: AccountList,
): ChromeHandler[] {
  const view = (): CustomCodeView => viewOf(code, accounts);
  const known = (): Set<string> => new Set(view().scopes.map((scope) => scope.id));
  return [
    { channel: CHROME_CHANNELS.customCodeGet, accepts: noArguments, handle: view },
    {
      channel: CHROME_CHANNELS.customCodeSave,
      accepts: argumentsOf(isCustomCode),
      handle: (_call, value) => {
        code.save(tidy(value as CustomCode, known()));
        return view();
      },
    },
    {
      channel: CHROME_CHANNELS.customCodePreview,
      accepts: argumentsOf(isString, (css) => css === null || isSnippetText(css)),
      handle: (_call, scope, css) => {
        if (known().has(scope as string)) {
          code.preview(scope as string, (css as string | null) ?? undefined);
        }
      },
    },
  ];
}
