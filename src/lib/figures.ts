export function points(value: number): string {
  return String(Math.round(value));
}

/** The fraction is never noise: it is the average of the positions a tied group
 * occupies, or the median an unjudged snap takes. Rounding was the alternative and it
 * hands one snap a position the whole group holds, then disagrees with the half that
 * place was paid — the `=` is what says the figure is shared rather than mistyped. */
export function placeText(place: number): string {
  return Number.isInteger(place) ? String(place) : `=${place.toFixed(1)}`;
}
