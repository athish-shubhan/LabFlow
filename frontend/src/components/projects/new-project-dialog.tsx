"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { Textarea } from "@/components/ui/textarea";
import { applyServerErrors } from "@/lib/form-errors";
import { useCreateProject } from "@/lib/mutations";

const projectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200, "Name must be at most 200 characters"),
  description: z.string().trim().max(5000, "Description must be at most 5000 characters"),
});
type ProjectValues = z.infer<typeof projectSchema>;

export function NewProjectDialog({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const create = useCreateProject(orgId);
  const form = useForm<ProjectValues>({ resolver: zodResolver(projectSchema), defaultValues: { name: "", description: "" } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const project = await create.mutateAsync({ name: values.name, description: values.description || null });
      toast.success(`Project “${project.name}” created`);
      setOpen(false);
      form.reset();
      router.refresh(); // the sidebar project list is server-rendered
    } catch (err) {
      applyServerErrors(err, form.setError, ["name", "description"]);
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <PlusIcon aria-hidden />
          New project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>Projects group related experiments.</DialogDescription>
          </DialogHeader>
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
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
