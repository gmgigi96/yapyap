/** Environment variables, such as `process.env`. */
export type Environment = Readonly<Record<string, string | undefined>>;

/** Whether `name` has a value; an empty one counts as unset, as launchers often leave them. */
export function isSet(env: Environment, name: string): boolean {
  return (env[name] ?? '') !== '';
}
