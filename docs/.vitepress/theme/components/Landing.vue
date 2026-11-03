<script setup lang="ts">
import DownloadButton from './DownloadButton.vue';

/**
 * The home page (#383): for people who want more from WhatsApp on their
 * computer first, then for people who like to tinker, then for developers. Every claim
 * here must be true of the released app; planned features say so, and the
 * comparison lists only facts anyone can check.
 */
const shot = (name: string): string => `/screenshots/${name}.webp`;

interface Highlight {
  readonly title: string;
  readonly text: string;
}

const everyday: readonly Highlight[] = [
  {
    title: 'Unread counts everywhere',
    text: 'On your dock, your tray and each account in the sidebar, across every number you run.',
  },
  {
    title: 'Notifications done right',
    text: 'Headed by the account, answerable from the notification on macOS and Windows, and gone once you have read everything.',
  },
  {
    title: 'Do not disturb, your way',
    text: 'Silence everything in one click, or mute just one account and keep the rest.',
  },
  {
    title: 'Global shortcuts',
    text: 'Ctrl+1 to 9 switches accounts. One key shows or hides YapYap from anywhere.',
  },
  {
    title: 'A proxy per account',
    text: 'Route each number through its own HTTP or SOCKS proxy, with passwords kept by your system’s keychain.',
  },
  {
    title: 'Spell check in your languages',
    text: 'Write in several languages at once, and zoom WhatsApp to exactly the size you like.',
  },
  {
    title: 'Fixes itself',
    text: 'A stuck or blank WhatsApp gets a recovery screen and a repair that keeps you logged in.',
  },
  {
    title: 'Always up to date',
    text: 'Signed apt, dnf and pacman repositories, and built-in updates on Windows, macOS and the AppImage.',
  },
];

/** YapYap against the official desktop app, only on points anyone can verify. */
const comparison: readonly string[] = [
  'A desktop app for Linux, as well as Windows and macOS',
  'A built-in AI assistant with the model you choose, even one on your own computer',
  'Your own CSS and JavaScript',
  'Open source',
];

const faqs: readonly { readonly question: string; readonly answer: string }[] = [
  {
    question: 'Is YapYap made by WhatsApp?',
    answer:
      'No. YapYap is an independent, open-source app, not affiliated with WhatsApp or Meta. Inside, it runs the official WhatsApp Web, unchanged, so your chats stay end-to-end encrypted exactly as in your browser.',
  },
  {
    question: 'Is it safe for my account?',
    answer:
      'You link YapYap with the QR code, like any browser. It never automates your account: every message is sent by you, and the AI only sends on your click.',
  },
  {
    question: 'What does YapYap send about me?',
    answer:
      'Nothing. No telemetry, no analytics, no sign-up. The AI assistant sends only what you approve, to the provider you pick, or to no one at all with a model on your own computer.',
  },
  {
    question: 'How much does it cost?',
    answer:
      'Nothing, and no ads. YapYap is free and MIT-licensed. If it makes your day better, sponsor its development on GitHub.',
  },
];
</script>

<template>
  <div class="landing">
    <section class="hero">
      <p class="eyebrow">The most advanced WhatsApp client ever built</p>
      <h1>WhatsApp, supercharged.</h1>
      <p class="lead">
        AI that writes with you. Every account in one window. On Linux, Windows and macOS, free, and
        without tracking you.
      </p>
      <DownloadButton />
      <p class="downloads" data-downloads hidden></p>
      <figure class="stage">
        <div class="window">
          <div class="window-bar" aria-hidden="true"><span /><span /><span /></div>
          <img
            :src="shot('main')"
            width="1920"
            height="869"
            alt="YapYap running WhatsApp with two accounts, Personal and Work, in its sidebar, each with a photo and an unread count, beside an open chat."
          />
        </div>
        <figcaption>Names, photos and messages replaced with invented ones.</figcaption>
      </figure>
    </section>

    <ul class="proof" aria-label="At a glance">
      <li>AI built in</li>
      <li>Up to 32 accounts</li>
      <li>Linux · Windows · macOS</li>
      <li>Zero tracking</li>
      <li>Open source</li>
    </ul>

    <section class="feature">
      <div class="feature-text">
        <p class="kicker">AI assistant</p>
        <h2>An AI co-writer in every chat.</h2>
        <p>
          Get reply ideas in a click. Turn a rushed draft into something friendlier, more formal or
          shorter, or into another language. Catch up on a long group chat with a summary. Bring
          Claude, OpenAI, or a model that runs on your own machine and never leaves it.
        </p>
        <ul>
          <li>Built in: set it up once in Settings, no install</li>
          <li>Works with Claude, OpenAI, local models such as Ollama, or a private model</li>
          <li>You see exactly what is shared, and nothing is sent without your click</li>
          <li>Suggestions, summaries, rewrites and catch-ups right above the message box</li>
        </ul>
        <a class="more" href="/guide/ai-assistant">Meet the assistant</a>
      </div>
      <img
        class="feature-shot"
        :src="shot('assistant')"
        width="1280"
        height="1360"
        alt="Settings for the AI assistant: where it thinks, set to Automatic with Claude in use, and a private model ready to download."
      />
    </section>

    <section class="feature reverse">
      <div class="feature-text">
        <p class="kicker">Multiple accounts</p>
        <h2>Every number. One window.</h2>
        <p>
          Personal, work, the side business: run them all at once, each in its own sealed-off
          session, each with its photo and unread count in the sidebar. Nothing waits for you to
          switch.
        </p>
        <ul>
          <li>Jump between accounts with <kbd>Ctrl</kbd>+<kbd>1</kbd> to <kbd>9</kbd></li>
          <li>Mute one, keep the others ringing</li>
          <li>Its own name, color and proxy for each</li>
        </ul>
      </div>
      <img
        class="feature-shot"
        :src="shot('main')"
        width="1920"
        height="869"
        alt="The account sidebar with two accounts, beside WhatsApp."
      />
    </section>

    <section class="feature">
      <div class="feature-text">
        <p class="kicker">Make it yours</p>
        <h2>WhatsApp, the way you like it.</h2>
        <p>
          Restyle WhatsApp with your own CSS, add your own JavaScript, and put every action on the
          keys you want. For all accounts at once, or one account at a time.
        </p>
        <ul>
          <li>Your own CSS, previewed as you type, and your own JavaScript</li>
          <li>Every keyboard shortcut yours to change</li>
          <li>Light, dark, or whatever your system uses</li>
        </ul>
        <a class="more" href="/guide/">Read the guide</a>
      </div>
      <div class="feature-shot tiles" aria-hidden="true">
        <span>Your CSS</span><span>Your JavaScript</span><span>Your keys</span
        ><span>Your theme</span>
      </div>
    </section>

    <section class="feature reverse">
      <div class="feature-text">
        <p class="kicker">Privacy</p>
        <h2>Zero tracking. Zero compromise.</h2>
        <p>
          YapYap collects nothing about you, ever. It runs locked down, keeps your keys in your
          system’s keychain, and hides your chats from anyone looking over your shoulder.
        </p>
        <ul>
          <li>A privacy screen that blurs every chat when you step away</li>
          <li>Notifications that can hide who wrote and what</li>
          <li>Crash reports only if you turn them on, and only sent by you</li>
        </ul>
        <a class="more" href="/privacy">See exactly what stays on your computer</a>
      </div>
      <img
        class="feature-shot"
        :src="shot('privacy')"
        width="1920"
        height="869"
        alt="YapYap with its privacy screen on: every chat is blurred."
      />
    </section>

    <section class="compare">
      <h2>What the official app can’t do.</h2>
      <table>
        <thead>
          <tr>
            <th scope="col"><span class="visually-hidden">Feature</span></th>
            <th scope="col">YapYap</th>
            <th scope="col">Official desktop app</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="feature in comparison" :key="feature">
            <th scope="row">{{ feature }}</th>
            <td><span class="yes">Yes</span></td>
            <td><span class="no">No</span></td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="everyday">
      <h2>And everything else a power user expects.</h2>
      <div class="grid">
        <article v-for="item in everyday" :key="item.title">
          <h3>{{ item.title }}</h3>
          <p>{{ item.text }}</p>
        </article>
      </div>
    </section>

    <section class="faq">
      <h2>Questions</h2>
      <details v-for="item in faqs" :key="item.question">
        <summary>{{ item.question }}</summary>
        <p>{{ item.answer }}</p>
      </details>
    </section>

    <section class="closing">
      <h2>Supercharge your WhatsApp.</h2>
      <DownloadButton />
      <p class="links">
        <a href="/guide/get-started">Get started</a> ·
        <a href="https://github.com/vascoguita/yapyap">Star it on GitHub</a> ·
        <a href="https://github.com/sponsors/vascoguita">Sponsor</a>
      </p>
      <p class="disclaimer">
        YapYap is unofficial and not affiliated with, endorsed by, or sponsored by WhatsApp or Meta.
      </p>
    </section>
  </div>
</template>
