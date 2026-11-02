import { cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitepress';

const repository = 'https://github.com/vascoguita/yapyap';

/**
 * Files the site serves whose sources live elsewhere: the app icon. It is
 * copied into `public/` on every build and dev start instead of being
 * committed twice.
 */
const SHARED_FILES = [['../../apps/desktop/build/icon.svg', '../public/logo.svg']] as const;

const fromHere = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  title: 'YapYap',
  description: 'A fast, private desktop client for WhatsApp Web, with an AI assistant. Unofficial.',
  lang: 'en-US',
  cleanUrls: true,
  lastUpdated: true,
  srcExclude: ['progress.md'],
  // ADR folders keep README.md so they also read well on GitHub.
  rewrites: { 'adr/README.md': 'adr/index.md' },
  vite: {
    plugins: [
      {
        name: 'yapyap-shared-files',
        buildStart() {
          for (const [source, target] of SHARED_FILES) {
            cpSync(fromHere(source), fromHere(target));
          }
        },
      },
    ],
  },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
    ['meta', { property: 'og:image', content: 'https://yapyap.guita.org/social-preview.png' }],
  ],
  themeConfig: {
    logo: '/logo.svg',
    // People choosing an app come first; developers find their pages under one menu (#383).
    nav: [
      { text: 'Download', link: '/guide/install' },
      { text: 'Guide', link: '/guide/' },
      { text: 'AI assistant', link: '/guide/ai-assistant' },
      { text: 'Privacy', link: '/privacy' },
      {
        text: 'Developers',
        items: [
          { text: 'Architecture', link: '/architecture/' },
          { text: 'Decision records', link: '/adr/' },
          { text: 'Contributing', link: '/contributing' },
          { text: 'Translations', link: '/translations' },
          { text: 'Brand', link: '/brand' },
        ],
      },
      { text: 'Sponsor', link: 'https://github.com/sponsors/vascoguita' },
      {
        text: 'Help',
        items: [
          { text: 'Install', link: '/guide/install' },
          { text: 'Troubleshooting', link: '/guide/troubleshooting' },
          { text: 'Ask a question', link: `${repository}/discussions` },
          { text: 'Report a bug', link: `${repository}/issues/new/choose` },
          { text: 'Report a vulnerability', link: `${repository}/security/advisories/new` },
        ],
      },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'User guide',
          items: [
            { text: 'Get started', link: '/guide/get-started' },
            { text: 'AI assistant', link: '/guide/ai-assistant' },
            { text: 'AI agents (MCP)', link: '/guide/ai-agents' },
            { text: 'User guide', link: '/guide/' },
            { text: 'Install', link: '/guide/install' },
            { text: 'Troubleshooting', link: '/guide/troubleshooting' },
            { text: 'Reference', link: '/guide/reference' },
            { text: 'FAQ', link: '/guide/faq' },
          ],
        },
      ],
      '/architecture/': [
        {
          text: 'Architecture',
          items: [
            { text: 'Overview', link: '/architecture/' },
            { text: 'Accessibility', link: '/architecture/accessibility' },
            { text: 'Security review', link: '/architecture/security-review' },
            { text: 'Decision records', link: '/adr/' },
          ],
        },
      ],
      '/adr/': [
        {
          text: 'Decision records',
          items: [
            { text: 'Index', link: '/adr/' },
            { text: '0001 Process model', link: '/adr/0001-process-model-and-security-boundaries' },
            { text: '0002 Toolchain', link: '/adr/0002-toolchain-and-resolved-versions' },
            { text: '0003 Packaging and updates', link: '/adr/0003-packaging-and-update-channels' },
            {
              text: '0004 Extension trust model (superseded)',
              link: '/adr/0004-extension-isolation-and-trust-model',
            },
            { text: '0005 Test strategy', link: '/adr/0005-test-strategy' },
            { text: '0006 Settings', link: '/adr/0006-settings-schema-and-migrations' },
            { text: '0007 Git and merging', link: '/adr/0007-git-and-merge-strategy' },
            { text: '0008 Conflict log', link: '/adr/0008-requirement-conflicts' },
            { text: '0009 Performance budgets', link: '/adr/0009-performance-budgets' },
            {
              text: '0010 Static analysis',
              link: '/adr/0010-static-analysis-with-sonarqube-cloud',
            },
            {
              text: '0011 Notifications',
              link: '/adr/0011-whatsapp-notifications',
            },
            {
              text: '0012 Translations',
              link: '/adr/0012-translations',
            },
            {
              text: '0013 In-chat assistant',
              link: '/adr/0013-in-chat-assistant-bar',
            },
            { text: '0014 Marketplace (superseded)', link: '/adr/0014-extension-marketplace' },
            { text: '0015 Call recording (superseded)', link: '/adr/0015-call-recording' },
            { text: '0016 Extensions (superseded)', link: '/adr/0016-extensions-not-plugins' },
            { text: '0017 Assistant built in', link: '/adr/0017-assistant-is-part-of-yapyap' },
            { text: '0018 No extensions', link: '/adr/0018-no-extensions' },
            { text: '0019 MCP server for agents', link: '/adr/0019-mcp-server' },
          ],
        },
      ],
    },
    socialLinks: [{ icon: 'github', link: repository }],
    editLink: { pattern: `${repository}/edit/master/docs/:path`, text: 'Edit this page on GitHub' },
    search: { provider: 'local' },
    footer: {
      message:
        'Released under the MIT License. Development supported by <a href="https://www.ensita.org/">Ensita</a>. YapYap is unofficial and not affiliated with WhatsApp or Meta.',
      copyright: 'Copyright © Vasco Guita',
    },
  },
});
