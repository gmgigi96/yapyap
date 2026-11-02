# YapYap extension template

A minimal [YapYap](https://yapyap.guita.org/) extension: it drafts a greeting
in the open chat when you run its command, and lets you choose the greeting
in its settings. Start a new extension from a copy of this folder.

```text
public/manifest.json         who made it, what it needs, what it adds
src/main.ts                  the entry module YapYap starts
vite.config.ts               builds src/main.ts into dist/main.js
.github/workflows/release.yml  builds, signs and attaches each release
```

The [extension guide](https://yapyap.guita.org/extensions/) explains each
part, and the [manifest reference](https://yapyap.guita.org/extensions/manifest)
lists every field and capability.

## Make it yours

1. Copy this folder into a new repository, or use it as a template
   repository on GitHub.
2. In `public/manifest.json`, choose an `id` in a reverse-DNS namespace you
   control (IDs under `org.guita.yapyap.` are YapYap's own), and set the
   `name`, `description` and `author`. Ask for as few capabilities and hosts
   as you can.
3. Set `name` and `description` in `package.json`.
4. Run `npm install` and commit the `package-lock.json` it writes, so CI
   installs exactly the same packages.

## Build and try it

```sh
npm run build        # writes dist/
```

Turn on **Developer Mode** in YapYap's Settings to install `dist/` unsigned
while you work on it, and turn it off when you are done.

## Sign it

YapYap installs signed extensions only. Make your Ed25519 key once, keep it
private and backed up, and never commit it: YapYap pins it to your
extension's ID on first install and refuses updates signed by any other
key.

```sh
openssl genpkey -algorithm ed25519 -out signing-key.pem
npm run sign         # signs dist/ with signing-key.pem
npx yapyap-extension-sign pack dist org.example.greeter.yapyap-extension
```

To let CI sign your releases, store the key as a repository secret named
`EXTENSION_SIGNING_KEY` (Settings → Secrets and variables → Actions). The
release workflow then runs for every tag `vX.Y.Z` that matches the
manifest's `version`: it builds, signs and packs the extension, and attaches
`<id>.yapyap-extension` to that tag's GitHub release, always under the same
file name. It fails, without publishing anything, if the secret is missing.

## Release it

1. Raise `version` in `public/manifest.json` (and in `package.json`).
2. Commit, tag `vX.Y.Z` with the same version, and push the tag.
3. The workflow attaches the signed archive to the release. Users who
   installed the extension get the update; one that asks for new
   capabilities or hosts waits until each user approves it.

Because the archive keeps its name, the address
`https://github.com/<owner>/<repo>/releases/latest/download/<id>.yapyap-extension`
always serves your newest release.

## List it in the marketplace

Before you submit, check that:

- the extension is signed with your own key, and its `id` is yours;
- it asks only for the capabilities and hosts it uses, and its description
  says which hosts it talks to and why;
- it never sends chat text anywhere the user would not expect;
- its source is public, and each release is built from a tag.

Then follow [the marketplace guide](https://yapyap.guita.org/extensions/marketplace),
which says what to send and how YapYap lists it.
