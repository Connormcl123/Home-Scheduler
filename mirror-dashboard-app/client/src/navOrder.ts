/**
 * A saved nav order plus any tabs added since it was saved. A new tab goes
 * where it sits in the default order, before the next tab that follows it
 * there, so Packages lands above Settings rather than at the bottom.
 */
export function mergeNavOrder<T extends string>(saved: unknown[], defaults: readonly T[]): T[] {
  const known = new Set<string>(defaults);
  const order = saved.filter((view, index): view is T => typeof view === "string" && known.has(view) && saved.indexOf(view) === index);
  defaults.forEach((view, index) => {
    if (order.includes(view)) return;
    const next = defaults.slice(index + 1).find((later) => order.includes(later));
    if (next === undefined) order.push(view);
    else order.splice(order.indexOf(next), 0, view);
  });
  return order;
}
