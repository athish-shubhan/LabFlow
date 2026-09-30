"use client";

import { useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";

/**
 * <input type="date"> for filters that update live. Typing a year digit by digit makes
 * the browser report intermediate dates like 0002-09-25; those stay local and only a
 * cleared field or a plausible date (year >= 1900) is committed via onCommit.
 */
export function DateFilterInput({
  value,
  onCommit,
  ...props
}: Omit<ComponentProps<"input">, "value" | "onChange" | "type"> & { value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    // The committed value changed from outside (e.g. Reset): show it.
    setLastValue(value);
    setDraft(value);
  }
  return (
    <Input
      {...props}
      type="date"
      value={draft}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        if (next === "" || Number(next.slice(0, 4)) >= 1900) onCommit(next);
      }}
    />
  );
}
