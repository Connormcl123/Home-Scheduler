/**
 * labwc on the Pi runs the touchscreen with mouseEmulation="yes", so a finger
 * reaches Chromium as a mouse and never scrolls natively. DashboardApp scrolls
 * on drag itself; these are the pieces of that gesture that need no DOM.
 */

export type ScrollSample = { time: number; y: number };

/** Only the last stretch of the drag decides how fast the release was. */
const VELOCITY_WINDOW_MS = 100;
/** Slower than this (px/ms) is a placed finger, not a flick. */
const MIN_FLING_SPEED = 0.3;
/** Caps a jittery last sample from launching the list to the end. */
const MAX_FLING_SPEED = 4;
/** Share of the speed kept per 60 Hz frame. */
const FRICTION_PER_FRAME = 0.95;
const FRAME_MS = 1000 / 60;
/** Below this (px/ms) the fling has visibly stopped. */
const STOP_SPEED = 0.02;
/** A stalled frame must not turn into one big jump. */
const MAX_FRAME_MS = 50;

/** Finger travel (px) before a press becomes a scroll; the direction is decided there. */
const DRAG_SLOP = 6;

/** A primary touch or pen, or a left-button mouse (which is what emulated touch sends). */
export function acceptsDragScroll(event: Pick<PointerEvent, "isPrimary" | "pointerType" | "button">): boolean {
  return event.isPrimary && (event.pointerType !== "mouse" || event.button === 0);
}

/** Whether a press has become an up-and-down scroll, a sideways swipe left to others, or neither yet. */
export function dragAxis(dx: number, dy: number): "pending" | "vertical" | "horizontal" {
  if (Math.max(Math.abs(dx), Math.abs(dy)) <= DRAG_SLOP) return "pending";
  return Math.abs(dy) >= Math.abs(dx) ? "vertical" : "horizontal";
}

/** Finger speed in px/ms (positive = moving down) at release; 0 for a pause or a slow drag. */
export function releaseVelocity(samples: ScrollSample[], now: number): number {
  const recent = samples.filter((sample) => now - sample.time <= VELOCITY_WINDOW_MS);
  if (recent.length < 2) return 0;
  const first = recent[0];
  const last = recent[recent.length - 1];
  const elapsed = last.time - first.time;
  if (elapsed <= 0) return 0;
  const velocity = (last.y - first.y) / elapsed;
  if (Math.abs(velocity) < MIN_FLING_SPEED) return 0;
  return Math.max(-MAX_FLING_SPEED, Math.min(MAX_FLING_SPEED, velocity));
}

/** How far one frame of a fling travels, and the slower speed after it (0 once stopped). */
export function flingStep(velocity: number, frameMs: number): { distance: number; velocity: number } {
  const ms = Math.min(Math.max(frameMs, 0), MAX_FRAME_MS);
  const slowed = velocity * Math.pow(FRICTION_PER_FRAME, ms / FRAME_MS);
  return { distance: velocity * ms, velocity: Math.abs(slowed) < STOP_SPEED ? 0 : slowed };
}
