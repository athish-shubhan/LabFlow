"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginSchema, type LoginValues } from "@/lib/schemas";
import { login } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [pending, startTransition] = useTransition();
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = await login(values, next);
      // On success the action redirects and never returns.
      if (result) {
        for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
          if (message) form.setError(field as keyof LoginValues, { message });
        }
        form.setError("root", { message: result.error });
      }
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4" aria-describedby={errors.root ? "login-error" : undefined}>
      {errors.root && (
        <Alert variant="destructive" id="login-error" role="alert">
          <AlertDescription>{errors.root.message}</AlertDescription>
        </Alert>
      )}
      <FormField label="Email" error={errors.email?.message}>
        {(a11y) => <Input {...a11y} type="email" autoComplete="email" {...form.register("email")} />}
      </FormField>
      <FormField label="Password" error={errors.password?.message}>
        {(a11y) => <Input {...a11y} type="password" autoComplete="current-password" {...form.register("password")} />}
      </FormField>
      <Button type="submit" size="lg" disabled={pending}>
        {pending && <Loader2Icon className="animate-spin" aria-hidden />}
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
