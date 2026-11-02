/** Trust zones from ADR 0001. */
export type Zone = 'whatsapp' | 'chrome';

/** What YapYap knows about a web contents it created. */
export interface ViewInfo {
  readonly zone: Zone;
  /** The origin the view belongs to and may navigate within. */
  readonly home: string;
  /** How permission prompts name the view, such as the account name. */
  readonly label: string;
  /** The account a WhatsApp view or window belongs to. */
  readonly account?: string;
}

/** Keyed by web contents, so entries disappear with the views they describe. */
export type ViewRegistry = WeakMap<object, ViewInfo>;
