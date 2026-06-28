"""Core data model + scoring kernel.

Patterned after Seraphina's RomanWheelTriad: each bounty is scored by three
independent "wheels" whose outputs are combined into a deterministic verdict.

  geometric_wheel:   structural / metadata sanity (the issue + repo themselves)
  verification_wheel: cross-checks against known-bad signals (scams, honeypots)
  mercy_civ_wheel:   competition + winnability (assignees, crowd size, age)

A bounty passes the triad iff all three wheels return ok=True. The
combined score is a float in [0.0, 1.0] suitable for sorting.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass(frozen=True)
class Bounty:
    """Normalized bounty record from any upstream source."""

    source: str                  # "github" | "algora"
    owner: str
    repo: str
    number: int
    title: str
    url: str
    amount_usd: Optional[float]  # None if unknown / non-USD
    labels: tuple = ()
    state: str = "open"
    assignees: tuple = ()
    comments: int = 0
    created_at: str = ""
    updated_at: str = ""
    repo_description: str = ""
    repo_stars: int = 0
    language: str = ""
    body: str = ""
    extra: Dict[str, Any] = field(default_factory=dict)

    @property
    def slug(self) -> str:
        return f"{self.owner}/{self.repo}#{self.number}"

    def fingerprint(self) -> str:
        """Stable SHA256 ID for dedup / persistence."""
        raw = f"{self.source}|{self.slug}|{self.url}".encode("utf-8")
        return hashlib.sha256(raw).hexdigest()[:16]


@dataclass
class FilterTriad:
    """Three-wheel consensus filter, mirrors Seraphina's RomanWheelTriad."""

    rules: List[Any]  # list of Rule objects (forward-declared to avoid import cycle)

    def evaluate(self, bounty: Bounty) -> Dict[str, Any]:
        wheel_results: List[Dict[str, Any]] = []
        all_pass = True
        score_accum = 0.0
        weight_accum = 0.0
        flags: List[str] = []

        for rule in self.rules:
            result = rule.check(bounty)
            wheel_results.append({
                "name": rule.name,
                "wheel": rule.wheel,
                "ok": result.ok,
                "score": result.score,
                "weight": rule.weight,
                "reason": result.reason,
            })
            if not result.ok:
                all_pass = False
                flags.append(f"{rule.name}: {result.reason}")
            score_accum += result.score * rule.weight
            weight_accum += rule.weight

        normalized = score_accum / weight_accum if weight_accum else 0.0

        return {
            "slug": bounty.slug,
            "fingerprint": bounty.fingerprint(),
            "consensus": all_pass,
            "score": round(normalized, 4),
            "flags": flags,
            "wheels": wheel_results,
        }


def score_bounty(bounty: Bounty, rules: Optional[List[Any]] = None) -> Dict[str, Any]:
    """Convenience: score one bounty against the default ruleset."""
    if rules is None:
        from .rules import DEFAULT_RULES
        rules = DEFAULT_RULES
    return FilterTriad(rules=rules).evaluate(bounty)
