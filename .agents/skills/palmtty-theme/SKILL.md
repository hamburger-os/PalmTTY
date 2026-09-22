---
name: palmtty-theme
description: "Single source of truth for PalmTTY visual themes, liquid-glass surfaces, four-color ambient field, terminal palette integration, motion, performance modes, and mobile rendering constraints."
license: Apache-2.0
metadata:
  version: "1.4.0"
---

# PalmTTY Theme System — visual SSOT

This file is the single source of truth for PalmTTY's visual material and theme rules. It intentionally adopts the strongest reusable ideas from TauTerm's theme architecture while keeping PalmTTY's mobile-first information architecture, browser runtime, and terminal workflow independent.

Do not copy TauTerm component layouts or business UI into PalmTTY. Do not maintain a second theme specification in `docs/`.

## 1. Architecture

The visual system has four orthogonal layers:

1. **Spectrum Ambient** — shared low-frequency four-color environmental light.
2. **Clear Glass Physics** — one shared transparent material model.
3. **Theme Veil** — Spectrum, Obsidian, and Frosted tint the same material.
4. **Performance Mode** — Quality and Performance change rendering cost, not product identity.

Implementation ownership:

- `apps/web/src/theme.tsx`: theme state, persistence, document datasets, reduced-motion state, xterm palettes.
- `apps/web/src/theme.css`: design tokens, theme veils, semantic surfaces, ambient/prism animation, performance fallback.
- `apps/web/src/styles.css`: PalmTTY page/component layout only.
- business components consume semantic classes; they do not invent their own palette/material.

No backward-compatibility aliases are required. Prefer one clean current model.

## 2. Canonical spectrum

The only four ambient anchors are:

- Red: `#FE3734`
- Yellow: `#F4BA00`
- Green: `#02BE66`
- Blue: `#0B8AFF`

Spatial identity is fixed:

- top-left Red
- bottom-left Yellow
- bottom-right Green
- top-right Blue

Purple/orange may appear only through interpolation. Components must not introduce a second brand rainbow.

## 3. Shared glass physics

All themes share the same clear/specular glass tokens. Theme identity comes from veil tokens and contrast compensation, not from three unrelated material implementations.

Surface tiers:

- `.glass-shell`: small application shells, top bars and login cards. Quality mode may use bounded backdrop sampling.
- `.glass-modal`: modal dialogs that must visually isolate form/readability content from the ambient field. It uses a stronger theme veil and shadow, never large-area backdrop blur.
- `.glass-panel`: structural controls such as terminal header, key bar and composer shell. No large-area backdrop blur.
- `.terminal-surface`: the single terminal viewport owner. Its opaque background must come from the same active xterm theme background value; do not place `.glass-content` behind xterm.
- `.glass-content`: stable non-terminal read areas and empty states. No backdrop blur.
- `.glass-control`: dense nested controls such as the directory picker. No backdrop blur.
- `.glass-card`: workspace/session cards derived from the same physics.

A visual region has one surface owner. Do not stack equivalent glass surfaces merely to make an element look "more glassy".

## 4. Theme identity

### Spectrum

The clearest and brightest theme. Ambient color should visibly pass through shell/panel surfaces without making panels look like solid colored blocks.

### Obsidian

The same clear glass physics with a strong black veil. Keep edge specular and a small amount of ambient transmission; do not collapse into flat opaque black cards in Quality mode.

### Frosted

The same physics with a milky light veil. Maintain readable dark text, bright rim light and restrained shadow. Do not turn surfaces into plain white paper.

## 5. Ambient and motion

Use two oversized fields:

- Field A: Red + Green
- Field B: Blue + Yellow

Quality mode:

- both fields move independently;
- animation is transform-only;
- motion remains low frequency.

Performance mode:

- both fields and all four colors remain visible;
- ambient animation is stopped;
- shell backdrop sampling is disabled;
- large surfaces use simple static fills.

When the document is hidden, decorative animation pauses. When `prefers-reduced-motion: reduce` is active, decorative animation is static and the UI exposes that state.

Forbidden for persistent ambient/material effects:

- `filter: blur()`;
- `mix-blend-mode`;
- continuous gradient/background-position animation;
- permanent `will-change`;
- large-area backdrop blur.

## 6. Primary and selected actions

High-value primary actions may use the four-color prism surface. In Quality mode only, the prism may animate through an oversized pseudo-element using transform-only motion. Performance/reduced-motion modes remain static.

Do not turn every button into a prism. Secondary, navigation, destructive and routine actions use neutral semantic surfaces.

## 7. Controls and dialogs

Inputs/selects use the shared `.glass-input` contract. Native select popup rendering is platform-dependent; the active theme must set a matching `color-scheme`.

Product UI must not use browser `alert()`, `confirm()`, or `prompt()`. Binary confirmation uses the shared themed `ConfirmDialog`, with the safe action focused first for destructive flows.

Long workspace/editor modals use a fixed header, one scrollable body, and a fixed footer. The modal itself must not become a second competing scroll owner. Bounded nested data regions such as the directory list may scroll independently.

Interactive geometry must remain stable on hover/selected states. Avoid scale/translate where it causes layout or pointer-target instability.

## 8. Terminal integration

The terminal is a content surface, not a second application shell.

The xterm palette is owned by `theme.tsx`. The terminal host receives the active xterm background through a CSS custom property so the host gutter and xterm canvas are one visual surface; the business component must not duplicate terminal color values. Changing theme must update `terminal.options.theme` in-place and must not:

- recreate xterm;
- close/reopen WebSocket;
- reset `lastSeq`;
- trigger snapshot/replay;
- alter canonical Worker geometry.

Theme work must preserve the reconnect/recovery invariants in `docs/ai/invariants.md`. Presentation state such as theme or locale must not be a dependency of the xterm/WebSocket transport lifecycle.

The Session workbench's Terminal / Git / Files selection is also presentation state. Switching away from Terminal must keep the live terminal mounted, suppress hidden-pane geometry propagation, and safely refit when Terminal becomes active again; it must not reconnect merely because another pane was viewed.

On touch devices, a one-finger vertical drag that starts inside the terminal surface belongs to xterm, not to the surrounding page. The terminal stack version is governed by `terminal-stack.json`. PalmTTY must not translate touch pixels into terminal rows or install application-level `touchstart`/`touchmove` handlers: xterm's own Gesture/Viewport path owns continuous pixel scrolling, inertia, alternate-buffer key translation and mouse-protocol wheel reporting. Browser page panning is suppressed only at the xterm screen boundary with `touch-action: none`, while events continue through xterm's own listener path. Do not add a second DOM scroll viewport, a document-level touch handler, global gesture interception, or a competing scroll physics implementation.

Fit geometry has a separate ownership rule: the visual `.terminal-frame` may own border, radius, padding and clipping, but xterm must be opened into a nested `.terminal-mount` whose box is geometry-only and has no padding or border. FitAddon measures the xterm element's parent; decorative spacing on that parent can overestimate rows and clip the final rendered line. Resize observation targets the mount, and VisualViewport resize may request a refit without becoming canonical terminal state.

Terminal text contrast wins over decorative transparency. The terminal viewport stays opaque and theme-aligned rather than making xterm transparent merely to expose the ambient field.

## 9. Mobile-first constraints

PalmTTY is primarily operated from a phone.

- Preserve safe-area insets.
- Keep terminal viewport ownership simple: one decorative frame around one padding-free xterm mount; xterm remains the only terminal scroll-physics implementation.
- Controls must remain reachable in portrait and short landscape layouts.
- Workspace dialogs keep one intentional body scroll owner with header/footer actions always reachable; nested data regions may scroll only when bounded.
- High-frequency touch targets use the shared 44px target where space allows; compact secondary controls use the shared compact target rather than ad-hoc geometry.
- Avoid desktop-only hover as the only affordance.
- Avoid decorative rendering work that competes with xterm output/reconnect rendering.

## 10. Theme state

Theme and performance mode are local browser preferences and may be persisted in localStorage. They are presentation state, not Agent configuration and not Session authority.

Changing appearance must never mutate Workspace, Session, authentication, protocol, or Worker state.

## 11. Review rules

A theme/UI change is incomplete until reviewed with `.agents/skills/palmtty-theme-review/SKILL.md`.

At minimum validate:

- Spectrum / Obsidian / Frosted;
- Quality / Performance;
- system reduced-motion;
- login/loading/home;
- empty and populated workspace/session lists;
- workspace create/edit + directory picker + destructive confirmation;
- terminal connected/reconnecting/closed;
- portrait and short landscape;
- theme changes while a terminal remains connected.

Hard-coded visual color values belong only in the theme layer or explicit xterm theme definitions. Business/component layout CSS should consume tokens.
