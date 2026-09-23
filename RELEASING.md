# Releasing PalmTTY

PalmTTY uses a guarded manual GitHub Actions workflow for publication. Release metadata is prepared through an ordinary PR; the Release workflow never edits `main`, never bumps versions, and never bypasses the repository Ruleset.

## Release model

The root `package.json` is the single version source. Private workspace packages intentionally do not define duplicate versions. Source builds read the root package version; installed builds read the immutable `release-manifest.json` generated from that same version and the locked source SHA.

A release is split into two phases:

1. **Prepare and merge a release PR.**
2. **Run Actions → Release from `main`.**

The workflow locks the exact `main` SHA selected at dispatch time, re-runs code/security gates, builds platform-native installed distributions from that same SHA, smoke-tests them outside the source checkout, generates checksums/provenance, creates an annotated immutable tag and draft GitHub Release, uploads/verifies all release assets, and only then promotes the Release. A failure before final promotion rolls back the tag/release created by that run.

## Prepare the release PR

1. Start from an up-to-date `main`.
2. Set the target version in the root `package.json`.
3. Move all user-visible changes from `CHANGELOG.md` **Unreleased** into `## [X.Y.Z]`. Leave **Unreleased** empty.
4. Synchronize `docs/ai/current-state.md`, `docs/owner/roadmap.md`, README/security/release documentation as appropriate.
5. Run:
   - `pnpm install --frozen-lockfile`
   - `pnpm check`
   - `pnpm license:check`
   - `pnpm release:check -- X.Y.Z`
6. Recommended before publication: perform the real-device/deployment checks that automation cannot prove—Windows workstation, relevant mobile Safari/Chrome paths, reconnect/network switching and Codex interaction. When the release contains service/autostart changes, also validate current-user Task Scheduler/systemd paths on real hosts, including Agent-only restart preserving a live Worker and confirming that OS reboot does not falsely claim PTY persistence.
7. Merge the release PR only after the protected `main` checks pass.

Manual device/deployment checks are operator evidence, not a Release workflow checkbox. Publication authority comes from protected `main` plus machine-verifiable qualification.

## Publish from GitHub Actions

Open **Actions → Release → Run workflow**, select `main`, and enter the version.

The Release workflow then:

1. requires dispatch from `main`;
2. normalizes and validates the requested semantic version;
3. requires the requested version to equal root `package.json`;
4. requires a non-empty matching `CHANGELOG.md` section and an empty **Unreleased** section;
5. rejects an existing tag or GitHub Release for the same version;
6. locks the current remote `main` SHA;
7. re-runs frozen-lockfile Windows + Ubuntu `pnpm check`;
8. re-runs `pnpm audit --prod --audit-level high` plus the production dependency license policy;
9. re-runs CodeQL;
10. natively builds and smoke-tests a Windows x64 installed runtime, then creates:
    - `PalmTTY-Setup-X.Y.Z-win-x64.exe`
    - `PalmTTY-X.Y.Z-win-x64.zip`
    - `PalmTTY-X.Y.Z-win-x64.sbom.cdx.json`
11. natively builds and smoke-tests a Linux x64 installed runtime, then creates:
    - `palmtty_X.Y.Z_amd64.deb`
    - `PalmTTY-X.Y.Z-linux-x64.tar.gz`
    - `PalmTTY-X.Y.Z-linux-x64.sbom.cdx.json`
12. verifies that the package jobs produced exactly those six assets;
13. generates `SHA256SUMS` over the six platform assets;
14. creates GitHub build-provenance attestations for the finished assets;
15. verifies `main` still points at the locked SHA;
16. creates annotated tag `vX.Y.Z` and verifies the remote peeled tag resolves to the locked source SHA;
17. creates the draft GitHub Release through the REST API from that already-verified tag and retains the returned Release ID directly;
18. uploads all six platform assets plus `SHA256SUMS` while the Release is still draft;
19. verifies the draft contains exactly seven release assets and that every remote asset size equals the corresponding local file;
20. re-verifies the locked `main` SHA and peeled annotated tag;
21. promotes that exact Release ID;
22. re-verifies source/tag binding after promotion;
23. rolls back that exact Release ID and the tag created by this run if validation fails before finalization.

If `main` advances while release gates run, the workflow deliberately aborts. Re-run it so the published tag always corresponds to a source SHA that was the current protected `main` for the entire qualification window.

## Installed runtime contract

The release runtime is intentionally not a source checkout:

~~~text
installRoot/
  release-manifest.json
  runtime/      # bundled Node.js
  app/          # compiled Agent + production dependencies
  web/          # compiled PWA
  tools/        # installed CLI/service management
  bin/          # platform launcher / Windows GUI service host
  defaults/
~~~

The package builder uses `pnpm deploy --prod --legacy` with a hoisted deployment layout so the runtime is self-contained and archive-friendly. Workspace packages expose only `dist` through their package `files` field; the packager fails if workspace `src` trees appear in the deployed runtime.

The installed-runtime smoke copies the finished tree to an unrelated temporary directory, then uses the **bundled Node executable** to verify version resolution, Agent preflight, `/api/v1/health`, and serving of the compiled Web UI. This is the guard against accidentally shipping a package that only works beside the repository checkout.

## Windows installer behavior

The Windows installer is current-user/least-privilege. It installs program files under Local AppData, preserves per-user config/credentials/workspaces across upgrades, and initializes the current-user Task Scheduler entry with the release-packaged GUI-subsystem host. The target workstation does not need global Node.js, Corepack, pnpm, or C# compilation.

The installer intentionally does not install PalmTTY as LocalSystem. Shells, Git/SSH credentials, PATH and App Execution Aliases remain owned by the real workstation user.

The pipeline currently leaves code-signing identity as an operational input rather than committing credentials to the repository. The packaging boundary is ready for a future Authenticode signing step between installer creation and checksum/provenance generation.

## Linux package behavior

The Debian package installs immutable program files under `/usr/lib/palmtty` and exposes `/usr/bin/palmtty`. It does not create a root/system PalmTTY Agent. The intended user runs:

~~~bash
palmtty init --install-service
~~~

to create per-user config/credentials and register `systemd --user`. Portable Linux archives expose the same installed CLI from their `bin` directory.

## Version policy

Supported release forms are:

- `X.Y.Z`
- `X.Y.Z-alpha.N`
- `X.Y.Z-beta.N`
- `X.Y.Z-rc.N`

Versions containing a prerelease suffix are published as GitHub prereleases. `0.x` releases may contain breaking changes; breaking behavior must still be explicit in the changelog.

## Dependency policy

The required Security Audit gate performs both:

- known-vulnerability review with `pnpm audit --prod --audit-level high`;
- production dependency license-policy review through `pnpm license:check`.

The license check fails closed on missing/unknown licenses and on license expressions without a reviewed permissive option. A new license family requires an explicit repository review before it is allowlisted.

## Security releases

For embargoed vulnerabilities, coordinate the fix privately using GitHub Security Advisories/private vulnerability reporting. Publish exploit details only after a fixed release is available.
