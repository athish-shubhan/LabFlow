import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { getServerQueryClient } from "@/lib/api/server";

/**
 * Hands everything prefetched into this request's server QueryClient to the client
 * cache, so client components render with data on first paint and TanStack Query
 * owns it from then on (refetching, invalidation after mutations).
 */
export function Hydrate({ children }: { children: ReactNode }) {
  return <HydrationBoundary state={dehydrate(getServerQueryClient())}>{children}</HydrationBoundary>;
}
