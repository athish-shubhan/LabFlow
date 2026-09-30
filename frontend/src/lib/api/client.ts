import createClient from "openapi-fetch";
import type { paths } from "./schema";

export type ApiClient = ReturnType<typeof createApiClient>;

export interface ApiClientOptions {
  baseUrl: string;
  headers?: Record<string, string>;
  fetch?: typeof globalThis.fetch;
}

export function createApiClient({ baseUrl, headers, fetch }: ApiClientOptions) {
  return createClient<paths>({
    baseUrl,
    headers,
    // Resolve globalThis.fetch lazily so tests can stub it after the client is created.
    fetch: fetch ?? ((input: Request) => globalThis.fetch(input)),
  });
}

/** A field-level problem reported by the backend (422) or produced locally. */
export interface FieldError {
  location: string;
  field: string;
  message: string;
}

/**
 * The backend's error body. Not in the OpenAPI schema: FastAPI documents its default
 * `HTTPValidationError`, but LabFlow's exception handlers return
 * `{detail: string, errors?: FieldError[]}` (see backend/app/errors.py).
 */
interface BackendErrorBody {
  detail?: unknown;
  errors?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: FieldError[];

  constructor(status: number, message: string, fieldErrors: FieldError[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }

  get isUnauthorized() {
    return this.status === 401;
  }

  get isNotFound() {
    // Malformed ids in the URL path come back as 422s located in "path"; for a page
    // that is the same thing as a missing resource.
    return this.status === 404 || (this.status === 422 && this.fieldErrors.some((e) => e.location === "path"));
  }

  /** Map of field name -> message for errors located in the request body. */
  bodyFieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const e of this.fieldErrors) {
      if (e.location === "body" && e.field && !(e.field in out)) out[e.field] = e.message;
    }
    return out;
  }
}

function isFieldError(value: unknown): value is FieldError {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.field === "string" && typeof v.message === "string";
}

const FALLBACK_MESSAGES: Record<number, string> = {
  0: "Could not reach the LabFlow server. Check your connection and try again.",
  401: "Your session has expired. Please sign in again.",
  403: "You do not have access to this resource.",
  404: "Not found.",
  422: "Some of the submitted values are invalid.",
  500: "The server hit an unexpected error. Please try again.",
};

/** Build an ApiError from a status code and whatever JSON (or nothing) the server sent. */
export function toApiError(status: number, body: unknown): ApiError {
  const b = (typeof body === "object" && body !== null ? body : {}) as BackendErrorBody;
  let fieldErrors: FieldError[] = [];

  if (Array.isArray(b.errors)) {
    fieldErrors = b.errors.filter(isFieldError).map((e) => ({ location: e.location ?? "body", field: e.field, message: e.message }));
  } else if (Array.isArray(b.detail)) {
    // FastAPI's stock validation shape: {detail: [{loc: [...], msg}]}
    fieldErrors = b.detail.flatMap((d: unknown) => {
      if (typeof d !== "object" || d === null) return [];
      const { loc, msg } = d as { loc?: unknown; msg?: unknown };
      if (!Array.isArray(loc) || typeof msg !== "string") return [];
      const [location, ...path] = loc.map(String);
      return [{ location: location ?? "body", field: path.join("."), message: msg }];
    });
  }

  let message = typeof b.detail === "string" ? b.detail : (FALLBACK_MESSAGES[status] ?? `Request failed (${status}).`);
  if (status === 422 && fieldErrors.length === 1) message = fieldErrors[0].message;
  return new ApiError(status, message, fieldErrors);
}

interface ApiResult {
  data?: unknown;
  error?: unknown;
  response: Response;
}

/**
 * Await an openapi-fetch call and return its data, or throw an ApiError.
 * Every query/mutation in the app goes through this, so error handling is uniform.
 */
export async function unwrap<R extends ApiResult>(call: Promise<R>): Promise<Exclude<R["data"], undefined>> {
  let result: R;
  try {
    result = await call;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(0, undefined);
  }
  if (result.error !== undefined || !result.response.ok) {
    throw toApiError(result.response.status, result.error);
  }
  return result.data as Exclude<R["data"], undefined>;
}
