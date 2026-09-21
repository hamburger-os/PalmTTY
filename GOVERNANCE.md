# Governance

PalmTTY is currently a maintainer-led open-source project.

## Current maintainer

The repository owner, [@hamburger-os](https://github.com/hamburger-os), is the current project maintainer and final decision maker for releases, security boundaries and repository governance.

## How decisions are made

Small fixes and isolated improvements can proceed through normal pull-request review. Larger changes should begin with an Issue when they affect:

- authentication or network exposure;
- terminal/session lifecycle;
- reconnect semantics;
- remote filesystem or process authority;
- protocol compatibility;
- release/support policy;
- licensing or project governance.

The project prefers evidence from tests, reproducible behavior and documented trade-offs over authority or volume of comments.

## Architecture invariants

The maintainer may reject a change even when it is technically functional if it weakens a documented invariant, especially:

- browser lifetime must not become terminal lifetime;
- workspace mutation must remain an explicit authenticated + exact-Origin persistent operation; Session creation must remain workspace-ID-only and Web clients must not gain arbitrary environment-variable injection;
- authentication and Origin checks remain separate controls;
- secrets and terminal content do not enter default logs;
- buffers and long-lived in-memory state remain bounded;
- PalmTTY does not silently elevate privileges.

See [docs/ai/invariants.md](docs/ai/invariants.md).

## Becoming a maintainer

As the community grows, maintainer access can be extended to contributors with sustained, high-quality participation across implementation, review, documentation and security. Repository write access should follow demonstrated responsibility rather than a fixed contribution count.

## Releases

Release authority currently remains with the maintainer. See [RELEASING.md](RELEASING.md).
