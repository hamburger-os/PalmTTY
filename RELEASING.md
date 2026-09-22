# Releasing PalmTTY

PalmTTY uses a guarded manual GitHub Actions workflow for publication. Release metadata is prepared through an ordinary PR; the Release workflow never edits `main`, never bumps versions, and never bypasses the repository Ruleset.

## Release model

The root `package.json` is the single version source. Private workspace packages intentionally do not define their own version. The Agent reads the root version at runtime for `/api/v1/health`.

A release is split into two phases:

1. **Prepare and merge a release PR.**
2. **Run Actions → Release from `main`.**

The workflow locks the exact `main` SHA selected at dispatch time, re-runs the release gates against that SHA, verifies that `main` did not advance while the gates ran, creates an annotated immutable tag, creates the GitHub Release as a draft, verifies it, then promotes it. A failure before final promotion rolls back the tag/release created by that run.

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
6. Complete the release-specific real-device/deployment acceptance that automation cannot prove: Windows workstation, relevant mobile Safari/Chrome paths, reconnect/network switching and Codex interaction for the intended release.
7. Merge the release PR only after the protected `main` checks pass.

## Publish from GitHub Actions

Open **Actions → Release → Run workflow**, select `main`, enter the version, and explicitly confirm the real-device/deployment acceptance checkbox.

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
10. verifies `main` still points at the locked SHA;
11. creates annotated tag `vX.Y.Z`;
12. creates a draft GitHub Release using the matching changelog section;
13. verifies tag/source/version/release metadata and promotes the draft;
14. rolls back the tag/release created by this run if validation fails before finalization.

If `main` advances while release gates run, the workflow deliberately aborts. Re-run it so the published tag always corresponds to a source SHA that was the current protected `main` for the entire qualification window.

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
