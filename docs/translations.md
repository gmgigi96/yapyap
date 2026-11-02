# Translations

YapYap's own windows, menus, dialogs and notifications are translatable.
WhatsApp itself is not part of this: it chooses its own language. The design
is in [ADR 0012](/adr/0012-translations).

YapYap ships in English only for now. A language ships once a native speaker
has reviewed it, and machine-translated catalogs are not accepted.
Translations arrive as pull requests.

## Catalogs

Each language is one JSON file in
`apps/desktop/src/shared/messages/locales/`, named after its language tag:
`pt.json`, `pt-BR.json`, `ar.json`. The format is i18next JSON v4, which
translation tools such as Weblate read and write:

- Keys nest exactly as in `en.json`, the English source. Never rename or
  translate a key. No key contains a `.`, which translation tools read as
  nesting.
- Values are plain text. Markup such as `<b>` or `&amp;` is rejected, and
  YapYap always shows text as text.
- `{{name}}` is a placeholder that YapYap fills in, such as an account name.
  Keep every placeholder English has, spelled the same, wherever your
  language puts it.
- A message that counts has one key per plural form: `unread_one`,
  `unread_other`, and `_zero`, `_two`, `_few` or `_many` where your language
  uses them ([CLDR plural rules](https://www.unicode.org/cldr/charts/latest/supplemental/language_plural_rules.html)).
  `{{count}}` is the number, and a form such as `_one` may leave it out.

A catalog does not have to be complete. Any key it lacks, or whose
placeholders differ from English's, shows in English, so a partial
translation is still usable.

## Notes for translators

- `menu`: `&` marks the access key on Windows and Linux, and macOS ignores
  it. Keep one `&` per label, before a letter of your translation that no
  other item in the same menu uses.
- `notifications.titled`: with several accounts, the account a notification
  comes from heads it.
- `report.issueTitle` and `report.crashTitle` become GitHub issue titles,
  which the user can still change. `report.crashTitleWith` keeps the crash's
  `{{fingerprint}}`, so reports of one crash can be found together.
- `settings.fields` are grouped by settings section, then keyed by
  setting, and their `options` by the values the settings file stores.
  Translate only the text.

## Checks

`pnpm lint` runs `node scripts/src/bin/check-catalogs.ts`, which CI runs on
every pull request. It fails when a catalog:

- is not valid JSON;
- is not named after a language tag;
- has a key with a `.` in it (English included);
- has keys English lacks;
- has placeholders that differ from English's;
- lacks a plural form its language needs;
- contains markup.

It also fails when the generated `Messages` type no longer matches
`en.json`.

## Changing English text

UI text lives only in `en.json`. Lint rejects literal text in the UI code.
After adding or changing English text, run:

```sh
node scripts/src/bin/i18n-types.ts
```

It regenerates `messages.generated.ts`, the type that every catalog and
every call site follows. Messages with placeholders or plural forms are
functions of named values:

```ts
en.dialogs.removeAccount.message({ name: account.name });
en.tray.unread({ count: 3 });
```
