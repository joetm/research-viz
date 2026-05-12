#!/usr/bin/env python3
"""Walk a research folder tree and emit ontology JSON for visualization.

Produces:
  <out>/ontology.json   — hierarchical tree of folders with PDF counts
  <out>/meta.json       — totals + generation timestamp
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path


IGNORED_DIR_NAMES = frozenset({"venv", "node_modules", "__MACOSX"})


def build_tree(root: Path, ext: str) -> tuple[dict, dict]:
    ext_lower = ext.lower().lstrip(".")
    suffix = "." + ext_lower

    nodes: dict[str, dict] = {}
    max_depth = 0
    total_matches = 0

    root_abs = str(root.resolve())

    for dirpath, dirnames, filenames in os.walk(root_abs, topdown=True, followlinks=False):
        is_repo = ".git" in dirnames
        if is_repo:
            dirnames[:] = []
            direct_count = 1
        else:
            dirnames[:] = sorted(
                d for d in dirnames
                if not d.startswith(".") and d not in IGNORED_DIR_NAMES
            )
            try:
                direct_count = sum(1 for f in filenames if f.lower().endswith(suffix))
            except OSError as e:
                print(f"warn: error reading {dirpath}: {e}", file=sys.stderr)
                direct_count = 0

        rel = os.path.relpath(dirpath, root_abs)
        if rel == ".":
            rel = ""
            depth = 0
            name = root.name
        else:
            depth = rel.count(os.sep) + 1
            name = os.path.basename(dirpath)

        total_matches += direct_count
        if depth > max_depth:
            max_depth = depth

        nodes[dirpath] = {
            "name": name,
            "path": rel.replace(os.sep, "/") if rel else "",
            "depth": depth,
            "directCount": direct_count,
            "totalCount": 0,  # filled in post-order pass
            "children": [],
            "_abs": dirpath,
        }

    # Attach children by sorting absolute paths so parents are processed before children.
    # Walk in reverse-sorted order so post-order totalCount accumulation works in one pass.
    for abs_path in sorted(nodes.keys(), key=lambda p: p.count(os.sep), reverse=True):
        node = nodes[abs_path]
        parent_abs = os.path.dirname(abs_path)
        node["totalCount"] += node["directCount"]
        if abs_path == root_abs:
            continue
        parent = nodes.get(parent_abs)
        if parent is None:
            continue
        parent["children"].append(node)
        parent["totalCount"] += node["totalCount"]

    # Sort children by name at each level and strip internal _abs key.
    def finalize(node: dict) -> dict:
        node["children"].sort(key=lambda c: c["name"])
        node["children"] = [finalize(c) for c in node["children"]]
        node.pop("_abs", None)
        return node

    tree = finalize(nodes[root_abs])

    meta = {
        "root": str(root),
        "extension": ext_lower,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "totalFolders": len(nodes),
        "totalMatches": total_matches,
        "maxDepth": max_depth,
    }

    return tree, meta


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        default="/home/joppenla/RESEARCH/Literatur",
        help="Root directory to walk (default: %(default)s)",
    )
    parser.add_argument(
        "--out",
        default=str(Path(__file__).resolve().parent.parent / "public" / "data"),
        help="Output directory (default: ../public/data relative to this script)",
    )
    parser.add_argument(
        "--ext",
        default="pdf",
        help="File extension to count, without dot (default: %(default)s)",
    )
    args = parser.parse_args()

    root = Path(args.root)
    out_dir = Path(args.out)
    if not root.is_dir():
        print(f"error: root is not a directory: {root}", file=sys.stderr)
        return 1
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"Walking {root} ...", file=sys.stderr)
    tree, meta = build_tree(root, args.ext)

    ontology_path = out_dir / "ontology.json"
    meta_path = out_dir / "meta.json"

    with ontology_path.open("w", encoding="utf-8") as f:
        json.dump(tree, f, ensure_ascii=False, indent=2)
    with meta_path.open("w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    print(
        f"Wrote {ontology_path} ({ontology_path.stat().st_size:,} bytes)\n"
        f"      {meta_path}\n"
        f"  folders: {meta['totalFolders']:,}\n"
        f"  {args.ext}s:    {meta['totalMatches']:,}\n"
        f"  max depth: {meta['maxDepth']}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
