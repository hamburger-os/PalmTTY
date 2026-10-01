import type { UnitPoint } from "./remote-app-presentation.js";

const RECONCILE_DELAY_MS = 120;
const clamp = (value: number) => Math.max(0, Math.min(1, value));

/**
 * Optimistic phone pointer feedback is a display-only hint, never input authority.
 * Ignore delayed native samples during movement; reconcile from the latest
 * verified-window sample after the gesture has settled. Hidden is immediate.
 */
export class RemoteCursorPreview {
  private confirmed: UnitPoint | null = null;
  private displayed: UnitPoint | null = null;
  private moving = false;
  private settleAfter = 0;

  get position(): UnitPoint | null { return this.displayed; }

  observe(position: UnitPoint | null, now: number): void {
    this.confirmed = position;
    if (!position) {
      this.displayed = null;
      return;
    }
    if (!this.displayed || (!this.moving && now >= this.settleAfter)) {
      this.displayed = position;
    }
  }

  begin(): void {
    this.moving = true;
    this.settleAfter = Number.POSITIVE_INFINITY;
  }

  predict(delta: UnitPoint): void {
    const baseline = this.displayed ?? this.confirmed;
    if (!baseline) return;
    this.displayed = {
      x: clamp(baseline.x + delta.x),
      y: clamp(baseline.y + delta.y)
    };
  }

  end(now: number): void {
    this.moving = false;
    this.settleAfter = now + RECONCILE_DELAY_MS;
  }

  reconcile(now: number): void {
    if (!this.moving && now >= this.settleAfter) {
      this.displayed = this.confirmed;
    }
  }

  reset(): void {
    this.confirmed = null;
    this.displayed = null;
    this.moving = false;
    this.settleAfter = 0;
  }
}

export const REMOTE_CURSOR_RECONCILE_DELAY_MS = RECONCILE_DELAY_MS;
