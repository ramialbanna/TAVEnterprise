export function PagePlaceholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{note}</p>
    </div>
  );
}
