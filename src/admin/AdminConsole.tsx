import { useState } from "react";
import { gameStateSchema } from "@shared/state";
import { AvatarsPanel } from "@/admin/AvatarsPanel";
import { BenchPanel } from "@/admin/BenchPanel";
import { BowserPanel } from "@/admin/BowserPanel";
import { BucketPanel } from "@/admin/BucketPanel";
import { ClockPanel } from "@/admin/ClockPanel";
import { PrizesPanel } from "@/admin/PrizesPanel";
import { RetryPanel } from "@/admin/RetryPanel";
import { RigPanel } from "@/admin/RigPanel";
import { SnapsPanel } from "@/admin/SnapsPanel";
import { useAuth } from "@/context/AuthContext";
import { useCachedFetch } from "@/hooks/useCachedFetch";

const SECTIONS = [
  { id: "clock", label: "Clock" },
  { id: "snaps", label: "Snaps" },
  { id: "bucket", label: "Bucket" },
  { id: "prizes", label: "Prizes" },
  { id: "bowser", label: "Bowser days" },
  { id: "rig", label: "Rigged landings" },
  { id: "avatars", label: "Avatars" },
  { id: "bench", label: "Jury bench" },
  { id: "retries", label: "Jury retries" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export function AdminConsole() {
  const { user, isAdmin, loading } = useAuth();
  const clock = useCachedFetch("/api/state", gameStateSchema);
  const [section, setSection] = useState<SectionId>("clock");

  if (loading) {
    return (
      <div className="ops-screen">
        <p className="ops-empty">Asking who you are…</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="ops-screen" data-testid="ops-refused">
        <div className="ops-empty">
          <p>
            {user === null
              ? "The console is for signed-in operators."
              : "This console is not yours to open."}
          </p>
          <a className="ops-btn" href="/">
            Back to town
          </a>
        </div>
      </div>
    );
  }

  const state = clock.data;

  return (
    <div className="ops-screen" data-testid="ops-console">
      <header className="ops-bar">
        <h1 className="ops-title">Ignis console</h1>
        <p className="ops-readout" data-testid="ops-clock">
          {state === undefined
            ? "…"
            : `Day ${String(state.day)} · ${state.phase} · ${String(state.submissionCount)} in`}
        </p>
        <a className="ops-btn" href="/">
          Back to town
        </a>
      </header>
      <div className="ops-body">
        <nav className="ops-rail" aria-label="Console sections">
          {SECTIONS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className="ops-tab"
              aria-pressed={section === id}
              onClick={() => {
                setSection(id);
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        <main className="ops-column">
          {section === "clock" && (
            <ClockPanel clock={state} onMoved={clock.mutate} />
          )}
          {section === "snaps" && (
            <SnapsPanel clock={state} onRetired={clock.mutate} />
          )}
          {section === "bucket" && <BucketPanel />}
          {section === "prizes" && <PrizesPanel />}
          {section === "bowser" && <BowserPanel />}
          {section === "rig" && <RigPanel />}
          {section === "avatars" && <AvatarsPanel clock={state} />}
          {section === "bench" && <BenchPanel />}
          {section === "retries" && <RetryPanel clock={state} />}
        </main>
      </div>
    </div>
  );
}
