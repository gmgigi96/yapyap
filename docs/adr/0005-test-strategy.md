# 0005. Test strategy

- Status: Accepted
- Date: 2026-10-18

## Context

YapYap wraps a service we must never automate with a real account, runs on
three operating systems and several package formats, and hosts untrusted
code. Tests must be fast enough to run on every PR, strong enough that
coverage numbers mean something, and must never touch real WhatsApp.

## Decision

### Layers

| Layer         | Tool                      | Scope                                                                                                                                            |
| ------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit          | Vitest (node / happy-dom) | All pure logic: settings decoding, URL policy, UA builder, capability checker, signature verification, redaction, update policy, adapter parsing |
| Integration   | Vitest                    | IPC handlers with a fake Electron surface, extension host RPC pipeline, protocol handlers, extension installer                                   |
| Property      | Vitest + fast-check       | Parsers and validators of untrusted input (origin overrides, license expressions, versions, later IPC payloads and extension manifests)          |
| E2E           | Playwright `_electron`    | App chrome, multi-account, tray, settings, recovery actions, extensions, the malicious-extension suite, and accessibility (axe)                  |
| Visual        | Playwright screenshots    | App chrome in light and dark themes, per OS baseline                                                                                             |
| Mutation      | Stryker (command runner)  | WhatsApp adapter, extension host, capability checker, signature verification, settings, AI providers. Score ≥ 90%, enforced.                     |
| Package smoke | CI per artifact           | Install, launch, window opens, fake WhatsApp loads                                                                                               |
| Benchmarks    | Nightly                   | Cold start and idle memory per account against budgets                                                                                           |

### Fake WhatsApp

`apps/desktop/test/fake-whatsapp/` is a local static site that reproduces the
DOM landmarks the adapter relies on. It is built from **anonymized
HTML fixtures**: names, numbers, avatars and message text are replaced by
synthetic values, and a fixture linter (`src/adapter/fixtures.test.ts`)
rejects anything that looks like a phone number or a remote profile image.
The only phone numbers allowed are in Ofcom's range reserved for fiction,
+44 7700 900000 to 900999, which no one can own. It also has scripted states
(logged-out QR, chat list, unread, "update your browser", offline). The real
WhatsApp origin is never loaded in tests.

The WhatsApp origin can be overridden only with
`YAPYAP_TEST_WHATSAPP_ORIGIN`, and only to a loopback `http://127.0.0.1:<port>`
or `http://localhost:<port>` origin. Any other value is ignored and logged.
This lets packaged builds be smoke-tested without opening an
attacker-controlled redirect.

### Coverage

- 100% lines, branches, functions and statements on all code we own, using
  V8 coverage merged across unit and integration runs. CI fails below 100%.
- `istanbul ignore`, `c8 ignore` and `v8 ignore` comments are forbidden by an
  ESLint rule and a CI grep.
- Files excluded from coverage are listed in `vitest.config.ts` and justified
  here, and nowhere else:

  | Excluded                                                               | Why                                                                                                                                |
  | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
  | `apps/desktop/src/main/index.ts`                                       | Process entry: wires real Electron modules into tested factories. Only runnable inside Electron, and exercised by every E2E test.  |
  | `apps/desktop/src/preload/*/index.ts`                                  | `contextBridge.exposeInMainWorld` calls. Each only binds an already unit-tested API object, and exercised by E2E.                  |
  | `scripts/src/bin/*.ts`                                                 | Command entry points that only read `process.env` and pass real `fetch` and `fs` into tested modules; branch-free by lint rule.    |
  | `packages/*/src/bin/*.ts`                                              | The same for package CLIs such as `yapyap-extension-sign`: they pass `process.argv` and real `fs` and streams into tested modules. |
  | `**/*.d.ts`, generated `*.schema.json`                                 | No executable code                                                                                                                 |
  | `**/*.test.ts`, `**/*.test.tsx`, `test/**`, `e2e/**`, `**/*.config.ts` | Test and build infrastructure                                                                                                      |

The rule for entry files: they may only import factories and call them with
real dependencies. They contain no branches. A lint rule (`complexity: 1`
for these paths) enforces it.

### Malicious-extension suite

`extensions/test-malicious/` (never shipped, signed with a test key generated
in-memory per test run) attempts each attack below. Each test asserts the
specific failure:

1. DOM access: there is no `document` of WhatsApp. The extension can only see its
   own blank page, and adapter RPCs return data only.
2. Undeclared network: `fetch`, `XMLHttpRequest`, `WebSocket`, `<img>`,
   `EventSource` and `sendBeacon` to an undeclared host are all blocked at the
   session level.
3. Other extensions' secrets and storage: `secrets.get` with a foreign namespace
   is rejected, and partitions are distinct.
4. Sending messages: no such RPC method exists, so an `unknown method` error is
   asserted. Draft insertion leaves the composer unsent.
5. Spoofing UI: contributions with HTML or overlong labels are rejected by the
   schema. Panels have no z-order over WhatsApp.
6. Resource limits: a busy loop and memory balloon lead to termination, then
   disablement.
7. Additional cases: eval or inline script blocked by CSP, path traversal on
   `extension://`, RPC flood rate-limited, oversized messages rejected, tampered
   archive rejected, key-change update rejected.

### Platforms

Unit, integration and E2E run on `ubuntu-latest`, `windows-latest` and
`macos-latest`. Linux E2E runs under `xvfb-run`, which developers also use
locally when available. Visual baselines are per-OS.

### Mutation testing

Stryker uses its `command` runner. Each mutant runs `vitest run --config vitest.mutation.config.ts`, a flat single-project config, and the mutant is switched on through the environment. The Vitest runner extension does not activate mutants under Vitest 5 (ADR 0008, C12). The scope lives in `scripts/src/mutation/scope.ts`, which both Stryker and the PR target selection use. On PRs, Stryker mutates only changed files within the mutation scope
(`--mutate` from the diff), dealt out to 16 shards so that a change touching
most modules, such as a rename, stays within a runner's time limit; a shard
with nothing to mutate stops before installing. Nightly runs the full scope
in 16 shards (`git ls-files | mutation-targets.ts --shard i/16` deals the sorted
modules out in turn), each mutating its modules and running only their
related tests, as PRs do;
one run over everything with the whole suite per mutant took more than a
runner's two hours. The threshold is `break: 90`, for each shard.

Stryker already runs one suite per CPU, so the mutation config gives each suite
a single Vitest worker, and its setup file stops fast-check at the first failure
without shrinking. Without either, killed mutants are reported as timeouts.

### Property-based tests

Code that parses untrusted or external input also gets property-based tests in
`*.property.test.ts` files, using fast-check. A property states an invariant
(for example, "the resolved origin is WhatsApp or loopback HTTP") or compares
the code with a simple reference model, and fast-check searches for
counterexamples. They run with the unit tests, and they also count as fuzzing
for the OpenSSF Scorecard.

## Consequences

- Electron-only code must be thin wrappers around injectable, tested logic.
  This shapes the architecture toward dependency injection.
- The fake WhatsApp needs maintenance whenever the adapter's selectors change.
  That is intentional: it is the adapter's executable specification.
