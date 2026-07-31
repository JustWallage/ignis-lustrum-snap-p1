/** The `prizes` migration carries these labels in SQL too, because a migration cannot
 * import TypeScript; `worker/prizes.test.ts` holds the two together. */
export const SEED_PRIZES: readonly string[] = [
  "Als eerste bed uitkiezen",
  "Buddy voor de dag",
  "Bier wordt voor je gehaald",
  "Tas wordt gedragen",
];

export const MIN_ENABLED_PRIZES = 2;
