function formatHeading(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Renders nested analytics / insight objects as readable sections (no JSON).
 */
export function StructuredInsight({
  data,
  title,
  depth = 0,
}: {
  data: unknown;
  title?: string;
  depth?: number;
}) {
  if (data === null || data === undefined) return null;

  if (typeof data === "string" || typeof data === "number" || typeof data === "boolean") {
    return (
      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
        {String(data)}
      </p>
    );
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return null;
    const allPrimitive = data.every(
      (x) => x === null || ["string", "number", "boolean"].includes(typeof x)
    );
    if (allPrimitive) {
      return (
        <ul className="list-disc pl-5 space-y-1.5 text-sm text-slate-700">
          {data.map((item, i) => (
            <li key={i} className="leading-relaxed">
              {item === null || item === undefined ? "—" : String(item)}
            </li>
          ))}
        </ul>
      );
    }
    return (
      <div className="space-y-4">
        {title && depth === 0 && (
          <h4 className="text-sm font-semibold text-slate-900 font-display">{title}</h4>
        )}
        {data.map((item, i) => (
          <div
            key={i}
            className="rounded-xl border border-slate-200/80 bg-white/60 px-4 py-3 shadow-sm"
          >
            <StructuredInsight data={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  if (!isPlainObject(data)) return null;

  const entries = Object.entries(data);
  if (entries.length === 0) return null;

  return (
    <div className={depth === 0 ? "space-y-5" : "space-y-3"}>
      {title && depth === 0 && (
        <h4 className="text-base font-semibold text-slate-900 font-display tracking-tight">
          {title}
        </h4>
      )}
      {entries.map(([key, value]) => {
        if (value === null || value === undefined) return null;
        return (
          <section key={key} className="group">
            <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              {formatHeading(key)}
            </h5>
            <div className="pl-0 border-l-2 border-indigo-200/90 pl-4 ml-0.5">
              {Array.isArray(value) || isPlainObject(value) ? (
                <StructuredInsight data={value} depth={depth + 1} />
              ) : (
                <p className="text-sm text-slate-700 leading-relaxed">{String(value)}</p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
