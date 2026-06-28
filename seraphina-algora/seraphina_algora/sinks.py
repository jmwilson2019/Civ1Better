"""Output sinks: stdout table, JSON, JSONL append.

Mirrors Seraphina's pattern of JSONL append-only logs at ~/.<app>/
for history + memory.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional


HOME_DIR = Path(os.path.expanduser("~")) / ".seraphina-algora"


def ensure_home() -> Path:
    HOME_DIR.mkdir(parents=True, exist_ok=True)
    return HOME_DIR


def to_json(records: Iterable[Dict[str, Any]], *, indent: int = 2) -> str:
    return json.dumps(list(records), indent=indent, sort_keys=True)


def to_table(records: List[Dict[str, Any]]) -> str:
    """Render a fixed-width ranked table for terminals."""
    if not records:
        return "(no bounties matched)"

    headers = ["score", "amount", "slug", "comments", "status", "title"]
    rows: List[List[str]] = []
    for r in records:
        b = r["bounty"]
        v = r["verdict"]
        amount = f"${b.amount_usd:.0f}" if b.amount_usd else "?"
        status = "PASS" if v["consensus"] else "FLAG"
        title = (b.title[:60] + "…") if len(b.title) > 60 else b.title
        rows.append([
            f"{v['score']:.2f}",
            amount,
            b.slug,
            str(b.comments),
            status,
            title,
        ])

    widths = [
        max(len(h), max(len(r[i]) for r in rows))
        for i, h in enumerate(headers)
    ]
    line = "  ".join(h.ljust(widths[i]) for i, h in enumerate(headers))
    sep = "  ".join("-" * widths[i] for i in range(len(headers)))
    body = "\n".join(
        "  ".join(c.ljust(widths[i]) for i, c in enumerate(r)) for r in rows
    )
    return f"{line}\n{sep}\n{body}"


def append_history(record: Dict[str, Any], *, path: Optional[Path] = None) -> Path:
    """Append a JSONL record to the persistent history log."""
    target = path or (ensure_home() / "history.jsonl")
    with target.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, sort_keys=True))
        fh.write("\n")
    return target


def write_json_file(records: List[Dict[str, Any]], path: Path) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(to_json(records), encoding="utf-8")
    return path
