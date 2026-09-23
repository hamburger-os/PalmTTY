---
name: palmtty-theme-review
description: "Audit PalmTTY Web UI for theme SSOT compliance, mobile rendering quality, semantic surface ownership, terminal lifecycle isolation, and visual performance regressions."
license: Apache-2.0
metadata:
  version: "1.4.0"
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

Run `pnpm theme:check` and `pnpm terminal:check` first. It enforces the high-confidence repository guardrails for native dialogs, forbidden rendering effects, backdrop ownership, component hard-coded colors, and required theme/surface markers.

Then use repository search equivalent to:

```bash
rg 'window\.(alert|confirm|prompt)' apps/web/src
rg 'filter:\s*blur|mix-blend-mode|will-change|transition:\s*all' apps/web/src --glob '*.css' --glob '*.tsx'
rg 'backdrop-filter' apps/web/src
rg '#[0-9a-fA-F]{3,8}|rgba?\(' apps/web/src --glob '*.css' --glob '*.tsx'
rg 'glass-(shell|modal|panel|content|control|card)|terminal-surface' apps/web/src
rg 'data-theme|data-performance|data-motion|prefers-reduced-motion' apps/web/src
rg 'new Terminal|options\.theme|new WebSocket|lastSeq' apps/web/src/TerminalView.tsx
```

Hard-coded colors in `theme.css` and explicit xterm palettes in `theme.tsx` are expected. Treat hard-coded visual values in business components/layout CSS as suspicious.

## Manual matrix

Cover all 3 themes × 2 performance modes, plus reduced motion.

For each relevant combination inspect:

1. loading/login;
2. home with empty and populated workspaces/sessions;
3. workspace create/edit, including a form tall enough to scroll while header/footer remain reachable;
4. directory picker;
5. destructive confirmation;
6. Session workbench in Terminal / Git / Files views; terminal connected/reconnecting/closed, checking that pane switching does not recreate xterm/WebSocket state and that the frame gutter and xterm canvas read as one surface; generate more than one viewport of normal-buffer output on a real touch device/emulation and verify one-finger vertical swipes use xterm-owned continuous/inertial scrolling while the page stays fixed, the final row is fully visible at the live bottom, and an alternate-buffer/mouse-tracking application keeps xterm-owned touch semantics;
7. Files list + preview and Git status + diff in narrow/mobile and desktop layouts;
8. portrait;
9. short landscape.

Theme or workbench-pane switching while a terminal is live must not recreate xterm or WebSocket state. Presentation-state changes must not be wired into the terminal transport lifecycle.

## Review priorities

CRITICAL:
- unreadable terminal/content;
- appearance changes mutate/restart terminal/session state;
- persistent rendering cost severe enough to compete with terminal use.

HIGH:
- large-area backdrop blur;
- duplicate/nested glass ownership, including a generic glass surface behind xterm;
- padding/border/clipping placed on the xterm FitAddon mount instead of the outer terminal frame, which can overestimate rows and clip the final line;
- modal content transparency high enough that background cards/actions compete with form text;
- theme-specific material forks instead of veil/tokens;
- Performance mode still runs decorative continuous animation;
- browser-native confirm/alert/prompt used as product UI.

MEDIUM:
- component-owned hard-coded palette;
- reduced-motion ignored;
- controls/touch targets become unreachable;
- long modal scroll moves its header/footer actions out of reach;
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
- pnpm terminal:check:
- pnpm typecheck:
- pnpm test:
- pnpm build:
- 3 themes × 2 modes:
- reduced motion:
- live terminal theme switch:
```

Do not add new visual rules here. If the specification is incomplete, update `palmtty-theme/SKILL.md`.
