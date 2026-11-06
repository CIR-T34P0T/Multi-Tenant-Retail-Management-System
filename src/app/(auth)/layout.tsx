import { Store } from "lucide-react";
import { APP_FULL_NAME, APP_NAME } from "@/lib/app-config";

/** Centered card layout for sign-in, sign-up and password screens. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="bg-muted/40 flex min-h-svh flex-col items-center justify-center p-4">
      <div className="mb-6 flex items-center gap-2">
        <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg">
          <Store className="size-5" />
        </span>
        <span className="text-lg font-semibold" title={APP_FULL_NAME}>
          {APP_NAME}
        </span>
      </div>
      <div className="bg-card w-full max-w-sm rounded-xl border p-6 shadow-sm">{children}</div>
    </main>
  );
}
