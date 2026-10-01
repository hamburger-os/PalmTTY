---
name: palmtty-theme
description: "Single source of truth for PalmTTY visual themes, liquid-glass surfaces, four-color ambient field, terminal palette integration, motion, performance modes, and mobile rendering constraints."
license: Apache-2.0
metadata:
  version: "1.15.0"
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
- `.glass-modal`: modal dialogs that must visually isolate form/readability content from the ambient field. It uses a stronger theme veil, an almost opaque semantic `--flat-modal` base under the specular material, and shadow; never large-area backdrop blur or transparent overlay of underlying text.
- `.glass-panel`: structural controls such as terminal header, key bar and composer shell. No large-area backdrop blur.
- `.terminal-surface`: the single terminal viewport owner. Its opaque background must come from the same active xterm theme background value; do not place `.glass-content` behind xterm.
- `.remote-app-surface`: the separately owned video viewport uses the opaque semantic `--remote-video-background` token when no remote frame is available. It must not leak ambient gradients or inherit the Terminal palette.
- `.glass-content`: stable non-terminal read areas and empty states. No backdrop blur.
- `.glass-control`: dense nested controls such as the directory picker. No backdrop blur.
- `.glass-card`: workspace/session cards derived from the same physics.

A visual region has one surface owner. Do not stack equivalent glass surfaces merely to make an element look "more glassy".

### Immersive Remote App on phones

The remote app video is the one visual owner of all available workbench content height. The video surface has no persistent pointer-mode or diagnostic overlays except a pointer-events-none, theme-tokenized SVG cursor constrained to the verified owned-window position in Trackpad mode: a compact control strip lives below the video and above the special-key dock, using semantic surfaces and the shared touch-target tokens. The one-row mobile Workspace header can collapse into a Tools overlay; immersive mode removes the header's grid row but keeps a labeled exit button in the bottom control strip. Media diagnostics live in the on-demand options menu; before the first decoded frame an initial status may cover the empty surface, and after a frame has rendered any connection/capture warning belongs in the dock, not over the remote application's controls. The entire dock remains reachable inside VisualViewport above browser chrome, with an explicit expandable second key row. Complete aspect-ratio display is default; cropped cover is optional and its pointer mapping must be adjusted without image stretching. Remote App native touch ownership must not steal xterm's independent gesture path.

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

The Session workbench's Terminal / Git / Files / Artifacts selection is also presentation state. Switching away from Terminal must keep the live terminal mounted, suppress hidden-pane geometry propagation, and safely refit when Terminal becomes active again; it must not reconnect merely because another pane was viewed.

On touch devices, a one-finger vertical drag that starts inside the terminal surface belongs to xterm, not to the surrounding page. The terminal stack version is governed by `terminal-stack.json`. PalmTTY must not translate touch pixels into terminal rows or install application-level `touchstart`/`touchmove` handlers: xterm's own Gesture/Viewport path owns continuous pixel scrolling, inertia, alternate-buffer key translation and mouse-protocol wheel reporting. Browser page panning is suppressed only at the xterm screen boundary with `touch-action: none`, while events continue through xterm's own listener path. Do not add a second DOM scroll viewport, a document-level touch handler, global gesture interception, or a competing scroll physics implementation.

Keyboard activation is a separate responsibility from touch scrolling. A normal click/tap may synchronously bridge to `terminal.focus()` so mobile Safari/Chrome can activate xterm's hidden textarea, and the mobile key bar may expose an explicit keyboard-focus button. That bridge must not inspect or translate touch deltas, call `preventDefault()`, or become a second gesture recognizer. On coarse-pointer/mobile layouts, every editable `input`, `textarea`, and `select` must render at 16px or larger; this includes xterm's hidden helper textarea and compact appearance/language controls, because sub-16px editable controls can trigger iOS focus zoom.

IME compatibility is a narrow browser-input boundary, not a second terminal implementation. PalmTTY may use xterm's public `textarea`, `attachCustomKeyEventHandler`, `input`, `paste`, and `modes` APIs to compensate for confirmed keyCode-229 gaps, but it must leave genuine composition owned by xterm, buffer/deduplicate xterm `onData` from the same pending transaction, and never inspect terminal output to infer a CLI. Physical Ctrl+letter/Ctrl+Space/Escape recovery is limited to confirmed non-composing keyCode-229 keydown events. Long-text input uses xterm paste semantics so bracketed-paste mode is preserved, with Enter explicit rather than implicit. Virtual cursor keys honor xterm's current DECCKM/application-cursor mode instead of hard-coding normal CSI arrows.

Mobile viewport geometry has one owner above the terminal: the Session workbench follows the current `window.visualViewport` rectangle, including its offset during soft-keyboard/browser-chrome changes and while the user is pinch-zoomed. Resize and scroll events update that presentation frame. `visualViewport.scale` is diagnostic state, never a gate that disables viewport framing; PalmTTY must not write or reset the user's zoom. The viewport meta may opt into `interactive-widget=resizes-content` as progressive enhancement, but correctness must not depend on browser support for that hint. An opt-in `?viewportDebug=1` overlay may report viewport/focus metrics without logging terminal content or secrets.

Fit geometry has a separate ownership rule: the visual `.terminal-frame` may own border, radius, padding and clipping, but xterm must be opened into a nested `.terminal-mount` whose box is geometry-only and has no padding or border. FitAddon measures the xterm element's parent; decorative spacing on that parent can overestimate rows and clip the final rendered line. Resize observation targets the mount. Soft-keyboard/browser-chrome geometry reaches xterm only because the workbench changes the mount's size and its ResizeObserver schedules a fit; TerminalView must not create a competing VisualViewport listener.

Terminal text contrast wins over decorative transparency. The terminal viewport stays opaque and theme-aligned rather than making xterm transparent merely to expose the ambient field.

## 9. Mobile-first constraints

PalmTTY is primarily operated from a phone.

- Preserve safe-area insets.
- Keep the current visual viewport as the Session workbench's mobile layout frame at every zoom level so the header, terminal and key bar remain above the soft keyboard; preserve user pinch zoom instead of disabling or resetting it.
- Keep mobile editable controls at 16px or larger; achieve compactness with spacing and control dimensions, not sub-16px form text.
- Keep terminal viewport ownership simple: one decorative frame around one padding-free xterm mount; xterm remains the only terminal scroll-physics implementation.
- Controls must remain reachable in portrait and short landscape layouts.
- The mobile terminal keybar may use horizontally scrollable rows, but it must not become a competing vertical scroll owner. An always-visible row places Keyboard first and frequent Long Text second; one pinned More/Collapse control directly toggles its advanced row without separate full or hidden modes. The mobile Terminal and Remote App share a single-row header with Tools on demand. Changing any of these presentation states must not reconnect xterm/WebSocket. Keep high-frequency actions (including Enter and a literal `/` fallback) in the core row; lower-frequency symbol/navigation actions belong in an optional second horizontal row, and modifier buttons must expose pressed state accessibly. Browser-local terminal font-size controls may refit the mounted xterm in place, but must not recreate transport/session state.
- Workspace dialogs keep one intentional body scroll owner with header/footer actions always reachable; nested data regions may scroll only when bounded.
- Dense workbench regions also need one intentional vertical scroll owner. In particular, the Git sidebar owns scrolling for repository summary, the first-class Changes/History switch, change/history lists and Git tools; group/list descendants must not create nested competing vertical scrollers. Commit detail/diff replaces the Git list on narrow screens and must keep an explicit back action reachable. Files and Artifacts use one list scroller plus one independent preview scroller on wide screens; on narrow screens the selected preview replaces the list rather than creating side-by-side overflow. File preview actions (copy/share-download/history) belong to the preview toolbar/action row, must remain reachable as touch targets, and must not create a new vertical scroll owner. Image previews use ordinary bounded `<img>` content inside `.glass-content`, never a new backdrop/material layer.
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
- Files text/image preview plus copy/share-download/history actions, Git Changes/History list → commit detail → file diff navigation, and Artifacts empty/list/preview/upload/delete states on wide and narrow layouts, including four workbench tabs without unreachable controls;
- portrait and short landscape;
- theme changes while a terminal remains connected.

Hard-coded visual color values belong only in the theme layer or explicit xterm theme definitions. Business/component layout CSS should consume tokens.

### Remote App dock and cursor visual scale

Use `.glass-panel` for both the primary and extended Remote App key docks, never override their material with `--flat-content`; keep nested buttons theme-tokenized. The verified-window pointer overlay should remain a very small high-contrast arrow (5.667×8 CSS px, one third of its previous size) with a fine theme-owned outline and compact shadow; retain the exact hotspot and contain/cover geometry to avoid obscuring application controls.

### Lightweight Remote App pointer rendering

The bottommost Remote App special-key dock places Text first. The top Options menu should only contain display/cropping, explicit current-window resizing, quality and diagnostics; do not duplicate the text entry there. Mouse positions must use a small pointer-events-none SVG with the existing theme fill/outline and exact contain/cover projection; update its transform imperatively in a scheduled animation frame rather than rerendering the large video/workbench React subtree on each cursor report. Optimistic pointer display is permitted only for locally sent, bounded mouse movement and must reconcile with verified native coordinates. Native off-window/peer reset must hide it without continuing stale prediction. Never tie pointer telemetry sampling to PrintWindow frame rate or expand owned-window authority.
