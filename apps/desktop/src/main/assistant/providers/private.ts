import type { EngineTurn } from '../../../shared/api/engine-api.ts';
import { EngineFailed, type EngineHost } from '../private/engine-host.ts';
import { ProviderError, type CompletionRequest, type Provider } from './provider.ts';

/** The request as the engine reads it: the instructions first, then the conversation. */
export const turnsOf = (request: CompletionRequest): EngineTurn[] => [
  { role: 'system', content: request.instructions },
  ...request.turns.map(({ role, text }) => ({ role, content: text })),
];

/**
 * The private model on this computer (#457), through the same interface
 * as the providers on the internet. The engine loads it on first use, and
 * nothing of the request leaves this computer.
 */
export function privateProvider(engine: Pick<EngineHost, 'complete'>): Provider {
  return {
    complete: async (request, onText) => {
      try {
        return await engine.complete(turnsOf(request), onText, request.signal);
      } catch (error) {
        throw new ProviderError(error instanceof EngineFailed ? error.kind : 'failed');
      }
    },
  };
}
