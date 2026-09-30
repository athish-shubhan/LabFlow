"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { EXPERIMENT_STATUSES, type Experiment } from "@/lib/api/types";
import { applyServerErrors } from "@/lib/form-errors";
import { humanize } from "@/lib/format";
import { experimentFormSchema, type ExperimentFormValues } from "@/lib/schemas";

const FIELDS = ["name", "description", "status", "start_date", "end_date"] as const;

export function experimentToFormValues(e?: Experiment): ExperimentFormValues {
  return {
    name: e?.name ?? "",
    description: e?.description ?? "",
    status: e?.status ?? "planned",
    start_date: e?.start_date ?? "",
    end_date: e?.end_date ?? "",
  };
}

/**
 * Create/edit form for experiments. Validation mirrors the backend (status enum,
 * end_date >= start_date); server-side 422s are mapped back onto the same fields.
 */
export function ExperimentForm({
  defaultValues,
  onSubmit,
  submitLabel,
  footer,
  allowArchivedStatus = true,
}: {
  defaultValues: ExperimentFormValues;
  onSubmit: (values: ExperimentFormValues) => Promise<unknown>;
  submitLabel: string;
  footer?: ReactNode;
  allowArchivedStatus?: boolean;
}) {
  const form = useForm<ExperimentFormValues>({ resolver: zodResolver(experimentFormSchema), defaultValues });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(values);
    } catch (err) {
      applyServerErrors(err, form.setError, FIELDS);
    }
  });

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      {errors.root && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{errors.root.message}</AlertDescription>
        </Alert>
      )}
      <FormField label="Name" error={errors.name?.message}>
        {(a11y) => <Input {...a11y} {...form.register("name")} />}
      </FormField>
      <FormField label="Description" error={errors.description?.message}>
        {(a11y) => <Textarea {...a11y} rows={3} {...form.register("description")} />}
      </FormField>
      <FormField label="Status" error={errors.status?.message}>
        {(a11y) => (
          <NativeSelect {...a11y} {...form.register("status")}>
            {EXPERIMENT_STATUSES.filter((s) => allowArchivedStatus || s !== "archived").map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <FormField label="Start date" error={errors.start_date?.message}>
          {(a11y) => <Input {...a11y} type="date" {...form.register("start_date")} />}
        </FormField>
        <FormField label="End date" error={errors.end_date?.message} hint="Must be on or after the start date.">
          {(a11y) => <Input {...a11y} type="date" {...form.register("end_date")} />}
        </FormField>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {footer}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
