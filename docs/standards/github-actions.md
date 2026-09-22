# GitHub Actions reusable workflows

Authoritative upstream references used by PalmTTY's repository/release automation:

- GitHub Docs — Reusing workflow configurations: https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations
- GitHub Docs — Contexts reference: https://docs.github.com/en/actions/reference/workflows-and-actions/contexts
- GitHub Docs — Reuse workflows: https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows

## Relevant upstream semantics

- A reusable workflow is invoked through `workflow_call`, and caller-provided values are available through the `inputs` context.
- When a reusable workflow runs, its `github` context is associated with the caller workflow. In particular, `github.workflow` is the caller workflow name rather than a safe unique identity for the called file.
- GitHub warns that `cancel-in-progress: true` combined with overlapping concurrency groups across a caller/called workflow can cancel the running workflow.

## PalmTTY interpretation

Release qualification calls CI, Security Audit and CodeQL as sibling reusable workflows against one immutable source SHA. Therefore:

- the exact source is selected from `inputs.ref` when the workflow is called and falls back to the event SHA only for ordinary push/pull/schedule runs;
- CI, Security Audit and CodeQL use distinct concurrency namespaces rather than `github.workflow`;
- no sibling release gate may cancel another gate merely because both inherited the Release caller context.

Last reviewed: 2026-09-22.
