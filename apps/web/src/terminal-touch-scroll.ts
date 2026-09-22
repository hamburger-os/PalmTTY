import type { Terminal } from "@xterm/xterm";

export type TouchScrollStep = {
  lines: number;
  remainderPx: number;
};

export function consumeTouchScrollDelta(
  remainderPx: number,
  previousClientY: number,
  currentClientY: number,
  lineHeightPx: number
): TouchScrollStep {
  if (!Number.isFinite(lineHeightPx) || lineHeightPx <= 0) {
    return { lines: 0, remainderPx };
  }

  const nextRemainder = remainderPx + previousClientY - currentClientY;
  const lines = Math.trunc(nextRemainder / lineHeightPx);
  return {
    lines,
    remainderPx: nextRemainder - lines * lineHeightPx
  };
}

export function shouldOwnTerminalTouchScroll(
  bufferType: "normal" | "alternate",
  mouseTrackingMode: Terminal["modes"]["mouseTrackingMode"]
): boolean {
  return bufferType === "normal" && mouseTrackingMode === "none";
}

function canOwnTouchScroll(terminal: Terminal): boolean {
  return shouldOwnTerminalTouchScroll(
    terminal.buffer.active.type,
    terminal.modes.mouseTrackingMode
  );
}

function terminalLineHeight(host: HTMLElement, terminal: Terminal): number {
  const screen = host.querySelector<HTMLElement>(".xterm-screen");
  const height = screen?.clientHeight ?? host.clientHeight;
  return terminal.rows > 0 ? height / terminal.rows : 0;
}

export function attachTerminalTouchScroll(
  host: HTMLElement,
  terminal: Terminal
): { dispose(): void } {
  let active = false;
  let previousClientY = 0;
  let remainderPx = 0;
  let moved = false;

  const reset = () => {
    active = false;
    previousClientY = 0;
    remainderPx = 0;
    moved = false;
  };

  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1 || !canOwnTouchScroll(terminal)) {
      reset();
      return;
    }

    const touch = event.touches.item(0);
    if (!touch) {
      reset();
      return;
    }

    active = true;
    previousClientY = touch.clientY;
    remainderPx = 0;
    moved = false;

    // xterm's current gesture implementation listens on document. PalmTTY owns
    // normal-buffer, no-mouse-protocol touch scrolling locally so the gesture
    // cannot escape into either xterm's duplicate handler or page scrolling.
    event.stopPropagation();
  };

  const onTouchMove = (event: TouchEvent) => {
    if (!active) return;
    if (event.touches.length !== 1) {
      reset();
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const touch = event.touches.item(0);
    if (!touch) {
      reset();
      return;
    }

    const currentClientY = touch.clientY;
    const step = consumeTouchScrollDelta(
      remainderPx,
      previousClientY,
      currentClientY,
      terminalLineHeight(host, terminal)
    );
    previousClientY = currentClientY;
    remainderPx = step.remainderPx;

    if (step.lines !== 0) {
      terminal.scrollLines(step.lines);
      moved = true;
    }
  };

  const onTouchEnd = (event: TouchEvent) => {
    if (!active) return;
    event.stopPropagation();
    if (!moved) terminal.focus();
    reset();
  };

  const onTouchCancel = (event: TouchEvent) => {
    if (!active) return;
    event.stopPropagation();
    reset();
  };

  host.addEventListener("touchstart", onTouchStart, { passive: false });
  host.addEventListener("touchmove", onTouchMove, { passive: false });
  host.addEventListener("touchend", onTouchEnd, { passive: false });
  host.addEventListener("touchcancel", onTouchCancel, { passive: false });

  return {
    dispose() {
      host.removeEventListener("touchstart", onTouchStart);
      host.removeEventListener("touchmove", onTouchMove);
      host.removeEventListener("touchend", onTouchEnd);
      host.removeEventListener("touchcancel", onTouchCancel);
      reset();
    }
  };
}
