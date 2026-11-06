import { Suspense } from "react";
import { LogOut, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { APP_NAME } from "@/lib/app-config";
import { signOut } from "@/modules/core/auth/actions";

/** Simple layout for screens shown before a business is chosen. */
export default function SetupLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="bg-muted/40 min-h-svh">
      <header className="bg-background flex h-14 items-center gap-2 border-b px-4">
        <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
          <Store className="size-4" />
        </span>
        <span className="font-semibold">{APP_NAME}</span>
        <form action={signOut} className="ml-auto">
          <Button variant="ghost" className="h-11 md:h-9">
            <LogOut /> Sign out
          </Button>
        </form>
      </header>
      <main className="mx-auto w-full max-w-2xl p-4 md:p-8">
        <Suspense
          fallback={
            <div className="flex justify-center p-10">
              <Spinner className="size-6" />
            </div>
          }
        >
          {children}
        </Suspense>
      </main>
    </div>
  );
}
