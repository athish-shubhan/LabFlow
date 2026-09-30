import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 px-4 text-center">
      <h1 className="text-lg font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">There is nothing at this address.</p>
      <Link href="/" className="text-sm underline">
        Go to the dashboard
      </Link>
    </main>
  );
}
