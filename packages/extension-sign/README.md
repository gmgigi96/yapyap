# @yapyap/extension-sign

Ed25519 signing and verification for [YapYap](https://yapyap.guita.org/)
extensions (ADR 0004).

```sh
npm install --save-dev @yapyap/extension-sign
npx yapyap-extension-sign sign --key <private-key.pem> <extension-folder>
npx yapyap-extension-sign verify <extension-folder>
npx yapyap-extension-sign pack <extension-folder> <file.yapyap-extension>
```

In this repository, run the same CLI from source:
`node packages/extension-sign/src/bin/yapyap-extension-sign.ts`.

- `sign` reads a PKCS#8 PEM Ed25519 private key and writes a `signature` into
  the folder's `manifest.json`: the public key (base64 SPKI DER), the
  algorithm and the signature over the canonical JSON of the manifest
  (without its signature) and the SHA-256 of every other file, sorted by
  path. It prints the key's fingerprint, never the key.
- `verify` checks that signature against the folder's current files and
  exits with 0 when it holds, 1 when it does not, and 2 on a usage error.
- `pack` writes the `.yapyap-extension` archive users install, and refuses a
  folder whose signature no longer verifies.
- Folders with symbolic links are refused.

The modules under `src/` are also what YapYap uses to verify extensions at
install time.
