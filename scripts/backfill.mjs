/** Migration 0013 stamps exactly this on every row that existed before it, so the
 * objects this writes and the keys that migration records cannot drift apart. */
function snapKeyFor(id) {
  return `snaps/${id}`;
}

function spriteKeyFor(avatarKey) {
  return `sprites/${avatarKey}`;
}

/**
 * A sprite needs BOTH the bytes and the handle everybody else loads through: migration
 * 0011 gave a key to every row that had an avatar, so one without a key is a row that
 * never had a picture, not one whose picture is about to be dropped.
 */
export function objectsFor({ photos, users }) {
  return [
    ...photos.map((row) => ({
      key: snapKeyFor(row.id),
      base64: row.data,
      contentType: row.content_type,
    })),
    ...users
      .filter((row) => row.avatar !== null && row.avatar_key !== null)
      .map((row) => ({
        key: spriteKeyFor(row.avatar_key),
        base64: row.avatar,
        contentType: row.avatar_content_type,
      })),
  ];
}

export async function backfillImages(store) {
  if (!(await store.hasByteColumns())) {
    return { status: "already-migrated" };
  }
  const objects = objectsFor({
    photos: await store.readPhotos(),
    users: await store.readUsers(),
  });
  for (const object of objects) {
    await store.put(object);
  }
  return { status: "copied", keys: objects.map((object) => object.key) };
}

export function describe(result) {
  if (result.status === "already-migrated") {
    return "The base64 columns are gone, so this database is already on R2 and nothing was copied.";
  }
  return `Copied ${result.keys.length} image(s) into the bucket.`;
}
