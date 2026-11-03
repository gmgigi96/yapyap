import { Type } from 'typebox';
import { Value } from 'typebox/value';
import {
  ALL_ACCOUNTS,
  MAX_SNIPPET,
  NO_CUSTOM_CODE,
  type CustomCode,
} from '../../shared/custom-code.ts';
import { readIfPresent, type TextFile } from '../atomic-write.ts';

/**
 * A world of its own: user scripts share the page's DOM but neither the
 * page's JavaScript nor the adapter's world (ADR 0001).
 */
export const CUSTOM_CODE_WORLD_ID = 1001;

/** All accounts, and at most the 32 accounts YapYap keeps. */
const MAX_SCOPES = 33;

const SnippetSchema = Type.Object(
  {
    css: Type.String({ maxLength: MAX_SNIPPET }),
    js: Type.String({ maxLength: MAX_SNIPPET }),
  },
  { additionalProperties: false },
);

const CustomCodeSchema = Type.Object(
  {
    enabled: Type.Boolean(),
    // TypeBox ignores a Record key schema's limits; `propertyNames` enforces them.
    snippets: Type.Record(Type.String(), SnippetSchema, {
      maxProperties: MAX_SCOPES,
      propertyNames: { maxLength: 64 },
    }),
  },
  { additionalProperties: false },
);

export const isCustomCode = (value: unknown): value is CustomCode =>
  Value.Check(CustomCodeSchema, value);

/** A file that is missing or not understood turns custom code off, rather than running part of it. */
export function parseCustomCode(text: string | undefined): CustomCode {
  try {
    const value: unknown = JSON.parse(text ?? '');
    return isCustomCode(value) ? value : NO_CUSTOM_CODE;
  } catch {
    return NO_CUSTOM_CODE;
  }
}

export interface CodePage {
  insertCSS(css: string): Promise<string>;
  removeInsertedCSS(key: string): Promise<void>;
  executeJavaScriptInIsolatedWorld(
    worldId: number,
    scripts: { readonly code: string }[],
  ): Promise<unknown>;
  on(event: 'dom-ready', listener: () => void): unknown;
  isDestroyed(): boolean;
}

interface PageEntry {
  readonly account: string;
  /** The stylesheets now in the page, so a change can take them out. */
  keys: string[];
  /** Changes apply one after another, so none removes another's stylesheet. */
  queue: Promise<void>;
}

interface CodeState {
  code: CustomCode;
  /** Unsaved CSS by scope; an empty one hides the saved CSS while the user edits. */
  readonly previews: Map<string, string>;
  readonly pages: Map<CodePage, PageEntry>;
  readonly warn: (message: string) => void;
}

const EMPTY_SNIPPET = { css: '', js: '' };
const scopesOf = (account: string): string[] => [ALL_ACCOUNTS, account];
const snippetOf = (state: CodeState, scope: string) => state.code.snippets[scope] ?? EMPTY_SNIPPET;
const present = (text: string): boolean => text !== '';

/** Unsaved CSS shows even before custom code is saved as on, so the user sees what they type. */
function cssOf(state: CodeState, account: string): string[] {
  const saved = (scope: string): string => (state.code.enabled ? snippetOf(state, scope).css : '');
  return scopesOf(account)
    .map((scope) => state.previews.get(scope) ?? saved(scope))
    .filter(present);
}

function jsOf(state: CodeState, account: string): string[] {
  if (!state.code.enabled) {
    return [];
  }
  return scopesOf(account)
    .map((scope) => snippetOf(state, scope).js)
    .filter(present);
}

function restyle(state: CodeState, page: CodePage, entry: PageEntry): void {
  entry.queue = entry.queue
    .then(async () => {
      const old = entry.keys;
      entry.keys = [];
      await Promise.all(old.map((key) => page.removeInsertedCSS(key).catch(() => undefined)));
      entry.keys = await Promise.all(cssOf(state, entry.account).map((css) => page.insertCSS(css)));
    })
    .catch(() => {
      // A page that went away mid-change has no stylesheets left to track.
      entry.keys = [];
    });
}

/**
 * Each script runs in a function of its own and in a call of its own, so
 * its variables, a syntax error or a throw stay with it.
 */
function run(state: CodeState, page: CodePage, entry: PageEntry): void {
  for (const js of jsOf(state, entry.account)) {
    // The script is the user's own and may hold anything, so only the failure is logged.
    page
      .executeJavaScriptInIsolatedWorld(CUSTOM_CODE_WORLD_ID, [{ code: `(() => {\n${js}\n})();` }])
      .catch(() => {
        state.warn('A custom script failed in WhatsApp.');
      });
  }
}

/** Restyles every page, or only those a scope's CSS applies to; forgets pages that are gone. */
function restyleAll(state: CodeState, scope?: string): void {
  for (const [page, entry] of state.pages) {
    if (page.isDestroyed()) {
      state.pages.delete(page);
    } else if (scope === undefined || scope === ALL_ACCOUNTS || scope === entry.account) {
      restyle(state, page, entry);
    }
  }
}

export interface CustomCodeController {
  /** Applies the code to an account's page on every load. */
  readonly attach: (page: CodePage, account: string) => void;
  readonly current: () => CustomCode;
  /** Saves the code; stylesheets change at once, scripts run at the next load. */
  readonly save: (code: CustomCode) => void;
  /** Shows unsaved CSS for one scope in its pages, or drops it with `undefined`. */
  readonly preview: (scope: string, css: string | undefined) => void;
}

/** Keeps the user's stylesheets in their pages and runs their scripts on every load (#72). */
export function createCustomCode(
  file: TextFile,
  warn: (message: string) => void,
): CustomCodeController {
  const state: CodeState = {
    code: parseCustomCode(readIfPresent(file)),
    previews: new Map(),
    pages: new Map(),
    warn,
  };
  return {
    attach: (page, account) => {
      const entry: PageEntry = { account, keys: [], queue: Promise.resolve() };
      state.pages.set(page, entry);
      page.on('dom-ready', () => {
        // A new document starts without the stylesheets the last one had.
        entry.keys = [];
        restyle(state, page, entry);
        run(state, page, entry);
      });
    },
    current: () => state.code,
    save: (code) => {
      state.code = code;
      state.previews.clear();
      file.write(JSON.stringify(code));
      restyleAll(state);
    },
    preview: (scope, css) => {
      if (css === undefined) {
        state.previews.delete(scope);
      } else {
        state.previews.set(scope, css);
      }
      restyleAll(state, scope);
    },
  };
}
