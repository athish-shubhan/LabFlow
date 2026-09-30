"use client";

import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ExperimentForm, experimentToFormValues } from "@/components/experiments/experiment-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useCreateExperiment } from "@/lib/mutations";
import { toExperimentPayload } from "@/lib/schemas";

export function NewExperimentDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const create = useCreateExperiment(projectId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon aria-hidden />
          New experiment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New experiment</DialogTitle>
          <DialogDescription>You will be recorded as the owner.</DialogDescription>
        </DialogHeader>
        {/* Remounts on open, so the form always starts empty. */}
        {open && (
          <ExperimentForm
            defaultValues={experimentToFormValues()}
            allowArchivedStatus={false}
            submitLabel="Create experiment"
            onSubmit={async (values) => {
              const experiment = await create.mutateAsync(toExperimentPayload(values));
              toast.success(`Experiment “${experiment.name}” created`);
              setOpen(false);
              router.push(`/experiments/${experiment.id}`);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
