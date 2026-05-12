import { useCallback, useEffect, useState } from "react";

function readHash(): string {
  const raw = window.location.hash.replace(/^#\/?/, "");
  if (!raw) return "";
  return raw
    .split("/")
    .map((seg) => {
      try {
        return decodeURIComponent(seg);
      } catch {
        return seg;
      }
    })
    .filter((seg) => seg.length > 0)
    .join("/");
}

function currentUrl(): string {
  return window.location.pathname + window.location.search + window.location.hash;
}

function targetUrl(path: string): string {
  const base = window.location.pathname + window.location.search;
  if (!path) return base;
  return base + "#/" + path.split("/").map(encodeURIComponent).join("/");
}

export type SetUrlPath = (path: string, opts?: { replace?: boolean }) => void;

export function useUrlPath(): [string, SetUrlPath] {
  const [path, setPath] = useState<string>(() => readHash());

  useEffect(() => {
    const onChange = () => setPath(readHash());
    window.addEventListener("popstate", onChange);
    window.addEventListener("hashchange", onChange);
    return () => {
      window.removeEventListener("popstate", onChange);
      window.removeEventListener("hashchange", onChange);
    };
  }, []);

  const set = useCallback<SetUrlPath>((next, opts) => {
    const target = targetUrl(next);
    if (currentUrl() !== target) {
      if (opts?.replace) {
        window.history.replaceState(null, "", target);
      } else {
        window.history.pushState(null, "", target);
      }
    }
    setPath(next);
  }, []);

  return [path, set];
}
