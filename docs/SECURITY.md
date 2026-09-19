# Security

PalmTTY provides remote interactive shell access. A security failure can therefore become arbitrary code execution as the account running the Agent.

This document is part threat model, part deployment policy.

## Security posture

PalmTTY assumes a **single trusted owner** in the first releases.

The safest supported topology is:

```text
trusted phone -> private VPN/overlay -> PalmTTY Agent
```

A reverse proxy with strong authentication is supported, but direct unauthenticated Internet exposure is not.

## Assets

PalmTTY can expose access to:

- source code;
- SSH/Git credentials available to the shell;
- cloud/API credentials in the user environment;
- local files readable by the Agent user;
- developer tools;
- AI coding agents capable of changing files and running commands.

Terminal input and output are sensitive data.

## Primary threats

### 1. Unauthenticated remote shell access

Mitigations:

- loopback bind by default;
- explicit LAN/public bind configuration;
- authentication before session APIs and WebSocket upgrade;
- deployment documentation that prefers VPN/private overlay access.

### 2. Cross-Site WebSocket Hijacking

Browser cookies are sent during WebSocket handshakes. The server must therefore validate the `Origin` header against an exact allowlist.

Rules:

- no substring matching;
- no wildcard `*` in production;
- reject missing browser origins unless a specifically documented non-browser API mode is used;
- apply authentication before accepting the terminal socket.

### 3. Credential leakage

Rules:

- never put bearer tokens or passwords in URLs;
- secure cookies must be `HttpOnly`, `Secure`, and `SameSite=Strict` when practical;
- redact configuration secrets from API responses and logs;
- do not persist terminal I/O by default;
- never log authentication headers.

### 4. Privilege escalation by deployment

The PTY inherits the permission level of the Agent process.

Rules:

- do not run PalmTTY as Administrator by default;
- show current identity/elevation state in diagnostics;
- warn loudly when elevated;
- separate any future privileged helper from the normal Agent.

### 5. Arbitrary workspace traversal

MVP clients select a configured `workspaceId`; they do not send arbitrary filesystem paths for session creation.

The Agent resolves and validates workspace paths at startup.

### 6. Brute-force/session abuse

When built-in authentication is enabled:

- rate-limit failed authentication;
- rate-limit session creation;
- cap concurrent sessions;
- use cryptographically random session identifiers;
- rotate server-side login sessions on authentication;
- expire login sessions.

### 7. Host-header/reverse-proxy confusion

When trusted-proxy support is enabled, only accept forwarded client/protocol headers from explicitly configured proxy addresses.

Do not infer a secure request merely from arbitrary `X-Forwarded-Proto` supplied by an untrusted client.

### 8. Terminal escape/content attacks

Terminal output is untrusted display data.

- Render terminal data only through xterm.js.
- Never inject terminal output as raw HTML.
- Sanitize any future rich link/file-preview metadata separately.
- Opening detected links requires explicit user action.

## Authentication phases

### M1/M2 development

Localhost development may run without authentication.

LAN use requires an explicit development acknowledgement.

### M3 release target

Provide built-in single-user authentication or require a configured trusted-auth proxy mode.

The exact built-in mechanism should be selected before M3 implementation. Preferred properties:

- passkeys/WebAuthn where browser/platform support is practical;
- recovery path that does not reduce normal authentication to a weak static URL token;
- local bootstrap ceremony;
- no third-party cloud dependency.

Until M3 lands, release artifacts must state that PalmTTY is not ready for direct public-Internet exposure.

## Reverse proxy requirements

A reverse proxy must:

- terminate TLS with a trusted certificate;
- support WebSocket upgrades;
- preserve long-lived connections;
- enforce request-size limits;
- not expose the PalmTTY upstream port publicly;
- forward only the headers PalmTTY is configured to trust.

## WebSocket requirements

Every terminal WebSocket connection must check:

1. authentication;
2. origin allowlist;
3. requested session exists;
4. caller is authorized for the session;
5. protocol version is supported.

Malformed frames are rejected without executing shell input.

Input size is bounded per frame.

## Session IDs

Session IDs must be generated with a CSPRNG and must not encode:

- usernames;
- workspace paths;
- PIDs;
- timestamps precise enough to make IDs predictable.

Session IDs are identifiers, not authentication secrets.

## Local state

Runtime state directory permissions should be user-only where supported.

Any future session-worker IPC secret must:

- be generated randomly;
- be stored only in the runtime state directory;
- never be returned to the browser;
- rotate when a worker is recreated.

## Dependency policy

Native and terminal dependencies are high-impact.

- pin lockfile versions;
- use automated dependency updates;
- run CI on Windows for `node-pty` changes;
- review xterm.js and node-pty release notes before major upgrades;
- enable GitHub dependency/security alerts.

## Reporting vulnerabilities

Until a dedicated security contact/process is configured, please avoid publishing exploit details in a public issue.

Before the first public alpha, the repository should enable GitHub private vulnerability reporting and add a supported contact method here.

## Security checklist before first alpha

- [ ] Authentication decision implemented.
- [ ] Exact WebSocket Origin allowlist.
- [ ] Secure cookie/session configuration.
- [ ] Session creation rate limit.
- [ ] Concurrent session cap.
- [ ] Config/API secret redaction tests.
- [ ] No terminal I/O in default logs.
- [ ] Non-admin default documented and tested.
- [ ] Public-bind warning.
- [ ] Reverse-proxy documentation.
- [ ] Dependency review/alerts.
- [ ] Private vulnerability reporting enabled.
