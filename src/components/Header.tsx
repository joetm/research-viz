import type { Meta, ViewMode } from "../lib/ontology";

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
  mode: ViewMode;
  onModeChange: (m: ViewMode) => void;
  showLiteratur: boolean;
  showMisc: boolean;
  onToggleLiteratur: () => void;
  onToggleMisc: () => void;
};

export function Header({
  meta,
  query,
  onQueryChange,
  mode,
  onModeChange,
  showLiteratur,
  showMisc,
  onToggleLiteratur,
  onToggleMisc,
}: Props) {
  const miscFolders = meta?.miscFolders ?? 0;
  const miscMatches = meta?.miscMatches ?? 0;
  const folders = meta
    ? (showLiteratur ? meta.totalFolders - miscFolders : 0) +
      (showMisc ? miscFolders : 0)
    : 0;
  const matches = meta
    ? (showLiteratur ? meta.totalMatches - miscMatches : 0) +
      (showMisc ? miscMatches : 0)
    : 0;
  const sourceClass = (active: boolean) =>
    active
      ? "cursor-pointer hover:text-neutral-800"
      : "cursor-pointer text-neutral-300 hover:text-neutral-500";
  return (
    <header className="flex items-center gap-6 border-b border-neutral-200 bg-white px-6 py-3">
      <div className="flex items-baseline gap-3">
        <h1 className="text-base font-semibold tracking-tight">jonaso's research viz</h1>
        {meta && (
          <span className="font-mono text-xs text-neutral-500">
            <button
              type="button"
              onClick={onToggleLiteratur}
              className={sourceClass(showLiteratur)}
              aria-pressed={showLiteratur}
            >
              Literatur
            </button>
            <button
              type="button"
              onClick={onToggleMisc}
              className={sourceClass(showMisc)}
              aria-pressed={showMisc}
            >
              +Misc
            </button>{" "}
            · {folders.toLocaleString()} folders · {matches.toLocaleString()} PDFs ·
            collected {formatCollectedAt(meta.generatedAt)}
          </span>
        )}
        <div
          className="ml-1 inline-flex items-center rounded-md border border-neutral-200 bg-neutral-50 p-0.5 text-xs"
          role="group"
          aria-label="View mode"
        >
          <button
            type="button"
            onClick={() => onModeChange("exploration")}
            className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 transition-colors ${
              mode === "exploration"
                ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200 cursor-default"
                : "text-neutral-500 hover:text-neutral-800 cursor-pointer"
            }`}
            aria-pressed={mode === "exploration"}
          >
            <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            Concepts
          </button>
          <button
            type="button"
            onClick={() => onModeChange("issues")}
            className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 transition-colors ${
              mode === "issues"
                ? "bg-amber-50 text-amber-900 ring-1 ring-amber-200 cursor-default"
                : "text-neutral-500 hover:text-neutral-800 cursor-pointer"
            }`}
            aria-pressed={mode === "issues"}
          >
            <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-amber-500" />
            Issues
          </button>
        </div>
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
