/** The console's own spinner. `GbPending` is the game's and no COMPONENT crosses
 * between the two surfaces, which is the whole of the `ops-` quarantine — and the two
 * do not even look alike: one is three marching pixels, this is a ring. */
export function OpsPending({ label }: { label: string }) {
  return (
    <span
      className="ops-pending"
      data-testid="ops-pending"
      role="status"
      aria-busy={true}
      aria-label={label}
    />
  );
}
