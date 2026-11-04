import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

const COVERAGE_IGNORE = /\b(?:istanbul|c8|v8)\s+ignore\b/;

// Coverage must be earned by tests; the test-strategy ADR forbids ignore directives.
/** @type {import('eslint').Rule.RuleModule} */
const noCoverageIgnore = {
  meta: { type: 'problem', messages: { forbidden: 'Coverage-ignore directives are forbidden.' } },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (comment.loc && COVERAGE_IGNORE.test(comment.value)) {
            context.report({ loc: comment.loc, messageId: 'forbidden' });
          }
        }
      },
    };
  },
};

const LETTER = /\p{L}/u;
const TEXT_ATTRIBUTES = new Set(['aria-label', 'title', 'placeholder', 'alt', 'label']);
// Options of Electron's menus, dialogs, notifications and windows that users read.
const TEXT_PROPERTIES = new Set(['label', 'title', 'message', 'detail', 'body', 'buttons']);

/**
 * The parts of a JSX node the rule reads; ESLint's own types stop short of JSX.
 * @typedef {{ type: string, value?: unknown, loc: import('eslint').AST.SourceLocation }} JsxNode
 * @typedef {JsxNode & { expression: JsxNode }} JsxContainer
 * @typedef {JsxNode & { name: { name: unknown }, value: JsxNode | JsxContainer | null }} JsxAttribute
 * @typedef {JsxNode & { elements?: (TextNode | null)[], quasis?: { value: { raw: string } }[] }} TextNode
 */

/** @param {JsxNode | null} node */
const isText = (node) =>
  node?.type === 'Literal' && typeof node.value === 'string' && LETTER.test(node.value);

/**
 * A string or template literal with letters, alone or inside an array (dialog buttons).
 * @param {TextNode} node
 * @returns {boolean}
 */
const holdsText = (node) =>
  isText(node) ||
  (node.quasis ?? []).some((quasi) => LETTER.test(quasi.value.raw)) ||
  (node.elements ?? []).some((element) => element !== null && holdsText(element));

// Chrome UI text must come from the message catalog so every language gets it (#55).
/** @type {import('eslint').Rule.RuleModule} */
const noLiteralUiText = {
  meta: {
    type: 'problem',
    messages: { literal: 'Take UI text from the message catalog (src/shared/messages/).' },
  },
  create(context) {
    /** @param {JsxNode} node */
    const report = (node) => {
      context.report({ loc: node.loc, messageId: 'literal' });
    };
    // ESLint types listener arguments as plain ESTree nodes, which exclude JSX.
    return {
      /** @param {unknown} node */
      JSXText(node) {
        const text = /** @type {JsxNode} */ (node);
        if (typeof text.value === 'string' && LETTER.test(text.value)) {
          report(text);
        }
      },
      /** @param {unknown} node */
      JSXAttribute(node) {
        const attribute = /** @type {JsxAttribute} */ (node);
        const { name, value } = attribute;
        const literal = value !== null && 'expression' in value ? value.expression : value;
        if (typeof name.name === 'string' && TEXT_ATTRIBUTES.has(name.name) && isText(literal)) {
          report(attribute);
        }
      },
      /** @param {unknown} node */
      'JSXElement > JSXExpressionContainer'(node) {
        const container = /** @type {JsxContainer} */ (node);
        if (isText(container.expression)) {
          report(container);
        }
      },
      Property(node) {
        const { key, value } = node;
        const name = key.type === 'Identifier' ? key.name : null;
        if (
          name !== null &&
          TEXT_PROPERTIES.has(name) &&
          holdsText(/** @type {TextNode} */ (value))
        ) {
          context.report({ node, messageId: 'literal' });
        }
      },
    };
  },
};

export default defineConfig(
  {
    ignores: [
      '**/node_modules/',
      '**/out/',
      '**/dist/',
      'apps/*/release/',
      '**/coverage/',
      'reports/',
      '.stryker-tmp/',
      // Agent worktrees: whole copies of this repository, linted in their own right.
      '.claude/',
      'docs/.vitepress/cache/',
      'docs/.vitepress/dist/',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: {
      yapyap: {
        rules: { 'no-coverage-ignore': noCoverageIgnore, 'no-literal-ui-text': noLiteralUiText },
      },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      'yapyap/no-coverage-ignore': 'error',
      complexity: ['error', 8],
      // Braces on every block, as SonarQube Cloud's strict profile requires (ADR 0010).
      curly: ['error', 'all'],
      'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
      'no-warning-comments': [
        'error',
        { terms: ['todo', 'fixme', 'xxx', 'hack'], location: 'start' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
    },
  },
  {
    // Entry files only wire real Electron objects into tested factories; they
    // are excluded from coverage, so they must stay branch-free (ADR 0005).
    files: [
      'apps/desktop/src/main/index.ts',
      'apps/desktop/src/preload/*/index.ts',
      'apps/desktop/src/renderer/*/main.tsx',
      'scripts/src/bin/*.ts',
    ],
    rules: { complexity: ['error', 1] },
  },
  {
    // Every renderer must start from the hardened factory (ADR 0001).
    files: ['apps/**/*.ts'],
    ignores: ['apps/desktop/src/main/window/windows.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...['callee.name', 'callee.property.name'].map((callee) => ({
          selector: `NewExpression[${callee}=/^(BaseWindow|BrowserView|BrowserWindow|WebContentsView)$/]`,
          message:
            'Create windows and views through apps/desktop/src/main/window/windows.ts (ADR 0001).',
        })),
      ],
    },
  },
  {
    files: ['apps/desktop/src/renderer/**/*.tsx', 'apps/desktop/src/main/**/*.ts'],
    ignores: ['**/*.test.tsx', '**/*.test.ts'],
    rules: { 'yapyap/no-literal-ui-text': 'error' },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/test/**/*.ts', '**/e2e/**/*.ts'],
    rules: { 'max-lines-per-function': 'off' },
  },
  {
    // The fake WhatsApp page's scripts run in a browser and are outside every tsconfig.
    files: ['apps/desktop/test/fake-whatsapp/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: {
        AudioContext: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        navigator: 'readonly',
        window: 'readonly',
      },
    },
  },
  {
    // Playwright fixtures without dependencies must destructure an empty object.
    files: ['**/e2e/**/*.ts'],
    rules: { 'no-empty-pattern': 'off' },
  },
);
