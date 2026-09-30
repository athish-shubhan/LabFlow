"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
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
import { SAMPLE_STATUSES } from "@/lib/api/types";
import { applyServerErrors } from "@/lib/form-errors";
import { humanize } from "@/lib/format";
import { useCreateSample } from "@/lib/mutations";
import { sampleFormSchema, toSamplePayload, type SampleFormValues } from "@/lib/schemas";

const EMPTY: SampleFormValues = { name: "", type: "", status: "pending" };

export function NewSampleDialog({ experimentId }: { experimentId: string }) {
  const [open, setOpen] = useState(false);
  const create = useCreateSample(experimentId);
  const form = useForm<SampleFormValues>({ resolver: zodResolver(sampleFormSchema), defaultValues: EMPTY });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const sample = await create.mutateAsync(toSamplePayload(values));
      toast.success(`Sample “${sample.name}” added`);
      setOpen(false);
      form.reset(EMPTY);
    } catch (err) {
      applyServerErrors(err, form.setError, ["name", "type", "status"]);
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset(EMPTY);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <PlusIcon aria-hidden />
          New sample
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>New sample</DialogTitle>
            <DialogDescription>Samples hold the measurements taken in this experiment.</DialogDescription>
          </DialogHeader>
          {errors.root && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{errors.root.message}</AlertDescription>
            </Alert>
          )}
          <FormField label="Name" error={errors.name?.message} hint="For example PTA-05.">
            {(a11y) => <Input {...a11y} {...form.register("name")} />}
          </FormField>
          <FormField label="Type" error={errors.type?.message} hint="For example catalyst, resin, broth.">
            {(a11y) => <Input {...a11y} {...form.register("type")} />}
          </FormField>
          <FormField label="Status" error={errors.status?.message}>
            {(a11y) => (
              <NativeSelect {...a11y} {...form.register("status")}>
                {SAMPLE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Adding…" : "Add sample"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
