import { useState } from "react";
import {
  dayPhotosSchema,
  dayRankingSchema,
  photoDescriptionSchema,
  retirementSchema,
  type DayRanking,
  type PhotoDescription,
  type PhotoVerdict,
} from "@shared/api";
import type { GameState } from "@shared/state";
import { ConfirmButton } from "@/admin/ConfirmButton";
import { OpsPending } from "@/admin/OpsPending";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import { readApiError } from "@/lib/api";
import { unjudgedCount } from "@/lib/photos";
import { isFallbackRating, ratingText } from "@/lib/rating";

const REFUSED = "Nothing was retired.";

const DESCRIBE_REFUSED = "Nothing was described.";

const RANK_REFUSED = "The jury was not asked.";

const READING = "Reading the day…";

function retiredText(retired: number, day: number): string {
  return `${String(retired)} snap${retired === 1 ? "" : "s"} retired out of day ${String(day)}. The pictures are still in the bucket.`;
}

type PassState = PhotoVerdict["aiStatus"] | undefined;

function describedText(status: PassState): string {
  if (status === undefined) return "Not described";
  return status === "ok" ? "Described" : "Description failed";
}

function describeNote(done: PhotoDescription): string {
  const next =
    done.status === "ok"
      ? "Rank the day to turn it into a verdict."
      : `The jury still has no record of it. ${done.failure ?? ""}`.trim();
  return `Snap #${String(done.photoId)} — ${describedText(done.status)}. ${next}`;
}

function whyFailed(row: PhotoDescription | undefined): string | null {
  return row?.failure ?? null;
}

function verdictText(aiStatus: PassState): string {
  if (aiStatus === undefined) return "Never scored";
  return isFallbackRating(aiStatus) ? "Fallback verdict" : "Scored";
}

function isUsable(status: PassState, aiStatus: PassState): boolean {
  return status === "ok" && aiStatus === "ok";
}

function countOk(states: Iterable<PassState>): number {
  return [...states].filter((state) => state === "ok").length;
}

interface Tally {
  total: number;
  described: number;
  scored: number;
  usable: number;
}

function evaluatedText(tally: Tally | undefined): string {
  if (tally === undefined) return READING;
  return `Evaluated ${String(tally.usable)} of ${String(tally.total)} — ${String(tally.described)} described, ${String(tally.scored)} with a verdict the jury stands behind.`;
}

const JURY_HINT =
  "A verdict only comes out of ranking the whole day: describe the broken snaps one at a time, then rank the day once. The jury ranks by itself only when the last friend hands in — every other run is this button.";

/** Read through `unjudgedCount`, the same function the host's START warning counts
 * with, so the two surfaces cannot disagree about what "not ranked" means. */
function unjudgedNote(
  total: number,
  verdicts: readonly PhotoVerdict[],
): string | null {
  const unjudged = unjudgedCount(total, verdicts);
  if (unjudged <= 0) return null;
  const many = unjudged === 1 ? "snap has" : "snaps have";
  return `${String(unjudged)} of the day's ${String(total)} ${many} no verdict the jury stands behind. Rank the day before the event starts, or each of them takes the field's middle place.`;
}

function rankedText(ranking: DayRanking | undefined): string {
  if (ranking === undefined) return READING;
  const when =
    ranking.ranAt === null
      ? "never run"
      : `last run ${new Date(ranking.ranAt).toLocaleString()}`;
  const how = ranking.failed ? "the last run failed" : "the last run was fine";
  const why = ranking.failure === null ? "" : ` ${ranking.failure}`;
  return `${ranking.generated ? "Ranked" : "Not ranked"} — ${when}, ${how}.${why}`;
}

export function SnapsPanel({
  clock,
  onRetired,
}: {
  clock: GameState | undefined;
  onRetired: () => void;
}) {
  const [picked, setPicked] = useState("");
  // WHICH press is running, not merely that one is: a spinner on every button at once
  // says the console is busy, where an operator waiting on a model call needs to know
  // it is THEIR snap being read. Null is idle, and idle is what re-enables the rest.
  const [running, setRunning] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  // Empty means "the day the world is on", which is why the field is a string and not
  // the day itself: a cleared box has to stay cleared long enough to type another one.
  const asked = Number(picked);
  const shown =
    picked.trim() !== "" && Number.isInteger(asked) && asked > 0
      ? asked
      : (clock?.day ?? 1);
  const list = useCachedFetch(
    `/api/admin/days/${String(shown)}/photos`,
    dayPhotosSchema,
  );
  const { mutate } = list;

  const busy = running !== null;

  const press = async (
    key: string,
    path: string,
    refused: string,
  ): Promise<unknown> => {
    setRunning(key);
    setNote(null);
    setRefusal(null);
    try {
      const res = await fetch(path, { method: "POST" });
      if (res.ok) return await res.json();
      setRefusal(await readApiError(res, refused));
      return null;
    } finally {
      setRunning(null);
    }
  };

  const retire = async (path: string) => {
    const body = await press(`retire:${path}`, path, REFUSED);
    if (body === null) return;
    const done = retirementSchema.parse(body);
    setNote(retiredText(done.retired, done.day));
    mutate();
    onRetired();
  };

  const describe = async (id: number) => {
    const body = await press(
      `describe:${String(id)}`,
      `/api/admin/photos/${String(id)}/describe`,
      DESCRIBE_REFUSED,
    );
    if (body === null) return;
    setNote(describeNote(photoDescriptionSchema.parse(body)));
    mutate();
  };

  const rank = async () => {
    const body = await press(
      "rank",
      `/api/admin/days/${String(shown)}/rank`,
      RANK_REFUSED,
    );
    if (body === null) return;
    setNote(
      `Day ${String(shown)} — ${rankedText(dayRankingSchema.parse(body))}`,
    );
    mutate();
  };

  const photos = list.data?.photos ?? [];
  const described = new Map(
    (list.data?.descriptions ?? []).map((row) => [row.photoId, row]),
  );
  const scored = new Map(
    (list.data?.verdicts ?? []).map((row) => [row.photoId, row.aiStatus]),
  );
  // Counted off the two maps this grid renders from, never a figure the route sends: a
  // second source is one that can disagree with the cards printed beside it.
  const tally: Tally | undefined =
    list.data === undefined
      ? undefined
      : {
          total: photos.length,
          described: countOk([...described.values()].map((row) => row.status)),
          scored: countOk(scored.values()),
          usable: photos.filter((photo) =>
            isUsable(described.get(photo.id)?.status, scored.get(photo.id)),
          ).length,
        };

  const unjudged =
    list.data === undefined
      ? null
      : unjudgedNote(photos.length, list.data.verdicts);

  return (
    <section className="ops-panel" data-testid="ops-snaps-panel">
      <h2 className="ops-heading">The day&apos;s snaps</h2>
      <div className="ops-row">
        <label className="ops-field">
          Day
          <input
            className="ops-input"
            type="number"
            min={1}
            step={1}
            data-testid="ops-snap-day"
            value={picked}
            placeholder={String(clock?.day ?? 1)}
            onChange={(event) => {
              setPicked(event.target.value);
            }}
          />
        </label>
        <ConfirmButton
          label="Retire the whole day"
          question={`Retire every snap on day ${String(shown)}?`}
          confirm="Retire them"
          testId="ops-retire-day"
          busy={busy}
          disabled={photos.length === 0}
          onConfirm={() => {
            void retire(`/api/admin/days/${String(shown)}/retire`);
          }}
        />
      </div>
      <div className="ops-row">
        <p className="ops-readout" data-testid="ops-evaluated">
          {evaluatedText(tally)}
        </p>
        <p className="ops-readout" data-testid="ops-ranked">
          {rankedText(list.data?.ranking)}
        </p>
        <button
          type="button"
          className="ops-btn"
          data-testid="ops-rank-day"
          aria-busy={running === "rank"}
          disabled={busy || photos.length === 0}
          onClick={() => {
            void rank();
          }}
        >
          {running === "rank" ? "Asking the jury" : "Rank the day again"}
          {running === "rank" && <OpsPending label="Asking the jury" />}
        </button>
      </div>
      {unjudged !== null && (
        <p className="ops-warning" role="status" data-testid="ops-unjudged">
          {unjudged}
        </p>
      )}
      <p className="ops-note" data-testid="ops-jury-hint">
        {JURY_HINT}
      </p>
      {note !== null && (
        <p className="ops-note" data-testid="ops-snaps-note">
          {note}
        </p>
      )}
      {refusal !== null && (
        <p className="ops-error" role="alert" data-testid="ops-snaps-error">
          {refusal}
        </p>
      )}
      {photos.length === 0 ? (
        <p className="ops-empty" data-testid="ops-snaps-empty">
          {list.loading ? READING : "Nothing was handed in that day."}
        </p>
      ) : (
        <ul className="ops-grid" data-testid="ops-snaps">
          {photos.map((photo) => (
            <li
              className="ops-card"
              key={photo.id}
              data-testid="ops-snap"
              data-usable={
                isUsable(described.get(photo.id)?.status, scored.get(photo.id))
                  ? "true"
                  : "false"
              }
            >
              <img className="ops-shot" src={photo.url} alt="" loading="lazy" />
              <p className="ops-card-meta">
                <span>#{photo.id}</span>
                {photo.uploader !== null && <span>{photo.uploader.name}</span>}
                {photo.aiScore !== null && (
                  <span>{`Jury ${ratingText(photo.aiScore)}`}</span>
                )}
                <span data-testid={`ops-described-${String(photo.id)}`}>
                  {describedText(described.get(photo.id)?.status)}
                </span>
                <span data-testid={`ops-verdict-${String(photo.id)}`}>
                  {verdictText(scored.get(photo.id))}
                </span>
              </p>
              {whyFailed(described.get(photo.id)) !== null && (
                <p
                  className="ops-error"
                  data-testid={`ops-why-${String(photo.id)}`}
                >
                  {whyFailed(described.get(photo.id))}
                </p>
              )}
              <button
                type="button"
                className="ops-btn"
                data-testid={`ops-describe-${String(photo.id)}`}
                aria-busy={running === `describe:${String(photo.id)}`}
                disabled={busy}
                onClick={() => {
                  void describe(photo.id);
                }}
              >
                {running === `describe:${String(photo.id)}`
                  ? "Reading it"
                  : "Describe"}
                {running === `describe:${String(photo.id)}` && (
                  <OpsPending label="Reading the photograph" />
                )}
              </button>
              <ConfirmButton
                label="Retire"
                question={`Retire snap #${String(photo.id)}?`}
                confirm="Retire it"
                testId={`ops-retire-${String(photo.id)}`}
                busy={busy}
                onConfirm={() => {
                  void retire(`/api/admin/photos/${String(photo.id)}/retire`);
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
