export type GesturePoint = { x: number; y: number };
export type TouchpadTap = "left" | "right" | null;
export type TouchpadMotion =
  | { type: "move"; dx: number; dy: number }
  | { type: "scroll"; dx: number; dy: number };

/**
 * One gesture owns a pointer sequence until all pointers have lifted.
 * Crossing the one/two-finger boundary resets the delta baseline; two-finger
 * motion follows the centroid rather than one arbitrarily chosen finger.
 * Cancellation never synthesizes a click.
 */
export class RemoteTouchpadGesture {
  private readonly pointers = new Map<number, GesturePoint>();
  private centroid: GesturePoint | null = null;
  private usedTwoFingers = false;
  private moved = false;
  private startedAt = 0;
  private origin: GesturePoint | null = null;

  has(pointerId: number): boolean {
    return this.pointers.has(pointerId);
  }

  get active(): boolean { return this.pointers.size > 0; }

  down(pointerId: number, point: GesturePoint, now = Date.now()): void {
    if (this.pointers.has(pointerId)) return;
    if (this.pointers.size === 0) {
      this.usedTwoFingers = false;
      this.moved = false;
      this.origin = point;
      this.startedAt = now;
    }
    this.pointers.set(pointerId, point);
    if (this.pointers.size > 1) this.usedTwoFingers = true;
    this.centroid = this.currentCentroid();
  }

  move(pointerId: number, next: GesturePoint): TouchpadMotion | null {
    const previous = this.pointers.get(pointerId);
    if (!previous) return null;
    this.pointers.set(pointerId, next);
    if (this.pointers.size >= 2) {
      const centroid = this.currentCentroid();
      const baseline = this.centroid;
      this.centroid = centroid;
      if (!baseline || !centroid) return null;
      const dx = centroid.x - baseline.x;
      const dy = centroid.y - baseline.y;
      if (Math.abs(dx) + Math.abs(dy) < 0.00001) return null;
      this.moved = true;
      return { type: "scroll", dx, dy };
    }
    this.centroid = next;
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    // Evaluate the whole gesture, not just each tiny move event: a slow
    // long drag must not end as an accidental click.
    if (this.origin && (Math.abs(next.x - this.origin.x) +
      Math.abs(next.y - this.origin.y)) > 0.012) this.moved = true;
    if (Math.abs(dx) + Math.abs(dy) < 0.00001) return null;
    return { type: "move", dx, dy };
  }

  canLongPress(pointerId: number): boolean {
    return this.pointers.size === 1 && this.pointers.has(pointerId) &&
      !this.usedTwoFingers && !this.moved;
  }

  up(pointerId: number, now = Date.now()): TouchpadTap {
    if (!this.pointers.has(pointerId)) return null;
    this.pointers.delete(pointerId);
    this.centroid = this.currentCentroid();
    if (this.pointers.size > 0) return null;
    const tap = !this.moved && now - this.startedAt <= 380
      ? (this.usedTwoFingers ? "right" : "left") : null;
    this.cancel();
    return tap;
  }

  cancel(): void {
    this.pointers.clear();
    this.centroid = null;
    this.usedTwoFingers = false;
    this.moved = false;
    this.origin = null;
    this.startedAt = 0;
  }

  private currentCentroid(): GesturePoint | null {
    if (!this.pointers.size) return null;
    let x = 0;
    let y = 0;
    for (const point of this.pointers.values()) {
      x += point.x;
      y += point.y;
    }
    return { x: x / this.pointers.size, y: y / this.pointers.size };
  }
}
