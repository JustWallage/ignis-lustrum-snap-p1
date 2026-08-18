// `lib/rating.ts` words the jury's rating and the curve; these are the two figures
// neither half claims.

export function points(value: number): string {
  return String(Math.round(value));
}

/** A place is `rankOf`'s AVERAGE of the positions a tied group occupies, so half of
 * them are a .5 and the fraction IS the tie. Rounding would print a placing nobody
 * took and disagree with the half that position was paid; the `=` is what says the
 * figure is shared rather than mistyped. */
export function placeText(place: number): string {
  return Number.isInteger(place) ? String(place) : `=${place.toFixed(1)}`;
}
