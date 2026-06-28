"""Command-line entry point.

Mirrors Seraphina's CLI conventions: argparse-driven, deterministic, stdlib
only, structured exit codes.

Subcommands:
  scan    - one-shot fetch + score + render
  watch   - loop on interval (Ctrl-C to exit)
  show    - replay the most recent scan record from history
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

from . import __version__
from .core import Bounty, FilterTriad
from .rules import build_rules, DEFAULT_CROWD_CAP
from .sinks import append_history, ensure_home, to_json, to_table, write_json_file
from .sources import fetch_bounties


EXIT_OK = 0
EXIT_NO_RESULTS = 1
EXIT_HTTP_ERROR = 2
EXIT_USAGE = 64


def _bounty_to_dict(b: Bounty) -> Dict[str, Any]:
    if is_dataclass(b):
        return asdict(b)
    return dict(b)  # type: ignore[arg-type]


def _run_scan(args: argparse.Namespace) -> int:
    rules = build_rules(
        crowd_cap=args.crowd_cap,
        include_risky=args.include_risky,
    )
    triad = FilterTriad(rules=rules)

    try:
        bounties = fetch_bounties(query=args.query, per_page=args.limit)
    except urllib.error.HTTPError as exc:
        sys.stderr.write(f"github http error: {exc.code} {exc.reason}\n")
        return EXIT_HTTP_ERROR
    except urllib.error.URLError as exc:
        sys.stderr.write(f"network error: {exc.reason}\n")
        return EXIT_HTTP_ERROR

    records: List[Dict[str, Any]] = []
    for b in bounties:
        verdict = triad.evaluate(b)
        if args.passing_only and not verdict["consensus"]:
            continue
        records.append({"bounty": b, "verdict": verdict})

    # Sort: passing first, then by score desc.
    records.sort(
        key=lambda r: (not r["verdict"]["consensus"], -r["verdict"]["score"])
    )

    if args.json:
        # Serializable form: drop the dataclass into a dict.
        serializable = [
            {"bounty": _bounty_to_dict(r["bounty"]), "verdict": r["verdict"]}
            for r in records
        ]
        out = to_json(serializable)
        if args.output:
            write_json_file(serializable, Path(args.output))
        else:
            print(out)
    else:
        print(to_table(records))

    # Persist a one-line history entry so `show` can replay it.
    if not args.no_history:
        append_history({
            "ts": time.time(),
            "query": args.query,
            "count": len(records),
            "passing": sum(1 for r in records if r["verdict"]["consensus"]),
        })

    return EXIT_OK if records else EXIT_NO_RESULTS


def _run_watch(args: argparse.Namespace) -> int:
    """Re-scan on a fixed interval until interrupted."""
    interval = max(30, args.interval)  # never poll faster than 30s
    sys.stderr.write(
        f"seraphina-algora watch: every {interval}s, Ctrl-C to exit\n"
    )
    try:
        while True:
            rc = _run_scan(args)
            sys.stderr.write(f"-- next scan in {interval}s (last rc={rc}) --\n")
            time.sleep(interval)
    except KeyboardInterrupt:
        sys.stderr.write("interrupted, exiting\n")
        return EXIT_OK


def _run_show(args: argparse.Namespace) -> int:
    """Print the last N entries from the persistent history log."""
    path = ensure_home() / "history.jsonl"
    if not path.exists():
        sys.stderr.write("no history yet; run `seraphina-algora scan` first\n")
        return EXIT_NO_RESULTS
    lines = path.read_text(encoding="utf-8").splitlines()
    tail = lines[-args.tail:] if args.tail > 0 else lines
    for line in tail:
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        ts = entry.get("ts", 0)
        print(f"{ts:.0f}\tcount={entry.get('count')}\tpassing={entry.get('passing')}\tq={entry.get('query')}")
    return EXIT_OK


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="seraphina-algora",
        description="Deterministic bounty radar for the Algora platform.",
    )
    parser.add_argument(
        "--version", action="version", version=f"seraphina-algora {__version__}",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    # Shared options for scan + watch (both fetch and score).
    shared = argparse.ArgumentParser(add_help=False)
    shared.add_argument(
        "-q", "--query",
        default='label:"💎 Bounty" state:open',
        help="GitHub Search query (default: label:\"💎 Bounty\" state:open)",
    )
    shared.add_argument(
        "-n", "--limit", type=int, default=30,
        help="max results to fetch per page (1-100, default 30)",
    )
    shared.add_argument(
        "--crowd-cap", type=int, default=DEFAULT_CROWD_CAP,
        help=f"reject bounties with more comments than this (default {DEFAULT_CROWD_CAP})",
    )
    shared.add_argument(
        "--include-risky", action="store_true",
        help="show known-scam / honeypot / prompt-injection bounties (default: filter them out)",
    )
    shared.add_argument(
        "--passing-only", action="store_true",
        help="suppress flagged rows; only show bounties that pass the triad",
    )
    shared.add_argument(
        "--json", action="store_true",
        help="emit JSON instead of the table",
    )
    shared.add_argument(
        "-o", "--output",
        help="write JSON to this file (implies --json)",
    )
    shared.add_argument(
        "--no-history", action="store_true",
        help="don't append a record to ~/.seraphina-algora/history.jsonl",
    )

    # ---- scan
    p_scan = sub.add_parser(
        "scan",
        parents=[shared],
        help="one-shot fetch + score + render",
    )
    p_scan.set_defaults(func=_run_scan)

    # ---- watch
    p_watch = sub.add_parser(
        "watch",
        parents=[shared],
        help="rescan on a fixed interval",
    )
    p_watch.add_argument(
        "-i", "--interval", type=int, default=300,
        help="seconds between scans (minimum 30, default 300)",
    )
    p_watch.set_defaults(func=_run_watch)

    # ---- show
    p_show = sub.add_parser("show", help="replay recent scan history")
    p_show.add_argument(
        "--tail", type=int, default=10,
        help="number of recent entries to print (default 10, 0 = all)",
    )
    p_show.set_defaults(func=_run_show)

    return parser


def main(argv: Optional[List[str]] = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    if not hasattr(args, "func"):
        parser.print_help()
        return EXIT_USAGE
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
