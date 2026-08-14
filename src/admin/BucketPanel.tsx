import { bucketSchema } from "@shared/api";
import { useCachedFetch } from "@/hooks/useCachedFetch";

const KB = 1024;

function sizeText(bytes: number): string {
  return bytes < KB ? `${String(bytes)} B` : `${(bytes / KB).toFixed(1)} kB`;
}

function groupText(count: number, bytes: number): string {
  return `${String(count)} · ${sizeText(bytes)}`;
}

export function BucketPanel() {
  const bucket = useCachedFetch("/api/admin/images", bucketSchema);
  const data = bucket.data;

  if (data === undefined) {
    return (
      <section className="ops-panel">
        <p className="ops-empty" data-testid="ops-bucket-empty">
          {bucket.error ?? "Counting the bucket…"}
        </p>
      </section>
    );
  }

  return (
    <section className="ops-panel" data-testid="ops-bucket">
      <h2 className="ops-heading">The bucket</h2>
      <dl className="ops-figures">
        <dt>Live</dt>
        <dd data-testid="ops-bucket-live">
          {groupText(data.live.count, data.live.bytes)}
        </dd>
        <dt>Retired</dt>
        <dd data-testid="ops-bucket-retired">
          {groupText(data.retired.count, data.retired.bytes)}
        </dd>
        <dt>Orphaned</dt>
        <dd data-testid="ops-bucket-orphaned">
          {groupText(data.orphaned.count, data.orphaned.bytes)}
        </dd>
      </dl>
      <h3 className="ops-subheading">Retired</h3>
      {data.retired.objects.length === 0 ? (
        <p className="ops-empty">Nothing has been retired.</p>
      ) : (
        <ul className="ops-grid" data-testid="ops-retired-list">
          {data.retired.objects.map((object) => (
            <li className="ops-card" key={object.key} data-testid="ops-retired">
              <img
                className="ops-shot"
                src={object.url}
                alt=""
                loading="lazy"
              />
              <p className="ops-card-meta">
                <span>Day {object.day}</span>
                <span>{object.uploader.name}</span>
                <span>{sizeText(object.size)}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
      <h3 className="ops-subheading">Orphaned</h3>
      <p className="ops-note">
        Written under no row — the leak the object-before-row ordering makes the
        expected one. Nothing names their content type, so they are listed
        rather than rendered.
      </p>
      {data.orphaned.objects.length === 0 ? (
        <p className="ops-empty">Nothing is orphaned.</p>
      ) : (
        <ul className="ops-list" data-testid="ops-orphaned-list">
          {data.orphaned.objects.map((object) => (
            <li className="ops-line" key={object.key} data-testid="ops-orphan">
              <span className="ops-key">{object.key}</span>
              <span>{sizeText(object.size)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
