/**
 * A slow wander of up to 24px, a new spot each minute, so the clock and the
 * photo edges never sit on the same pixels all night.
 */
export function screensaverDrift(date: Date): { x: number; y: number } {
  const minute = Math.floor(date.getTime() / 60000);
  const angle = (minute * 47) % 360 * (Math.PI / 180);
  const radius = 12 + (minute % 3) * 6;
  return { x: Math.round(Math.cos(angle) * radius), y: Math.round(Math.sin(angle) * radius) };
}

export function nextSlide(index: number, count: number): number {
  return count ? (index + 1) % count : 0;
}
