# Mobile Web viewport and focus zoom references

This note records the browser behavior PalmTTY relies on for mobile layout. It is source-oriented; implementation status belongs in the owner/AI layers.

## Visual vs layout viewport

MDN documents two mobile viewports:

- the **layout viewport**, which lays out page content;
- the **visual viewport**, which is the portion currently visible to the user.

Pinch zoom shrinks the visual viewport without changing the layout viewport. On-screen keyboards can also shrink the visual viewport without changing the layout viewport.

Sources:

- https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport
- https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport/offsetTop

`VisualViewport.offsetLeft` / `offsetTop` are offsets from the layout viewport origin. `VisualViewport.scale` reports the current pinch-zoom scale, but it is not a signal that visual-viewport geometry can be ignored.

## Fixed-position behavior under zoom

MDN's VisualViewport example explicitly compensates a fixed overlay with visual-viewport offsets during zoom. WebKit also has an open Safari issue showing that fixed overlays can require VisualViewport offsets under pinch zoom.

Sources:

- https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport
- https://bugs.webkit.org/show_bug.cgi?id=257375

PalmTTY therefore treats current visual-viewport width/height/offset as presentation geometry at every zoom level instead of disabling the frame when `scale !== 1`.

## Editable-control focus zoom

WebKit's focus-zoom implementation historically computes a target zoom so a focused form control reaches an effective 16px font size. Sub-16px editable controls can therefore trigger browser zoom on iPhone/iPad.

Source:

- https://trac.webkit.org/timeline?from=2018-04-06T11%3A11%3A25-07%3A00&precision=second

PalmTTY keeps editable controls at 16px or larger on coarse-pointer/mobile layouts. This is separate from `text-size-adjust`, which controls text inflation rather than form-control focus zoom.

## Safari caveats

WebKit has documented VisualViewport inaccuracies under pinch zoom and virtual-keyboard panning, including cases where derived viewport math or offsets are inconsistent.

Sources:

- https://bugs.webkit.org/show_bug.cgi?id=271051
- https://bugs.webkit.org/show_bug.cgi?id=311821

Consequences for PalmTTY:

- do not derive layout width by multiplying VisualViewport width by scale;
- do not programmatically reset or disable user zoom;
- keep a real-device acceptance path for iOS Safari;
- expose opt-in geometry diagnostics instead of logging terminal content.

Last reviewed: 2026-09-23.
