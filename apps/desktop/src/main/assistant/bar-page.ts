import {
  assistantBarRender,
  type BarContent,
  type BarPlacement,
} from '../../adapter/assistant-bar.ts';
import { runInAdapterWorld, type AdapterPage } from '../../adapter/world.ts';
import type { AssistantBarState } from '../../shared/api/assistant-bar-api.ts';
import { en } from '../../shared/messages/en.ts';

/** Where the bar shows and sends its state, once the main window has accounts. */
export interface AssistantBarView {
  readonly show: (visible: boolean) => void;
  readonly publish: (state: AssistantBarState) => void;
  /** Puts the bar in the active page now; false when it has no place there, as with no chat open. */
  readonly onPage: () => Promise<boolean>;
}

/**
 * How often the bar is put back while it shows. WhatsApp drops it whenever
 * it redraws a chat, and the adapter adds no observers to its page, so a
 * cheap render that changes nothing when nothing changed stands in for one.
 */
const RENDER_EVERY_MS = 1000;

export interface InPageBarPort {
  /** The WhatsApp page of the account on screen. */
  readonly activePage: () => AdapterPage;
  /** Whether the main window is visible and focused, the only time the bar needs putting back. */
  readonly onScreen: () => boolean;
  /** WhatsApp drew the active page's chat again, which it does for another chat. */
  readonly redrawn: () => void;
}

/** The bar's labels in the user's words, and the state as plain JSON. */
function contentOf(state: AssistantBarState, visible: boolean): BarContent {
  const text = en.assistant.bar;
  return {
    visible,
    labels: {
      label: text.label,
      name: text.name,
      suggest: text.suggest,
      summarize: text.summarize,
      rewrite: text.rewrite,
      rewriteLabel: text.rewriteLabel,
      catchUp: text.catchUp,
      catchUpLabel: text.catchUpLabel,
      settings: text.settings,
      model: text.model,
      use: text.use,
      sendLabel: text.sendLabel,
      write: text.write,
      writePlaceholder: text.writePlaceholder,
    },
    status: state.status,
    working: state.working,
    suggestions: state.suggestions,
    result: state.result,
    buttons: state.buttons,
    choice:
      state.choice === undefined
        ? null
        : { current: state.choice.current, options: state.choice.options },
    rewrites: state.rewrites,
  };
}

/** A page that went away, or one between loads, simply has no bar until the next render. */
async function renderIn(page: AdapterPage, content: BarContent): Promise<BarPlacement> {
  try {
    const where = await runInAdapterWorld(page, assistantBarRender(content));
    return where === 'kept' || where === 'placed' ? where : 'away';
  } catch {
    // Nothing to do: the next render tries again, and the page's text is never logged.
    return 'away';
  }
}

/**
 * The assistant bar inside the active account's WhatsApp page, right above
 * the message box (ADR 0013). It renders the bar's current state there
 * whenever it changes or the account on screen does, takes it out of the
 * page of an account no longer on screen, and puts it back about once a
 * second while it shows and the window is on screen.
 */
export function inPageAssistantBar(
  state: () => AssistantBarState,
  port: InPageBarPort,
): AssistantBarView {
  let visible = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let last: AdapterPage | undefined;
  const render = (): void => {
    const page = port.activePage();
    if (last !== undefined && last !== page) {
      void renderIn(last, contentOf(state(), false));
    }
    last = page;
    void renderIn(page, contentOf(state(), visible)).then((where) => {
      if (where === 'placed') {
        port.redrawn();
      }
    });
  };
  const tick = (): void => {
    if (port.onScreen()) {
      render();
    }
  };
  return {
    show: (shown) => {
      visible = shown;
      clearInterval(timer);
      timer = shown ? setInterval(tick, RENDER_EVERY_MS) : undefined;
      render();
    },
    publish: render,
    onPage: async () => (await renderIn(port.activePage(), contentOf(state(), visible))) !== 'away',
  };
}
