import { useCallback, useEffect, useMemo, useState } from "react";
import { Header } from "./components/Header";
import { TreeView } from "./components/TreeView";
import { CirclePack } from "./components/CirclePack";
import type { Meta, OntologyNode, ViewMode } from "./lib/ontology";
import { ancestorsOf, applyImportantOnly, applySources, filterToIssues } from "./lib/ontology";
import { search } from "./lib/search";
import { useMediaQuery } from "./lib/useMediaQuery";
import { useUrlPath } from "./lib/useUrlPath";

function pathExists(root: OntologyNode, path: string): boolean {
  if (!path) return true;
  const segments = path.split("/");
  let node: OntologyNode | undefined = root;
  for (const seg of segments) {
    node = node?.children.find((c) => c.name === seg);
    if (!node) return false;
  }
  return true;
}

export default function App() {
  const [root, setRoot] = useState<OntologyNode | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState<number | null>(null);

  const [urlPath, setUrlPath] = useUrlPath();
  const selectedPath = urlPath;
  const [mode, setMode] = useState<ViewMode>("exploration");
  const [showLiteratur, setShowLiteratur] = useState(true);
  const [showMisc, setShowMisc] = useState(false);
  const [importantOnly, setImportantOnly] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const init = new Set<string>([""]);
    if (urlPath) {
      for (const a of ancestorsOf(urlPath)) init.add(a);
      init.add(urlPath);
    }
    return init;
  });
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const isWide = useMediaQuery("(min-width: 768px)");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let cancelled = false;

    async function loadOntology(): Promise<OntologyNode> {
      const r = await fetch("data/ontology.json");
      if (!r.ok) throw new Error(`ontology.json: ${r.status}`);
      const total = Number(r.headers.get("Content-Length"));
      if (!r.body || !total) {
        return r.json() as Promise<OntologyNode>;
      }
      const reader = r.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (!cancelled) setLoadProgress(Math.min(received / total, 1));
      }
      const buf = new Uint8Array(received);
      let pos = 0;
      for (const c of chunks) {
        buf.set(c, pos);
        pos += c.length;
      }
      return JSON.parse(new TextDecoder().decode(buf)) as OntologyNode;
    }

    Promise.all([
      loadOntology(),
      fetch("data/meta.json").then((r) => {
        if (!r.ok) throw new Error(`meta.json: ${r.status}`);
        return r.json() as Promise<Meta>;
      }),
    ])
      .then(([tree, m]) => {
        if (cancelled) return;
        setRoot(tree);
        setMeta(m);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const displayedRoot = useMemo<OntologyNode | null>(() => {
    if (!root) return null;
    const scoped = applySources(root, showLiteratur, showMisc);
    const modeFiltered =
      mode === "exploration"
        ? scoped
        : filterToIssues(scoped) ?? {
            ...scoped,
            directCount: 0,
            totalCount: 0,
            importantDirectCount: 0,
            importantTotalCount: 0,
            children: [],
          };
    return importantOnly ? applyImportantOnly(modeFiltered) : modeFiltered;
  }, [root, mode, showLiteratur, showMisc, importantOnly]);

  // Re-validate the URL path against the currently-displayed tree. Runs on
  // initial load (when displayedRoot first becomes non-null) and on every
  // mode switch. Clears the URL if the path no longer exists in this view.
  useEffect(() => {
    if (!displayedRoot) return;
    if (urlPath && !pathExists(displayedRoot, urlPath)) {
      setUrlPath("", { replace: true });
    }
  }, [displayedRoot, urlPath, setUrlPath]);

  const searchResult = useMemo(
    () => (displayedRoot ? search(displayedRoot, debouncedQuery) : null),
    [displayedRoot, debouncedQuery]
  );

  // Auto-expand ancestors of search matches whenever the search result changes.
  useEffect(() => {
    if (!searchResult) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const p of searchResult.visible) next.add(p);
      return next;
    });
  }, [searchResult]);

  const toggleExpanded = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const setSelected = useCallback(
    (path: string) => {
      setUrlPath(path);
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const a of ancestorsOf(path)) next.add(a);
        next.add(path);
        return next;
      });
    },
    [setUrlPath]
  );

  // Expand ancestors whenever the selected path changes (from any source:
  // clicks, browser back/forward, direct URL hits).
  useEffect(() => {
    if (!urlPath) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const a of ancestorsOf(urlPath)) next.add(a);
      next.add(urlPath);
      return next;
    });
  }, [urlPath]);

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-lg rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">Failed to load ontology data</p>
          <p className="mt-1 font-mono text-xs">{loadError}</p>
          <p className="mt-2 text-xs">
            Run <code className="rounded bg-red-100 px-1">python3 scripts/build_ontology.py</code>{" "}
            and reload.
          </p>
        </div>
      </div>
    );
  }

  if (!root || !meta || !displayedRoot) {
    const pct = loadProgress == null ? null : Math.round(loadProgress * 100);
    return (
      <div className="flex h-full items-center justify-center">
        <div className="w-64">
          <div className="mb-1 flex justify-between font-mono text-xs text-neutral-500">
            <span>Loading ontology…</span>
            {pct != null && <span>{pct}%</span>}
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
            <div
              className={`h-full bg-amber-500 transition-[width] duration-150 ${
                pct == null ? "animate-pulse" : ""
              }`}
              style={{ width: pct == null ? "100%" : `${pct}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Header
        meta={meta}
        displayedRoot={displayedRoot}
        query={query}
        onQueryChange={setQuery}
        mode={mode}
        onModeChange={setMode}
        showLiteratur={showLiteratur}
        showMisc={showMisc}
        onToggleLiteratur={() => setShowLiteratur((v) => !v)}
        onToggleMisc={() => setShowMisc((v) => !v)}
        importantOnly={importantOnly}
        onToggleImportantOnly={() => setImportantOnly((v) => !v)}
      />
      <main
        className="grid min-h-0 flex-1 grid-rows-1 overflow-hidden"
        style={{ gridTemplateColumns: isWide ? "1fr 1fr" : "1fr" }}
      >
        <section
          className={`min-h-0 overflow-hidden bg-white ${
            isWide ? "border-r border-neutral-200" : ""
          }`}
        >
          <TreeView
            root={displayedRoot}
            expanded={expanded}
            toggleExpanded={toggleExpanded}
            selectedPath={selectedPath}
            setSelected={setSelected}
            searchVisible={searchResult?.visible ?? null}
            searchMatches={searchResult?.matches ?? null}
            mode={mode}
          />
        </section>
        {isWide && (
          <section className="min-h-0 overflow-hidden bg-neutral-50">
            <CirclePack
              root={displayedRoot}
              selectedPath={selectedPath}
              setSelected={setSelected}
              searchVisible={searchResult?.visible ?? null}
              searchMatches={searchResult?.matches ?? null}
            />
          </section>
        )}
      </main>
    </div>
  );
}
