"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { Sample } from "@/lib/api/types";
import { applyServerErrors } from "@/lib/form-errors";
import { formatValue } from "@/lib/format";
import { useCreateMeasurement } from "@/lib/mutations";
import { measurementFormSchema, toMeasurementPayload } from "@/lib/schemas";

const schema = measurementFormSchema.extend({ sampleId: z.string().min(1, "Choose a sample") });
type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

function nowForInput() {
  const d = new Date();
  d.setSeconds(0, 0);
  // datetime-local wants local wall-clock time without a zone.
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function AddMeasurementDialog({ experimentId, samples }: { experimentId: string; samples: Sample[] }) {
  const [open, setOpen] = useState(false);
  const create = useCreateMeasurement(experimentId);
  const defaults = (): FormInput => ({ sampleId: samples[0]?.id ?? "", timestamp: nowForInput(), metric: "", value: NaN, unit: "" });
  const form = useForm<FormInput, unknown, FormOutput>({ resolver: zodResolver(schema), defaultValues: defaults() });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ sampleId, ...values }) => {
    try {
      const m = await create.mutateAsync({ sampleId, body: toMeasurementPayload(values) });
      const sample = samples.find((s) => s.id === sampleId);
      toast.success(`Recorded ${m.metric} = ${formatValue(m.value, m.unit)} for ${sample?.name ?? "sample"}`);
      setOpen(false);
    } catch (err) {
      applyServerErrors(err, form.setError, ["timestamp", "metric", "value", "unit"]);
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset(defaults());
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <PlusIcon aria-hidden />
          Add measurement
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add measurement</DialogTitle>
            <DialogDescription>Record a single reading for one sample.</DialogDescription>
          </DialogHeader>
          {errors.root && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{errors.root.message}</AlertDescription>
            </Alert>
          )}
          <FormField label="Sample" error={errors.sampleId?.message}>
            {(a11y) => (
              <NativeSelect {...a11y} {...form.register("sampleId")}>
                {samples.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField label="Time" error={errors.timestamp?.message} hint="Your local time zone.">
            {(a11y) => <Input {...a11y} type="datetime-local" {...form.register("timestamp")} />}
          </FormField>
          <FormField
            label="Metric"
            error={errors.metric?.message}
            hint="Lowercase identifier, e.g. temperature or dissolved_oxygen."
          >
            {(a11y) => <Input {...a11y} autoCapitalize="none" spellCheck={false} {...form.register("metric")} />}
          </FormField>
          <div className="grid grid-cols-[1fr_8rem] gap-4">
            <FormField label="Value" error={errors.value?.message}>
              {(a11y) => (
                <Input {...a11y} type="number" step="any" inputMode="decimal" {...form.register("value", { valueAsNumber: true })} />
              )}
            </FormField>
            <FormField label="Unit" error={errors.unit?.message}>
              {(a11y) => <Input {...a11y} placeholder="°C" {...form.register("unit")} />}
            </FormField>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save measurement"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
