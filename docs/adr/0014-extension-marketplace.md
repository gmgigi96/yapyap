# 0014. The extension marketplace

- Status: Superseded by [0018](0018-no-extensions.md)
- Date: 2026-10-27

## Context

Extensions install today from a `.yapyap-extension` file the user picks, or from
a URL with a pinned hash (ADR 0004). The maintainer wants a marketplace
(#386): official extensions and reviewed third-party extensions, listed and
installed inside YapYap, and installable from the website with one click
on **Install in YapYap**.

A marketplace is a new way for code to reach the user's machine, so it must
not weaken ADR 0004. A compromised web host, a hostile website, a stale
copy of the list or a swapped download must not install anything the user
did not choose, or anything the maintainer did not vouch for. Opening it
must not tell anyone more about the user than an ordinary download does.

## Decision

### The index

1. **One signed index.** The marketplace is `index.json` at
   `https://packages.guita.org/extensions/index.json`, with an Ed25519
   signature over its exact bytes in `index.json.sig`. It is signed with
   the extension signing key, and YapYap verifies it against the first-party
   trust anchors compiled into the app (ADR 0004). An index that fails
   verification, fails the schema, or is larger than 2 MiB is refused as a
   whole; YapYap never shows part of one.
2. **What it holds.** A `serial` (a number that only grows), a `generated`
   and an `expires` time, the extensions, and the revocations. Each extension has
   its ID, name, summary, author, homepage, SPDX license, `review`
   (`official` or `reviewed`), the fingerprint of the key that signs it,
   and its versions. Each version has its version, the archive's URL,
   size and SHA-256, the capabilities and network hosts its manifest asks
   for, the oldest YapYap version that runs it, and when it was published.
   Every string has a length limit and the list has at most 1,000 extensions.
   Screenshots stay on the website, so the app never loads remote images.
3. **No old copies.** YapYap keeps the highest `serial` it has accepted and
   refuses a lower one, so nobody can serve an older index that still lists
   a pulled version. It refuses an index past `expires`, which is at most
   30 days after `generated`; a scheduled workflow re-signs the index every
   week, so a frozen copy stops working within a month. A refused or
   unreachable index shows a clear message, and installed extensions keep
   running.
4. **Archives live with YapYap.** Every archive URL is under
   `https://packages.guita.org/extensions/`, which redirects to a release asset
   of the YapYap repository, as the package repositories do (ADR 0003).
   Third-party archives are copied there once reviewed. Downloads never go
   to a third party's server, and a swapped file fails its SHA-256 before
   it is unpacked. The usual archive checks and signature verification
   (ADR 0004) still run after that.

### Trust

5. **The index signature is the review.** Listing a version means the
   maintainer reviewed exactly that archive, identified by its SHA-256.
   `official` extensions are YapYap's own (`org.guita.yapyap.*`, signed by a
   trust anchor). `reviewed` extensions are third-party: their archive must be
   signed by the key whose fingerprint the index lists, which is then pinned
   to the extension ID as with any third-party install.
6. **The consent screen still decides.** A marketplace install shows the
   same consent window as a file: the author, the fingerprint, every
   capability and host. A reviewed extension is marked **Reviewed by
   YapYap**, and its window says that a review looks for harmful or
   undeclared behavior and is not a guarantee. It does not need the
   acknowledgement that unreviewed third-party extensions need (ADR 0004),
   because the maintainer has looked at it. Anything installed from a file
   or URL keeps that acknowledgement, even if the same extension is listed.
7. **Updates.** When the user opens the marketplace, or YapYap checks for
   its own updates and the user allows extension updates, YapYap compares the
   installed marketplace extensions with the index. A newer version that runs
   on this YapYap is offered, never installed silently. An update that adds
   capabilities or hosts is staged until the user approves it, as today. A
   new signing key for a reviewed extension needs a new review, and the
   consent window says the key changed.
8. **Pulling an extension.** A revocation names an extension ID, all or some of its
   versions, the signer's fingerprint and a reason. When YapYap reads it,
   it stops matching installed copies, whatever their source, and shows
   the reason in the Extensions window. The copies stay installed, with their
   data, until the user removes them, so a mistaken revocation loses
   nothing. An extension only counts as matching if its signer's fingerprint
   matches, so nobody can revoke someone else's extension by reusing its ID.

### Privacy

9. **Only when asked.** YapYap downloads the index only when the user opens
   the Marketplace tab, follows an install link, or YapYap checks for
   extension updates. It is a plain `GET` from the main process on an
   in-memory session, with no cookies, no identifiers, nothing about the
   installed extensions, and nothing counted per user. The host sees the
   user's IP address, as with any download; YapYap logs nothing per user.

### Installing from the website

10. **`yapyap://extensions/install/<id>`.** YapYap registers the `yapyap:`
    scheme. It accepts exactly this form, where the ID matches the
    manifest's ID pattern; anything else is refused and logged without its
    content. The link carries no URL, file or version: YapYap looks the ID
    up in the signed index and opens the Marketplace tab on that extension,
    with its **Install** button. Nothing installs without the user's click,
    a burst of links opens at most one prompt, and a link for an unlisted ID
    says so.

### Submissions

11. **Through pull requests.** A third-party author opens a pull request
    that adds or updates `marketplace/extensions/<id>.json` with the archive's
    release URL, its SHA-256 and the author's key fingerprint. CI checks the
    entry, downloads the archive, verifies the hash, signature, manifest and
    archive limits, and fails the pull request on any error. The
    maintainer reviews the archive's own contents, which must not be
    minified or obfuscated, against a published checklist (#391). Merging
    copies the archive to YapYap's releases and publishes a new signed
    index.

## Consequences

- ADR 0004 gains a second way in: a signed index vouching for an archive's
  SHA-256 and signer. The consent window, archive checks, signatures, key
  pinning and staged updates all still apply.
- ADR 0001 gains one outbound request from the main process, to
  `packages.guita.org`, made only on the user's action, and one URL scheme,
  validated like the `whatsapp:` links.
- The extension signing key now also signs the index, so its compromise would
  let an attacker list any archive. Rotation stays as in ADR 0004, and the
  scheduled re-signing workflow uses the same secret, in a job that
  publishes only the index.
- The weekly re-signing is required: if it stops for a month, the
  marketplace refuses the index until it runs again.
- Follow-up work: building and publishing the index (#387), the Marketplace
  tab (#388), install links (#389), the website pages (#390) and the
  submission and review process (#391).

## Amendments

- 2026-10-31 (#474, the maintainer's decision): first-party extensions stay
  in the YapYap repository, but are released on their own, with their own
  versions, changelogs and `<name>-vX.Y.Z` tags, instead of with each app
  release. A released extension is built and signed alone, attached to its
  own release, and listed by a PR the release workflow opens. The
  maintainer's merge of that PR is the review that the index signature
  records. Each version's `minYapYap` comes from `yapyap.minVersion` in the
  extension's `package.json`. Third-party extensions keep their own
  repositories.
- 2026-11-01 (ADR 0017): the AI assistant is no longer an extension, so
  the marketplace no longer lists it and it has no release-please
  component of its own. It ships with YapYap. The call recorder is the
  first-party extension that still releases on its own.
