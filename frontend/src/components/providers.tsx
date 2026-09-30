"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError } from "@/lib/api/client";

function redirectIfUnauthorized(error: unknown) {
  if (error instanceof ApiError && error.isUnauthorized) {
    window.location.assign("/auth/signout?reason=expired");
  }
}

export function makeQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({ onError: redirectIfUnauthorized }),
    mutationCache: new MutationCache({ onError: redirectIfUnauthorized }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Client errors (4xx) won't fix themselves; only retry network/server failures.
        retry: (failureCount, error) =>
          failureCount < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
      <Toaster position="bottom-right" />
    </QueryClientProvider>
  );
}
