import { useId, type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface FieldA11yProps {
  id: string;
  "aria-invalid": boolean;
  "aria-describedby"?: string;
}

/**
 * Label + control + hint + error, wired together: the label targets the control,
 * and the control is described by the hint and the error message when present.
 */
export function FormField({
  label,
  error,
  hint,
  className,
  children,
}: {
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  className?: string;
  children: (props: FieldA11yProps) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": describedBy })}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
