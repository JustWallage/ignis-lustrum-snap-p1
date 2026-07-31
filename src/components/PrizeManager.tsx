import { useCallback, useMemo, useState } from "react";
import { prizeListSchema, type Prize } from "@shared/api";
import { MIN_ENABLED_PRIZES } from "@shared/prizes";
import { GbButton, GbPlaceholder } from "@/components/GbPending";
import { GbWindow } from "@/components/GbWindow";
import { useRealtimeEvents } from "@/context/WebSocketContext";
import { useCachedFetch } from "@/hooks/useCachedFetch";

type PrizePatch = Partial<Pick<Prize, "label" | "enabled" | "sortOrder">>;

export function PrizeManager({ onClose }: { onClose: () => void }) {
  const list = useCachedFetch("/api/prizes", prizeListSchema);
  const { mutate } = list;
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState<number | null>(null);

  useRealtimeEvents(mutate);

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

  const remove = useCallback(async (id: number) => {
    await fetch(`/api/prizes/${String(id)}`, { method: "DELETE" });
  }, []);

  const rename = useCallback(
    async (prize: Prize, next: string) => {
      const trimmed = next.trim();
      if (trimmed === "" || trimmed === prize.label) return;
      await patch(prize.id, { label: trimmed });
    },
    [patch],
  );

  const toggle = useCallback(
    async (prize: Prize) => {
      await patch(prize.id, { enabled: !prize.enabled });
    },
    [patch],
  );

  const prizes = useMemo(() => list.data?.prizes ?? [], [list.data]);

  /** EVERY row is renumbered rather than the pair swapping values: `sort_order` may tie,
   * and swapping two equal orders moves nothing. */
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
    <GbWindow title="Prize wheel" onClose={onClose}>
      <div className="space-y-3" data-testid="prize-manager">
        {enabledCount < MIN_ENABLED_PRIZES && (
          <p className="gb-error" role="alert" data-testid="prize-warning">
            {`The wheel needs ${MIN_ENABLED_PRIZES} enabled prizes to spin — ${enabledCount} in.`}
          </p>
        )}
        <ul className="max-h-56 space-y-1 overflow-y-auto">
          {prizes.map((prize, index) => (
            <PrizeEntry
              key={prize.id}
              prize={prize}
              first={index === 0}
              last={index === prizes.length - 1}
              busy={working === prize.id}
              onMove={(delta) => {
                void onRow(prize.id, () => move(index, delta));
              }}
              onRename={(next) => {
                void onRow(prize.id, () => rename(prize, next));
              }}
              onToggle={() => {
                void onRow(prize.id, () => toggle(prize));
              }}
              onDelete={() => {
                void onRow(prize.id, () => remove(prize.id));
              }}
            />
          ))}
        </ul>
        {prizes.length === 0 && (
          <GbPlaceholder error={list.error} loading={list.loading}>
            No prizes yet.
          </GbPlaceholder>
        )}
        <form
          className="flex gap-2 border-t-2 border-[#071821] pt-2"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <input
            className="gb-input flex-1"
            value={label}
            onChange={(event) => {
              setLabel(event.target.value);
            }}
            placeholder="New prize…"
            maxLength={80}
          />
          <GbButton
            type="submit"
            className="gb-btn px-3"
            busy={busy}
            disabled={label.trim() === ""}
          >
            Add
          </GbButton>
        </form>
      </div>
    </GbWindow>
  );
}

function PrizeEntry({
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
    <li className="flex items-center gap-1" data-enabled={prize.enabled}>
      <input
        className="gb-input flex-1 text-xs"
        aria-label={`Prize ${prize.label}`}
        value={draft}
        maxLength={80}
        // A rename in flight is about to be answered by the whole list coming back.
        aria-busy={busy}
        readOnly={busy}
        style={prize.enabled ? undefined : { opacity: 0.5 }}
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
      <GbButton
        className="gb-btn px-1 py-0.5"
        aria-label={`Move ${prize.label} up`}
        busy={busy}
        disabled={first}
        onClick={() => {
          onMove(-1);
        }}
      >
        ↑
      </GbButton>
      <GbButton
        className="gb-btn px-1 py-0.5"
        aria-label={`Move ${prize.label} down`}
        busy={busy}
        disabled={last}
        onClick={() => {
          onMove(1);
        }}
      >
        ↓
      </GbButton>
      <GbButton
        className="gb-btn px-1 py-0.5"
        aria-pressed={prize.enabled}
        aria-label={`${prize.enabled ? "Disable" : "Enable"} ${prize.label}`}
        busy={busy}
        onClick={onToggle}
      >
        {prize.enabled ? "On" : "Off"}
      </GbButton>
      <GbButton
        className="gb-btn px-1 py-0.5"
        aria-label={`Delete ${prize.label}`}
        busy={busy}
        onClick={onDelete}
      >
        ×
      </GbButton>
    </li>
  );
}
