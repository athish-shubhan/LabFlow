import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ApiError } from "@/lib/api/client";

/**
 * Put a failed mutation's errors onto the form: backend 422 field errors go on the
 * matching fields, everything else becomes the form-level (root) error.
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
) {
  if (error instanceof ApiError) {
    const byField = error.bodyFieldErrors();
    let unmatched = false;
    for (const [field, message] of Object.entries(byField)) {
      if ((fields as readonly string[]).includes(field)) setError(field as Path<T>, { message });
      else unmatched = true;
    }
    if (unmatched || Object.keys(byField).length === 0) setError("root", { message: error.message });
    return;
  }
  setError("root", { message: "Something went wrong. Please try again." });
}
