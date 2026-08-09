// The widenings below are the gap between `pnpm cf-typegen` and what ships:
// ENVIRONMENT stays `string` because the test surface treats an unrecognised value as
// production (fail closed); JWT_SECRET/USERS_JSON are inferred optional but always
// present at runtime; neither Gemini key is in any `vars` block, so both are declared
// here and OPTIONAL on purpose — local and e2e run without either. They are two keys
// because only one of them is billed per call, and NOTHING falls back from one to the
// other: see worker/lib/avatar.ts. IMAGE_PREFIX is widened for the same reason
// ENVIRONMENT is: cf-typegen reads the literal in the e2e `vars` block, which
// ephemeral-e2e.yml substitutes per run.
export type Bindings = Omit<
  Env,
  "ENVIRONMENT" | "JWT_SECRET" | "USERS_JSON" | "IMAGE_PREFIX"
> & {
  ENVIRONMENT: string;
  JWT_SECRET: string;
  USERS_JSON: string;
  IMAGE_PREFIX?: string;
  GEMINI_API_KEY?: string;
  GEMINI_API_KEY_PAID?: string;
};

export interface SessionUser {
  id: number;
  name: string;
}

export interface AppEnv {
  Bindings: Bindings;
  Variables: {
    user: SessionUser;
  };
}
