import { Lock } from "lucide-react";

export function ReadOnlyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground bg-muted flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
      <Lock className="size-4 shrink-0" /> {children}
    </p>
  );
}
