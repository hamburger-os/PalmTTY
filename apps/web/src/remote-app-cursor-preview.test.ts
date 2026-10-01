import { describe, expect, it } from "vitest";
import { RemoteCursorPreview } from "./remote-app-cursor-preview.js";

describe("remote cursor preview", () => {
  it("predicts each locally sent move while ignoring delayed native samples", () => {
    const cursor = new RemoteCursorPreview();
    cursor.observe({ x: 0.5, y: 0.5 }, 0);
    cursor.begin();
    cursor.predict({ x: 0.1, y: -0.2 });
    cursor.observe({ x: 0.52, y: 0.48 }, 30);
    expect(cursor.position).toEqual({ x: 0.6, y: 0.3 });
    cursor.end(45);
    cursor.observe({ x: 0.55, y: 0.42 }, 60);
    cursor.reconcile(164);
    expect(cursor.position).toEqual({ x: 0.6, y: 0.3 });
    cursor.observe({ x: 0.6, y: 0.3 }, 165);
    cursor.reconcile(165);
    expect(cursor.position).toEqual({ x: 0.6, y: 0.3 });
  });

  it("applies current native coordinates when idle and clips local estimates", () => {
    const cursor = new RemoteCursorPreview();
    cursor.observe({ x: 0.96, y: 0.02 }, 0);
    cursor.begin();
    cursor.predict({ x: 0.5, y: -0.5 });
    expect(cursor.position).toEqual({ x: 1, y: 0 });
    cursor.end(10);
    cursor.observe({ x: 0.98, y: 0.01 }, 145);
    expect(cursor.position).toEqual({ x: 0.98, y: 0.01 });
  });

  it("hides immediately when Windows leaves the owned window", () => {
    const cursor = new RemoteCursorPreview();
    cursor.observe({ x: 0.2, y: 0.8 }, 0);
    cursor.begin();
    cursor.predict({ x: 0.01, y: 0.01 });
    cursor.observe(null, 20);
    expect(cursor.position).toBeNull();
    cursor.reset();
    expect(cursor.position).toBeNull();
  });
});
