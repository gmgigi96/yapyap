/** Resolves after `ms` milliseconds, on the global timer that tests can fake. */
export const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
