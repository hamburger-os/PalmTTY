# Git CLI contracts used by PalmTTY

PalmTTY's Git integration relies on documented Git CLI formats and configuration controls rather than human-oriented command output.

## Status

Source: https://git-scm.com/docs/git-status

- `--porcelain=v2` is the machine-readable status format used by PalmTTY.
- With `--branch`, version 2 may emit `branch.oid`, `branch.head`, `branch.upstream`, and `branch.ab` headers.
- Version 2 defines distinct ordinary, rename/copy, unmerged, untracked, and ignored record forms.
- With `-z`, pathnames are not quoted and records/pathname fields use NUL termination. Parsers must not treat spaces in pathnames as field separators beyond the documented fixed fields.

## Diff helpers and text conversion

Source: https://git-scm.com/docs/git-diff

- `--no-ext-diff` disables external diff drivers.
- `--no-textconv` disables configured text conversion filters for diff rendering.
- These flags are relevant to read-only inspection because configured helpers can otherwise invoke external programs.

## Content filters

Source: https://git-scm.com/docs/gitattributes

- A path's `filter` attribute names a configured filter driver.
- Filter drivers may define `clean`, `smudge`, or long-running `process` commands; `process` takes precedence when configured.
- The clean side participates in Git's check-in conversion of working-tree content. A working-tree comparison must therefore account for filter execution separately from diff drivers/textconv.

## History and commit inspection

Sources:

- https://git-scm.com/docs/git-log
- https://git-scm.com/docs/git-show
- https://git-scm.com/docs/git-diff-tree

- `git log <commit>` can anchor history traversal at a specific commit; PalmTTY uses the initially observed HEAD object ID as the immutable pagination snapshot instead of paging against a moving branch name.
- `--skip=<n>` and `-n <count>` provide bounded offset/count pagination. PalmTTY keeps the snapshot object ID and offset inside an opaque bounded cursor.
- `--follow -- <path>` follows history beyond renames for one path. The path remains a validated repository-relative path and is separated from revisions/options by `--`.
- `git show -s --format=...` provides commit metadata without rendering the patch. `git diff-tree --root --name-status -r -z -M -C <commit>` provides machine-oriented changed-path records, including rename/copy records with NUL-delimited paths.
- Per-file historical diff uses `git show --format= --no-ext-diff --no-textconv <commit> -- <path>`; it therefore preserves the same external-diff/textconv avoidance used by the working-tree diff surface.

## Log signature verification

Source: https://git-scm.com/docs/git-config#Documentation/git-config.txt-logshowSignature

- `log.showSignature` controls whether `git log` verifies commit signatures.
- Signature verification may invoke the configured signing program, so a read-only history surface that must avoid helper execution should override this setting.

## Hooks

Source: https://git-scm.com/docs/git-config#Documentation/git-config.txt-corehooksPath

- `core.hooksPath` changes where Git looks for hooks.
- Pointing it at the platform null path is the basis for PalmTTY's explicit hook-disable policy on controlled write operations.
- This control does not disable `.gitattributes` clean/smudge filters or every other repository-configured helper; those remain a separate trust concern.

## Transport protocol policy

Source: https://git-scm.com/docs/git-config#Documentation/git-config.txt-protocolallow

- `protocol.allow` defines the fallback policy for protocols without an explicit `protocol.<name>.allow`.
- Git documents `http`, `https`, `git`, and `ssh` as known-safe protocols, `ext` as known-dangerous, and other protocols such as `file` with a more restrictive default.
- `protocol.<name>.allow` can override the policy for a named protocol.
- PalmTTY's project-specific remote allowlist and trust model are documented in the owner/security and AI invariant layers, not here.

Last reviewed: 2026-09-24.
