/**
 * The one-photograph viewer's paging, as pure functions. Both callers hold a list a
 * refetch can reorder or shorten while the viewer is open, so the open snap is
 * resolved BY ID on every render and never from a stored index: an index would quietly
 * become a different photograph under the reader.
 */

export interface ViewerSnap {
  id: number;
  url: string;
}

export interface ViewerPage {
  /** -1 when the open snap has left the list — a filter narrowed under it, or the day
   * moved on. */
  at: number;
  current: ViewerSnap | undefined;
}

export function pageOf(list: readonly ViewerSnap[], id: number): ViewerPage {
  const at = list.findIndex((snap) => snap.id === id);
  return { at, current: at === -1 ? undefined : list[at] };
}

/** Wraps at both ends. A snap no longer in the list steps nowhere: nothing can be one
 * away from a photograph that is not on screen. */
export function stepId(
  list: readonly ViewerSnap[],
  id: number,
  delta: number,
): number {
  const { at } = pageOf(list, id);
  if (at === -1) return id;
  const to = (at + delta + list.length) % list.length;
  return list[to]?.id ?? id;
}
