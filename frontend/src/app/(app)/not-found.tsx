import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mt-8 flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center">
      <h1 className="text-lg font-semibold">Not found</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        This item doesn&apos;t exist, or it belongs to a workspace you don&apos;t have access to.
      </p>
      <Button asChild variant="outline" size="sm" className="mt-2">
        <Link href="/">Back to dashboard</Link>
      </Button>
    </div>
  );
}
