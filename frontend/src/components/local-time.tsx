"use client";

import { formatDateTime, formatRelative } from "@/lib/format";

/**
 * Timestamps are rendered in the viewer's time zone. Server Components can render this
 * too; the server's text (server time zone) is replaced on hydration, hence
 * suppressHydrationWarning.
 */
export function LocalTime({ value, relative = false }: { value: string; relative?: boolean }) {
  return (
    <time dateTime={value} title={relative ? formatDateTime(value) : undefined} suppressHydrationWarning>
      {relative ? formatRelative(value) : formatDateTime(value)}
    </time>
  );
}
