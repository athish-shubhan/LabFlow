"use client";

import { useQuery } from "@tanstack/react-query";
import { ArchiveIcon, PencilIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { LocalTime } from "@/components/local-time";
import { ErrorState } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { browserApi } from "@/lib/api/browser";
import type { Experiment } from "@/lib/api/types";
import { formatCount, formatDate } from "@/lib/format";
import { useArchiveExperiment, useUpdateExperiment } from "@/lib/mutations";
import { queries } from "@/lib/queries";
import { toExperimentPayload } from "@/lib/schemas";
import { ExperimentForm, experimentToFormValues } from "./experiment-form";

export function ExperimentDetails({ experimentId }: { experimentId: string }) {
  const { data: experiment, isError, error, refetch } = useQuery(queries.experiment(browserApi, experimentId));

  if (isError) return <ErrorState title="Couldn't load experiment" error={error} onRetry={() => refetch()} />;
  if (!experiment) return null; // hydrated by the layout; never pending in practice

  return (
    <Card className="self-start">
      <CardHeader>
        <CardTitle>
          <h2>Details</h2>
        </CardTitle>
        <CardAction className="flex gap-1">
          <EditExperimentDialog experiment={experiment} />
          <ArchiveExperimentDialog experiment={experiment} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2.5 text-sm">
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            <StatusBadge status={experiment.status} />
          </dd>
          <dt className="text-muted-foreground">Owner</dt>
          <dd>{experiment.owner?.name ?? "—"}</dd>
          <dt className="text-muted-foreground">Start date</dt>
          <dd className="tabular">{formatDate(experiment.start_date)}</dd>
          <dt className="text-muted-foreground">End date</dt>
          <dd className="tabular">{formatDate(experiment.end_date)}</dd>
          <dt className="text-muted-foreground">Samples</dt>
          <dd className="tabular">{formatCount(experiment.sample_count)}</dd>
          <dt className="text-muted-foreground">Updated</dt>
          <dd>
            <LocalTime value={experiment.updated_at} relative />
          </dd>
          <dt className="col-span-2 text-muted-foreground">Description</dt>
          <dd className="col-span-2 whitespace-pre-line">{experiment.description || "No description."}</dd>
        </dl>
      </CardContent>
    </Card>
  );
}

function EditExperimentDialog({ experiment }: { experiment: Experiment }) {
  const [open, setOpen] = useState(false);
  const update = useUpdateExperiment(experiment.id);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <PencilIcon aria-hidden />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit experiment</DialogTitle>
          <DialogDescription>Changes are saved to the experiment immediately.</DialogDescription>
        </DialogHeader>
        {open && (
          <ExperimentForm
            defaultValues={experimentToFormValues(experiment)}
            submitLabel="Save changes"
            onSubmit={async (values) => {
              await update.mutateAsync(toExperimentPayload(values));
              toast.success("Experiment updated");
              setOpen(false);
            }}
            footer={
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
            }
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ArchiveExperimentDialog({ experiment }: { experiment: Experiment }) {
  const [open, setOpen] = useState(false);
  const archive = useArchiveExperiment(experiment.id);
  const archived = experiment.status === "archived";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={archived} title={archived ? "Already archived" : undefined}>
          <ArchiveIcon aria-hidden />
          {archived ? "Archived" : "Archive"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive “{experiment.name}”?</DialogTitle>
          <DialogDescription>
            The experiment is marked as archived. Its samples and measurement history are kept, and you can change the
            status back later from Edit.
          </DialogDescription>
        </DialogHeader>
        {archive.isError && (
          <p role="alert" className="text-sm text-destructive">
            {archive.error.message}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={archive.isPending}
            onClick={() =>
              archive.mutate(undefined, {
                onSuccess: () => {
                  toast.success("Experiment archived");
                  setOpen(false);
                },
              })
            }
          >
            {archive.isPending ? "Archiving…" : "Archive experiment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
