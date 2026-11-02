import type { Extension } from '@yapyap/extension-sdk';

const FALLBACK = 'Hello! How are you?';

/**
 * Drafts a greeting in the open chat when the user runs its command. It only
 * fills the message box: the user reads, edits and sends the draft.
 */
export default {
  activate(host) {
    host.commands.onRun('draft-greeting', async () => {
      const { greeting } = await host.settings.get();
      await host.composer.insertDraft(typeof greeting === 'string' ? greeting : FALLBACK);
    });
  },
} satisfies Extension;
