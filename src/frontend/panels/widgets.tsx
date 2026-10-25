import type { ReactNode } from "react";

export function Usage({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | null;
  detail: string;
}) {
  return (
    <div className="flex flex-col gap-1 border border-border p-2.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="shrink-0 whitespace-nowrap text-muted-foreground">
          {label}
        </span>
        <span className="font-medium tabular-nums">
          {value === null ? "-" : `${value.toFixed(1)}%`}
        </span>
      </div>
      <div className="h-1.5 bg-muted">
        <div
          className="h-full bg-accent-brand transition-[width]"
          style={{ width: `${Math.min(100, value ?? 0)}%` }}
        />
      </div>
      <span className="text-[11px] tabular-nums text-muted-foreground">
        {detail}
      </span>
    </div>
  );
}

export function Fact({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 py-1.5 text-xs">
      <span className="shrink-0 whitespace-nowrap text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 truncate text-right">{children}</span>
    </div>
  );
}

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        <div className="ml-auto">{action}</div>
      </div>
      {children}
    </section>
  );
}

/** Output of a tool, like ping, as WinBox's result list. */
export function ResultTable({
  columns,
  rows,
  empty,
}: {
  columns: Array<{
    key: string;
    label: string;
    render?: (row: Record<string, string>) => ReactNode;
  }>;
  rows: Array<Record<string, string>>;
  empty: string;
}) {
  return (
    <div className="overflow-auto border border-border">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 bg-muted">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className="whitespace-nowrap border-b border-border px-2 py-1 text-left font-medium text-muted-foreground"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-2 py-3 text-muted-foreground"
              >
                {empty}
              </td>
            </tr>
          )}
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/50">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className="whitespace-nowrap px-2 py-1 font-mono"
                >
                  {c.render ? c.render(row) : (row[c.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
