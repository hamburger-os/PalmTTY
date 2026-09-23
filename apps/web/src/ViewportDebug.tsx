import { useEffect, useState } from "react";

type ViewportSnapshot = {
  inner: string;
  client: string;
  visual: string;
  visualOffset: string;
  visualScale: string;
  screen: string;
  dpr: string;
  focus: string;
};

function number(value: number | undefined): string {
  return value === undefined ? "n/a" : value.toFixed(2);
}

function focusedElement(): string {
  const element = document.activeElement;
  if (!(element instanceof HTMLElement)) return "none";
  const id = element.id ? `#${element.id}` : "";
  const classes = element.classList.length
    ? `.${Array.from(element.classList).join(".")}`
    : "";
  return `${element.tagName.toLowerCase()}${id}${classes}`;
}

function snapshot(): ViewportSnapshot {
  const viewport = window.visualViewport;
  return {
    inner: `${window.innerWidth} × ${window.innerHeight}`,
    client: `${document.documentElement.clientWidth} × ${document.documentElement.clientHeight}`,
    visual: viewport ? `${number(viewport.width)} × ${number(viewport.height)}` : "n/a",
    visualOffset: viewport
      ? `${number(viewport.offsetLeft)}, ${number(viewport.offsetTop)}`
      : "n/a",
    visualScale: viewport ? number(viewport.scale) : "n/a",
    screen: `${window.screen.width} × ${window.screen.height}`,
    dpr: number(window.devicePixelRatio),
    focus: focusedElement()
  };
}

export function ViewportDebug() {
  const enabled = new URLSearchParams(window.location.search).get("viewportDebug") === "1";
  const [state, setState] = useState<ViewportSnapshot>(() => snapshot());

  useEffect(() => {
    if (!enabled) return;

    const viewport = window.visualViewport;
    let frame: number | undefined;
    const schedule = () => {
      if (frame !== undefined) return;
      frame = window.requestAnimationFrame(() => {
        frame = undefined;
        setState(snapshot());
      });
    };

    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);

    schedule();
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <aside className="viewport-debug" aria-label="Viewport debug">
      <strong>viewportDebug</strong>
      <span>inner {state.inner}</span>
      <span>client {state.client}</span>
      <span>visual {state.visual}</span>
      <span>offset {state.visualOffset}</span>
      <span>scale {state.visualScale}</span>
      <span>screen {state.screen}</span>
      <span>dpr {state.dpr}</span>
      <span>focus {state.focus}</span>
    </aside>
  );
}
