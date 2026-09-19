# Agent Skills format

Last reviewed: 2026-09-19.

Authoritative project: https://agentskills.io/

Specification: https://agentskills.io/specification

## Core format

An Agent Skill is a directory containing a required `SKILL.md`. The file starts with YAML frontmatter and must include at least:

- `name`
- `description`

Supporting scripts, references and assets may live beside the entrypoint.

PalmTTY stores its repository skill at:

```text
.agents/
└─ skills/
   └─ docs-sync/
      └─ SKILL.md
```

The `.agents/skills/` project location is used for tools that discover the cross-agent convention there. The skill itself follows the portable `SKILL.md` format rather than embedding tool-specific command syntax.

PalmTTY also keeps a root `AGENTS.md` as a repository entrypoint pointing agents to the four documentation layers and the documentation-sync skill.
