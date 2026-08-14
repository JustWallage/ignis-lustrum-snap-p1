import { useCallback, useMemo, useState } from "react";
import { prizeListSchema, type Prize } from "@shared/api";
import { MIN_ENABLED_PRIZES } from "@shared/prizes";
import { ConfirmButton } from "@/admin/ConfirmButton";
import { useCachedFetch } from "@/hooks/useCachedFetch";

type PrizePatch = Partial<Pick<Prize, "label" | "enabled" | "sortOrder">>;

export function PrizesPanel() {
  const list = useCachedFetch("/api/prizes", prizeListSchema);
  const { mutate } = list;
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState<number | null>(null);

  const patch = useCallback(async (id: number, body: PrizePatch) => {
    await fetch(`/api/prizes/${String(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }, []);

  const onRow = useCallback(
    async (id: number, work: () => Promise<void>) => {
      setWorking(id);
      try {
        await work();
        mutate();
      } finally {
        setWorking(null);
      }
    },
    [mutate],
  );

  const add = useCallback(async () => {
    const trimmed = label.trim();
    if (trimmed === "") return;
    setBusy(true);
    try {
      await fetch("/api/prizes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: trimmed }),
      });
      setLabel("");
      mutate();
    } finally {
      // Cleared AFTER the refetch is asked for: dropping it a line earlier made the
      // wait for the list invisible.
      setBusy(false);
    }
  }, [label, mutate]);

  const prizes = useMemo(() => list.data?.prizes ?? [], [list.data]);

  /** EVERY row is renumbered rather than the pair swapping values: `sort_order` may
   * tie, and swapping two equal orders moves nothing. */
  const move = useCallback(
    async (index: number, delta: number) => {
      const reordered = [...prizes];
      const moved = reordered[index];
      const displaced = reordered[index + delta];
      if (moved === undefined || displaced === undefined) return;
      reordered[index] = displaced;
      reordered[index + delta] = moved;
      await Promise.all(
        reordered
          .map((prize, order) => ({ prize, order }))
          .filter(({ prize, order }) => prize.sortOrder !== order)
          .map(({ prize, order }) => patch(prize.id, { sortOrder: order })),
      );
    },
    [patch, prizes],
  );

  const enabledCount = prizes.filter((prize) => prize.enabled).length;

  return (
    <section className="ops-panel" data-testid="ops-prizes">
      <h2 className="ops-heading">The prize wheel</h2>
      {enabledCount < MIN_ENABLED_PRIZES && (
        <p className="ops-error" role="alert" data-testid="ops-prize-warning">
          {`The wheel needs ${String(MIN_ENABLED_PRIZES)} enabled prizes to spin — ${String(enabledCount)} in.`}
        </p>
      )}
      <ul className="ops-list">
        {prizes.map((prize, index) => (
          <PrizeRow
            key={prize.id}
            prize={prize}
            first={index === 0}
            last={index === prizes.length - 1}
            busy={working === prize.id}
            onMove={(delta) => {
              void onRow(prize.id, () => move(index, delta));
            }}
            onRename={(next) => {
              void onRow(prize.id, async () => {
                const trimmed = next.trim();
                if (trimmed === "" || trimmed === prize.label) return;
                await patch(prize.id, { label: trimmed });
              });
            }}
            onToggle={() => {
              void onRow(prize.id, () =>
                patch(prize.id, { enabled: !prize.enabled }),
              );
            }}
            onDelete={() => {
              void onRow(prize.id, async () => {
                await fetch(`/api/prizes/${String(prize.id)}`, {
                  method: "DELETE",
                });
              });
            }}
          />
        ))}
      </ul>
      {prizes.length === 0 && (
        <p className="ops-empty">
          {list.loading ? "Reading the wheel…" : "No prizes yet."}
        </p>
      )}
      <form
        className="ops-row"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <input
          className="ops-input"
          value={label}
          onChange={(event) => {
            setLabel(event.target.value);
          }}
          placeholder="New prize…"
          maxLength={80}
        />
        <button
          type="submit"
          className="ops-btn"
          aria-busy={busy}
          disabled={busy || label.trim() === ""}
        >
          Add
        </button>
      </form>
    </section>
  );
}

function PrizeRow({
  prize,
  first,
  last,
  busy,
  onMove,
  onRename,
  onToggle,
  onDelete,
}: {
  prize: Prize;
  first: boolean;
  last: boolean;
  busy: boolean;
  onMove: (delta: number) => void;
  onRename: (label: string) => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(prize.label);
  const [committed, setCommitted] = useState(prize.label);

  // Someone else's rename arrives as a new `prize.label`; adopted during render
  // rather than in an effect, so the row never paints stale.
  if (prize.label !== committed) {
    setCommitted(prize.label);
    setDraft(prize.label);
  }

  return (
    <li className="ops-line" data-enabled={prize.enabled}>
      <input
        className="ops-input ops-grow"
        aria-label={`Prize ${prize.label}`}
        value={draft}
        maxLength={80}
        aria-busy={busy}
        readOnly={busy}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onBlur={() => {
          onRename(draft);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      <button
        type="button"
        className="ops-btn"
        aria-label={`Move ${prize.label} up`}
        disabled={first || busy}
        onClick={() => {
          onMove(-1);
        }}
      >
        ↑
      </button>
      <button
        type="button"
        className="ops-btn"
        aria-label={`Move ${prize.label} down`}
        disabled={last || busy}
        onClick={() => {
          onMove(1);
        }}
      >
        ↓
      </button>
      <button
        type="button"
        className="ops-btn"
        aria-pressed={prize.enabled}
        aria-label={`${prize.enabled ? "Disable" : "Enable"} ${prize.label}`}
        disabled={busy}
        onClick={onToggle}
      >
        {prize.enabled ? "On" : "Off"}
      </button>
      <ConfirmButton
        label="Delete"
        question={`Delete ${prize.label}?`}
        confirm="Delete it"
        busy={busy}
        onConfirm={onDelete}
      />
    </li>
  );
}
