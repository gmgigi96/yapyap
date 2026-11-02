<script setup lang="ts">
import { onMounted, ref } from 'vue';

/**
 * The visitor's system, from what the browser says about itself. Nothing is
 * sent anywhere: the guess only picks which installer the button offers.
 */
type System = 'windows' | 'mac' | 'linux' | 'other';

interface Latest {
  readonly version?: string;
  readonly files?: Readonly<Record<string, string>>;
}

const INSTALL = '/guide/install';

const system = ref<System>('other');
const href = ref(INSTALL);
const label = ref('Download YapYap');
const detail = ref('Free for Linux, Windows and macOS');

function detect(agent: string): System {
  if (/Android|iPhone|iPad/.test(agent)) {
    return 'other';
  }
  if (/Windows/.test(agent)) {
    return 'windows';
  }
  if (/Macintosh|Mac OS X/.test(agent)) {
    return 'mac';
  }
  return /Linux|X11|CrOS/.test(agent) ? 'linux' : 'other';
}

/** The site's own copy of the latest release's links (scripts/src/release/downloads.ts). */
async function latest(): Promise<Latest> {
  const response = await fetch('/latest.json').catch(() => undefined);
  return response?.ok === true ? ((await response.json()) as Latest) : {};
}

onMounted(async () => {
  system.value = detect(navigator.userAgent);
  const { version, files = {} } = await latest();
  const suffix = version === undefined ? '' : ` · v${version}`;
  if (system.value === 'windows' && files['windows'] !== undefined) {
    href.value = files['windows'];
    label.value = 'Download for Windows';
    detail.value = `Installer for Windows 10 and 11${suffix}`;
  } else if (system.value === 'mac' && files['mac'] !== undefined) {
    href.value = files['mac'];
    label.value = 'Download for macOS';
    detail.value = `For Apple silicon and Intel Macs${suffix}`;
  } else if (system.value === 'linux') {
    href.value = `${INSTALL}#linux-repositories`;
    label.value = 'Get YapYap for Linux';
    detail.value = `apt, dnf, pacman, Flatpak or AppImage${suffix}`;
  } else if (system.value === 'other') {
    label.value = 'Get YapYap for your computer';
    detail.value = 'YapYap runs on Linux, Windows and macOS';
  }
});
</script>

<template>
  <div class="download">
    <a class="download-button" :href="href">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14" />
      </svg>
      {{ label }}
    </a>
    <p class="download-detail">{{ detail }} · <a :href="INSTALL">Other systems and formats</a></p>
  </div>
</template>

<!-- The button also sits on the install page, outside the home page's styles. -->
<style scoped>
.download {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  margin: 16px 0;
}

:global(.landing .download) {
  align-items: center;
  margin: 0;
}

.download-button {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 14px 28px;
  border-radius: 999px;
  background: linear-gradient(120deg, #6e5bf2 15%, #ff7a59);
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  text-decoration: none;
  box-shadow: 0 10px 30px rgb(110 91 242 / 35%);
  transition: transform 0.15s ease;
}

.download-button:hover {
  transform: translateY(-1px);
}

.download-button svg {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentcolor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.download-detail {
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 14px;
}

@media (prefers-reduced-motion: reduce) {
  .download-button {
    transition: none;
  }
}
</style>
