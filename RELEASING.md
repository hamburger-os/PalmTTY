# Releasing PalmTTY

PalmTTY does not yet have a tagged release. This checklist defines the release path so the first release is reproducible and reviewable.

## Release checklist

1. Create a release PR from an up-to-date `main`.
2. Update versions consistently across root/workspace packages.
3. Move relevant `CHANGELOG.md` entries from **Unreleased** into a dated version section.
4. Update `docs/ai/current-state.md` and `docs/owner/roadmap.md` with only behavior that is actually verified.
5. Run `pnpm install --frozen-lockfile` and `pnpm check`.
6. Confirm the Windows CI job passes the real PowerShell 7 / ConPTY Unicode smoke test.
7. Perform the real-device acceptance appropriate to the release: Windows workstation, mobile Safari/Chrome, reconnect/network switching and Codex interaction.
8. Review production dependency licenses and known vulnerabilities.
9. Merge the release PR through the protected `main` branch.
10. Create an annotated tag `vX.Y.Z` on the release commit.
11. Create a GitHub Release from that tag, using the changelog as the human-written summary.
12. After publication, verify the release page, documentation links and CI status.

## Alpha policy

Until the project reaches stable status, breaking changes may occur between alpha releases. Breaking behavior must still be documented explicitly.

## Security releases

For embargoed vulnerabilities, coordinate the fix privately using GitHub Security Advisories/private vulnerability reporting. Publish exploit details only after a fixed release is available.
