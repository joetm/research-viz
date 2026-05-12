import { useCallback, useEffect, useMemo, useState } from "react";
import { Header } from "./components/Header";
import { TreeView } from "./components/TreeView";
import { CirclePack } from "./components/CirclePack";
import type { Meta, OntologyNode } from "./lib/ontology";
import { ancestorsOf } from "./lib/ontology";
import { search } from "./lib/search";
import { useMediaQuery } from "./lib/useMediaQuery";

export default function App() {
  const [root, setRoot] = useState<OntologyNode | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([""]));
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const isWide = useMediaQuery("(min-width: 768px)");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("data/ontology.json").then((r) => {
        if (!r.ok) throw new Error(`ontology.json: ${r.status}`);
        return r.json() as Promise<OntologyNode>;
      }),
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

  const searchResult = useMemo(
    () => (root ? search(root, debouncedQuery) : null),
    [root, debouncedQuery]
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

  const setSelected = useCallback((path: string) => {
    setSelectedPath(path);
    // Expand ancestors so the selection is visible in the tree.
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const a of ancestorsOf(path)) next.add(a);
      next.add(path);
      return next;
    });
  }, []);

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

  if (!root || !meta) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        Loading ontology…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Header meta={meta} query={query} onQueryChange={setQuery} />
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
            root={root}
            expanded={expanded}
            toggleExpanded={toggleExpanded}
            selectedPath={selectedPath}
            setSelected={setSelected}
            searchVisible={searchResult?.visible ?? null}
            searchMatches={searchResult?.matches ?? null}
          />
        </section>
        {isWide && (
          <section className="min-h-0 overflow-hidden bg-neutral-50">
            <CirclePack
              root={root}
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
