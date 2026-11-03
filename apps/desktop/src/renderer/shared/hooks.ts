import { useEffect, useState } from 'preact/hooks';

/** What `load` gives once the page opens: undefined while it loads, null when it fails. */
export function useLoaded<T>(load: () => Promise<T>): T | null | undefined {
  const [value, setValue] = useState<T | null | undefined>(undefined);
  useEffect(() => {
    load().then(setValue, () => {
      setValue(null);
    });
  }, [load]);
  return value;
}

/** A line that says how the last action went, and what runs one. */
export function useActionStatus(
  failed: string,
): readonly [string, (action: () => Promise<void>, done: string) => void] {
  const [status, setStatus] = useState('');
  const run = (action: () => Promise<void>, done: string): void => {
    action().then(
      () => {
        setStatus(done);
      },
      () => {
        setStatus(failed);
      },
    );
  };
  return [status, run];
}
