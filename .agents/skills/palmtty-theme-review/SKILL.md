---
name: palmtty-theme-review
description: "Audit PalmTTY Web UI for theme SSOT compliance, mobile rendering quality, semantic surface ownership, terminal lifecycle isolation, and visual performance regressions."
license: Apache-2.0
metadata:
  version: "1.0.0"
---

# PalmTTY theme and rendering review

This is a review procedure only. Read `.agents/skills/palmtty-theme/SKILL.md` first and use it as the sole visual specification.

## Scope

Review:

- `apps/web/src/theme.tsx`
- `apps/web/src/theme.css`
- `apps/web/src/styles.css`
- `apps/web/src/**/*.tsx`
- relevant owner/AI documentation

## Static scan

Run `pnpm theme:check` first. It enforces the high-confidence repository guardrails for native dialogs, forbidden rendering effects, backdrop ownership, component hard-coded colors, and required theme/surface markers.

Then use repository search equivalent to:

```bash
rg 'window\.(alert|confirm|prompt)' apps/web/src
rg 'filter:\s*blur|mix-blend-mode|will-change|transition:\s*all' apps/web/src --glob '*.css' --glob '*.tsx'
rg 'backdrop-filter' apps/web/src
rg '#[0-9a-fA-F]{3,8}|rgba?\(' apps/web/src --glob '*.css' --glob '*.tsx'
rg 'glass-(shell|panel|content|control|card)' apps/web/src
rg 'data-theme|data-performance|data-motion|prefers-reduced-motion' apps/web/src
rg 'new Terminal|options\.theme|new WebSocket|lastSeq' apps/web/src/TerminalView.tsx
```

Hard-coded colors in `theme.css` and explicit xterm palettes in `theme.tsx` are expected. Treat hard-coded visual values in business components/layout CSS as suspicious.

## Manual matrix

Cover all 3 themes × 2 performance modes, plus reduced motion.

For each relevant combination inspect:

1. loading/login;
2. home with empty and populated workspaces/sessions;
3. workspace create/edit;
4. directory picker;
5. destructive confirmation;
6. terminal connected/reconnecting/closed;
7. portrait;
8. short landscape.

Theme switching while a terminal is live must not recreate xterm or WebSocket state.

## Review priorities

CRITICAL:
- unreadable terminal/content;
- appearance changes mutate/restart terminal/session state;
- persistent rendering cost severe enough to compete with terminal use.

HIGH:
- large-area backdrop blur;
- duplicate/nested glass ownership;
- theme-specific material forks instead of veil/tokens;
- Performance mode still runs decorative continuous animation;
- browser-native confirm/alert/prompt used as product UI.

MEDIUM:
- component-owned hard-coded palette;
- reduced-motion ignored;
- controls/touch targets become unreachable;
- Frosted/Obsidian/Spectrum identity collapses.

LOW:
- minor spacing, token or consistency drift.

## Report format

Write the report in Chinese:

```markdown
# PalmTTY 主题/UI 审查

**Theme SSOT**: palmtty-theme vX
**范围**:
**验证矩阵**:

## 发现
| 严重度 | 文件 | 问题 | 修复 |
|---|---|---|---|

## 验证
- pnpm docs:check:
- pnpm theme:check:
- pnpm typecheck:
- pnpm test:
- pnpm build:
- 3 themes × 2 modes:
- reduced motion:
- live terminal theme switch:
```

Do not add new visual rules here. If the specification is incomplete, update `palmtty-theme/SKILL.md`.
