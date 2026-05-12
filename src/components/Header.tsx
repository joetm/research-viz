import type { Meta } from "../lib/ontology";

function formatCollectedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type Props = {
  meta: Meta | null;
  query: string;
  onQueryChange: (q: string) => void;
};

export function Header({ meta, query, onQueryChange }: Props) {
  return (
    <header className="flex items-center gap-6 border-b border-neutral-200 bg-white px-6 py-3">
      <div className="flex items-baseline gap-3">
        <h1 className="text-base font-semibold tracking-tight">jonaso's research viz</h1>
        {meta && (
          <span className="font-mono text-xs text-neutral-500">
            Literatur · {meta.totalFolders.toLocaleString()} folders ·{" "}
            {meta.totalMatches.toLocaleString()} PDFs · collected{" "}
            {formatCollectedAt(meta.generatedAt)}
          </span>
        )}
      </div>
      <div className="ml-auto relative">
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onQueryChange("");
          }}
          placeholder="filter folders…"
          className="w-72 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>
    </header>
  );
}
