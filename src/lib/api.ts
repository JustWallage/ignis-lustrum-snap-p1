import { apiErrorSchema } from "@shared/api";
import type { ZodType } from "zod";

class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(
  path: string,
  schema: ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    throw new ApiRequestError(
      res.status,
      `Request to ${path} failed (${res.status})`,
    );
  }
  return schema.parse(await res.json());
}

export async function readApiError(
  res: Response,
  fallback: string,
): Promise<string> {
  const said = apiErrorSchema.safeParse(await res.json().catch(() => null));
  return said.success ? said.data.error : fallback;
}
