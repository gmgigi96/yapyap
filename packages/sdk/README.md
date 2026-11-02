# @yapyap/extension-sdk

Types and the manifest schema for [YapYap](https://yapyap.guita.org/)
extensions (ADR 0004).

```sh
npm install --save-dev @yapyap/extension-sdk
```

- `ManifestSchema` and `Manifest`: the `manifest.json` format, as a TypeBox
  schema. `schema/manifest.schema.json` is generated from it with
  `pnpm --filter @yapyap/extension-sdk schema`, and the docs site serves the same
  file at https://yapyap.guita.org/schema/manifest.schema.json.
- `CAPABILITIES`: what an extension can ask for.
- `defineExtension` and `ExtensionHost`: the typed host API an extension receives.

An extension needs only the types at build time, so nothing from the SDK
ends up in its bundle. The SDK's version tells you which host API you build
against: each release's notes name the YapYap release that brought its API.

Start from the [extension template](https://github.com/vascoguita/yapyap/tree/master/templates/extension),
and see the [extension guide](https://yapyap.guita.org/extensions/) and the
[manifest reference](https://yapyap.guita.org/extensions/manifest).
