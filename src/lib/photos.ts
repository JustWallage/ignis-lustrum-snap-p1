import { readApiError } from "@/lib/api";

const DELETE_FAILED = "The bin jammed. Have another go at it.";

/**
 * Purges a photograph and everything hung off it — likes, comments, votes, the jury's
 * verdict.
 */
export async function deleteSnap(id: number): Promise<void> {
  const res = await fetch(`/api/photos/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await readApiError(res, DELETE_FAILED));
}
