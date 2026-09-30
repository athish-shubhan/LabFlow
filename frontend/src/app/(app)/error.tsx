"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/states";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorState title="This page could not be loaded" error={error} onRetry={retry} className="mt-8" />;
}
