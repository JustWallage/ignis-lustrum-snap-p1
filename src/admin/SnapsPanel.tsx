import { useRef, useState } from "react";
import {
  dayPhotosSchema,
  dayRankingSchema,
  JURY_MODELS,
  photoDescriptionSchema,
  retirementSchema,
  type DayRanking,
  type JuryModel,
  type JurySpend,
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
  // Empty is "whatever the app runs on", which is what every caller but this dropdown
  // sends: the route reads a missing model as no override rather than as a choice.
  const [model, setModel] = useState<JuryModel | "">("");
  // The same shape as the model above: `default` is what every other caller sends by
  // sending nothing, which is the app's own rule for that run rather than one key —
  // reading a photograph already reaches for the billed key, ranking a day does not.
  // Picking the billed key is the operator saying the bill is worth it for THIS press.
  const [spend, setSpend] = useState<JurySpend>("default");
  // A GENERATION rather than a boolean: the sweep below reads it between awaits, and a
  // state value captured in that closure would still say "go" after Stop. Bumping it is
  // what both Stop and a fresh sweep do, so a superseded sweep also stands down instead
  // of two of them writing the readout at once.
  const sweep = useRef(0);

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

  /** The model and the key ride on EVERY manual press from this panel, and on nothing
   * else: the upload's own describe has no operator behind it to choose either. A
   * field left on its default is OMITTED rather than sent, so the body a plain press
   * sends is the empty one every other caller sends. */
  const runBody = () =>
    JSON.stringify({
      ...(model === "" ? {} : { model }),
      ...(spend === "default" ? {} : { spend }),
    });

  const ask = async (path: string, refused: string): Promise<unknown> => {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: runBody(),
    });
    if (res.ok) return await res.json();
    setRefusal(await readApiError(res, refused));
    return null;
  };

  const press = async (
    key: string,
    path: string,
    refused: string,
  ): Promise<unknown> => {
    setRunning(key);
    setNote(null);
    setRefusal(null);
    try {
      return await ask(path, refused);
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

  /**
   * ONE AT A TIME, driven from here rather than from a route that loops: fourteen
   * describes in one request is fourteen Gemini calls inside one Worker invocation,
   * which is the shape that was already timing out — and firing them in PARALLEL is
   * the burst that spends the free tier's per-minute quota and makes most of them 429.
   * Sequential also buys the thing a batch route cannot: each answer lands as it
   * arrives, so the grid fills in under the operator rather than after it.
   */
  const describeEach = async (ids: readonly number[]) => {
    const mine = (sweep.current += 1);
    setNote(null);
    setRefusal(null);
    let done = 0;
    for (const id of ids) {
      if (sweep.current !== mine) return;
      done += 1;
      setRunning(`describe:${String(id)}`);
      setNote(`Reading ${String(done)} of ${String(ids.length)}…`);
      const body = await ask(
        `/api/admin/photos/${String(id)}/describe`,
        DESCRIBE_REFUSED,
      );
      if (sweep.current !== mine) return;
      // Every answer, not just the last: this refetch IS the live readout.
      mutate();
      // Only the ROUTE refusing stops the sweep — a 400 on the picked model, a 409,
      // a 404 — because that one would repeat identically on every snap left. A
      // description that came back FAILED does not: Gemini refusing one photograph
      // says nothing about the next, and a spent quota answers each of them in
      // milliseconds and costs nothing, so the honest thing is to finish and leave
      // fourteen rows each carrying their own reason.
      if (body === null) break;
    }
    setRunning(null);
    setNote(`Read ${String(done)} of ${String(ids.length)}.`);
  };

  const stopSweep = () => {
    sweep.current += 1;
    setRunning(null);
    setNote("Stopped.");
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

  /** Anything the jury cannot read yet: never described, or described and failed. A
   * snap already read is left alone, so pressing this twice does not spend the quota
   * re-reading what worked. */
  const unread = photos
    .filter((photo) => described.get(photo.id)?.status !== "ok")
    .map((photo) => photo.id);

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
        <label className="ops-field">
          Model
          <select
            className="ops-input"
            data-testid="ops-model"
            value={model}
            disabled={busy}
            onChange={(event) => {
              // The empty option is not a model: it is the app's own default, which is
              // what the route runs when no override arrives.
              const picked = event.target.value;
              setModel(JURY_MODELS.find((one) => one === picked) ?? "");
            }}
          >
            <option value="">Default</option>
            {JURY_MODELS.map((one) => (
              <option key={one} value={one}>
                {one}
              </option>
            ))}
          </select>
        </label>
        <label className="ops-field">
          Key
          <select
            className="ops-input"
            data-testid="ops-spend"
            value={spend}
            disabled={busy}
            onChange={(event) => {
              setSpend(event.target.value === "billed" ? "billed" : "default");
            }}
          >
            <option value="default">Default</option>
            <option value="billed">Billed key</option>
          </select>
        </label>
        <button
          type="button"
          className="ops-btn"
          data-testid="ops-describe-all"
          aria-busy={busy}
          disabled={busy || unread.length === 0}
          onClick={() => {
            void describeEach(unread);
          }}
        >
          {`Describe the ${String(unread.length)} the jury cannot read`}
        </button>
        {busy && (
          <button
            type="button"
            className="ops-btn"
            data-testid="ops-describe-stop"
            onClick={stopSweep}
          >
            Stop
          </button>
        )}
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
