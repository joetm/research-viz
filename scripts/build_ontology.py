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


IGNORED_DIR_NAMES = frozenset({"venv", "node_modules", "__MACOSX", "__pycache__"})

# Folders whose contents should be promoted to the parent (the folder itself is
# erased from the hierarchy). PDFs and subfolders end up directly under the
# parent topic; subfolders that collide by name with existing siblings are
# merged.
FLATTEN_DIR_NAMES = frozenset({"General, Theory"})


def _reparent(node: dict, parent_path: str, depth: int) -> None:
    node["path"] = (parent_path + "/" + node["name"]) if parent_path else node["name"]
    node["depth"] = depth
    for c in node["children"]:
        _reparent(c, node["path"], depth + 1)


def _mark_low_priority(node: dict) -> None:
    node["lowPriority"] = True
    for c in node["children"]:
        _mark_low_priority(c)


def _merge_or_append(siblings: list[dict], new_node: dict) -> None:
    for existing in siblings:
        if existing["name"] == new_node["name"]:
            existing["directCount"] += new_node["directCount"]
            existing["totalCount"] += new_node["totalCount"]
            for nc in new_node["children"]:
                _merge_or_append(existing["children"], nc)
            return
    siblings.append(new_node)


def flatten_skipped(node: dict) -> None:
    new_children: list[dict] = []
    for c in node["children"]:
        flatten_skipped(c)
        if c["name"] in FLATTEN_DIR_NAMES:
            node["directCount"] += c["directCount"]
            for gc in c["children"]:
                _reparent(gc, node["path"], node["depth"] + 1)
                _merge_or_append(new_children, gc)
        else:
            new_children.append(c)
    node["children"] = new_children


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

    flatten_skipped(nodes[root_abs])

    # Sort children by name at each level and strip internal _abs key.
    def finalize(node: dict) -> dict:
        node["children"].sort(key=lambda c: c["name"])
        node["children"] = [finalize(c) for c in node["children"]]
        node.pop("_abs", None)
        return node

    tree = finalize(nodes[root_abs])

    folder_count = 0
    recomputed_max_depth = 0

    def _stats(n: dict) -> None:
        nonlocal folder_count, recomputed_max_depth
        folder_count += 1
        if n["depth"] > recomputed_max_depth:
            recomputed_max_depth = n["depth"]
        for c in n["children"]:
            _stats(c)

    _stats(tree)

    meta = {
        "root": str(root),
        "extension": ext_lower,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "totalFolders": folder_count,
        "totalMatches": total_matches,
        "maxDepth": recomputed_max_depth,
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
    parser.add_argument(
        "--misc-root",
        default="/home/joppenla/RESEARCH/Misc",
        help="Secondary, less-relevant root grafted in as a 'Misc' node "
        "marked low-priority (default: %(default)s). Skipped if missing.",
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

    misc_root = Path(args.misc_root)
    if misc_root.is_dir():
        print(f"Walking {misc_root} (low-priority) ...", file=sys.stderr)
        misc_tree, misc_meta = build_tree(misc_root, args.ext)
        # Promote Misc's children to top level (no "Misc" wrapper node), marked
        # low-priority; merge any that collide by name with a Literatur sibling.
        for child in misc_tree["children"]:
            _reparent(child, "", 1)
            _mark_low_priority(child)
            _merge_or_append(tree["children"], child)
        tree["children"].sort(key=lambda c: c["name"])
        tree["directCount"] += misc_tree["directCount"]
        tree["totalCount"] += misc_tree["totalCount"]
        meta["miscFolders"] = misc_meta["totalFolders"]
        meta["miscMatches"] = misc_meta["totalMatches"]
        meta["totalFolders"] += misc_meta["totalFolders"]
        meta["totalMatches"] += misc_meta["totalMatches"]
        meta["maxDepth"] = max(meta["maxDepth"], misc_meta["maxDepth"])
    else:
        print(f"note: misc root not found, skipping: {misc_root}", file=sys.stderr)

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
