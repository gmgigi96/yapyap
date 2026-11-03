import type { ChromeApi } from '../shared/api/chrome-api.ts';
import type { EngineBridge } from '../shared/api/engine-api.ts';

declare global {
  /** Exposed by the chrome preload; the only way chrome pages reach the main process. */
  var yapyap: ChromeApi;
  /** Exposed by the engine preload, in the private model's engine page alone (ADR 0017). */
  var yapyapEngine: EngineBridge;
}
