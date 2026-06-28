"""Seraphina Algora Tracker - lean Python core.

A deterministic, stdlib-only bounty radar that:
- Queries GitHub Search + Algora for bounty-labeled issues
- Scores each result through a triad-style rule pipeline
- Filters out known scam/honeypot/crowded races
- Emits a ranked table or JSON to stdout, file, or sink
"""
from .core import Bounty, FilterTriad, score_bounty
from .rules import DEFAULT_RULES, Rule, RuleResult

__version__ = "0.1.0"
__all__ = [
    "Bounty",
    "FilterTriad",
    "score_bounty",
    "DEFAULT_RULES",
    "Rule",
    "RuleResult",
    "__version__",
]
