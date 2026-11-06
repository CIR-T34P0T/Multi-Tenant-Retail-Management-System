export function AuthHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-5 space-y-1">
      <h1 className="text-xl font-semibold">{title}</h1>
      {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
    </div>
  );
}
