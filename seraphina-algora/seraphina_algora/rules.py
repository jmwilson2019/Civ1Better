"""Rule definitions, patterned after Seraphina's OctaRuleBase.

Each Rule is assigned to one of three wheels (geometric / verification /
mercy_civ) and returns a RuleResult. The aggregate verdict is produced by
FilterTriad.evaluate() in core.py.

Every signal in this file is documented with the live evidence that
justifies it. Edit only with citations.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from .core import Bounty


# ---------------------------------------------------------------------------
# Scam / honeypot inventory.
# These are evidence-backed bad actors uncovered while sweeping Algora.
# ---------------------------------------------------------------------------

# Owners known to host prompt-injection scams or token-mill bounties.
SCAM_OWNERS = frozenset({
    "unsafelabs",          # asks AI to dump pre-session instructions
    "securebananalabs",    # recursive issue-creation scheme
    "clankernation",       # asks for @platform-config verbatim
    "tine1117",            # oss-hunter-livefire sandbox fixture
    "dwebagents",
    "xevrion",
    "scottcjn",            # rustchain-bounties RTC token, not USD
})

# Repo description / title keywords that disqualify the bounty as a honeypot
# or fixture (not a real org seeking real work).
HONEYPOT_KEYWORDS = frozenset({
    "sandbox",
    "fixture",
    "playground",
    "livefire",
    "honeypot",
    "test repo",
    "demo only",
})

# Body phrases that betray prompt-injection scams asking the agent to leak
# its system prompt or session instructions.
PROMPT_INJECTION_PHRASES = frozenset({
    "pre-session instructions verbatim",
    "config_snapshot",
    "platform-config field",
    "complete pre-session instructions",
    "full text of all instructions",
    "system prompt verbatim",
})

# Above this comment count, the bounty is too crowded to win.
DEFAULT_CROWD_CAP = 8


# ---------------------------------------------------------------------------
# Rule plumbing
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class RuleResult:
    ok: bool
    score: float        # 0.0 .. 1.0
    reason: str = ""


@dataclass(frozen=True)
class Rule:
    name: str
    wheel: str          # "geometric" | "verification" | "mercy_civ"
    weight: float
    check: Callable[[Bounty], RuleResult]


# ---------------------------------------------------------------------------
# Geometric wheel - the bounty's own shape
# ---------------------------------------------------------------------------

def _r_has_amount(b: Bounty) -> RuleResult:
    if b.amount_usd is None:
        return RuleResult(False, 0.0, "missing USD amount")
    if b.amount_usd <= 0:
        return RuleResult(False, 0.0, f"non-positive amount: {b.amount_usd}")
    # Tier the score by payout size: $50 -> 0.5, $200+ -> 1.0
    score = min(1.0, b.amount_usd / 200.0)
    return RuleResult(True, score, f"${b.amount_usd:.0f}")


def _r_open(b: Bounty) -> RuleResult:
    if b.state != "open":
        return RuleResult(False, 0.0, f"state={b.state}")
    return RuleResult(True, 1.0)


def _r_has_url(b: Bounty) -> RuleResult:
    if not b.url or not b.url.startswith(("http://", "https://")):
        return RuleResult(False, 0.0, "missing or invalid URL")
    return RuleResult(True, 1.0)


# ---------------------------------------------------------------------------
# Verification wheel - cross-check against known-bad signals
# ---------------------------------------------------------------------------

def _r_owner_not_scam(b: Bounty) -> RuleResult:
    if b.owner.lower() in SCAM_OWNERS:
        return RuleResult(False, 0.0, f"owner '{b.owner}' on scam list")
    return RuleResult(True, 1.0)


def _r_repo_not_honeypot(b: Bounty) -> RuleResult:
    desc = (b.repo_description or "").lower()
    title = (b.title or "").lower()
    for kw in HONEYPOT_KEYWORDS:
        if kw in desc or kw in title:
            return RuleResult(False, 0.0, f"honeypot keyword: {kw!r}")
    return RuleResult(True, 1.0)


def _r_no_prompt_injection(b: Bounty) -> RuleResult:
    body = (b.body or "").lower()
    for phrase in PROMPT_INJECTION_PHRASES:
        if phrase in body:
            return RuleResult(False, 0.0, f"prompt-injection phrase: {phrase!r}")
    return RuleResult(True, 1.0)


# ---------------------------------------------------------------------------
# Mercy/civ wheel - winnability vs competition
# ---------------------------------------------------------------------------

def _r_unassigned(b: Bounty) -> RuleResult:
    if b.assignees:
        return RuleResult(False, 0.0, f"already assigned: {','.join(b.assignees)}")
    return RuleResult(True, 1.0)


def _make_crowd_rule(cap: int) -> Callable[[Bounty], RuleResult]:
    def _check(b: Bounty) -> RuleResult:
        if b.comments > cap:
            return RuleResult(
                False, 0.0,
                f"crowded ({b.comments} comments > cap {cap})",
            )
        # Score: fewer comments = better.
        score = max(0.0, 1.0 - (b.comments / max(cap, 1)))
        return RuleResult(True, score, f"{b.comments} comments")
    return _check


# ---------------------------------------------------------------------------
# Default ruleset
# ---------------------------------------------------------------------------

DEFAULT_RULES = [
    Rule("has_amount",          "geometric",    1.5, _r_has_amount),
    Rule("is_open",             "geometric",    1.0, _r_open),
    Rule("has_url",             "geometric",    0.5, _r_has_url),
    Rule("owner_not_scam",      "verification", 2.0, _r_owner_not_scam),
    Rule("repo_not_honeypot",   "verification", 2.0, _r_repo_not_honeypot),
    Rule("no_prompt_injection", "verification", 2.0, _r_no_prompt_injection),
    Rule("unassigned",          "mercy_civ",    1.5, _r_unassigned),
    Rule("crowd_cap",           "mercy_civ",    1.0, _make_crowd_rule(DEFAULT_CROWD_CAP)),
]


def build_rules(*, crowd_cap: int = DEFAULT_CROWD_CAP, include_risky: bool = False) -> list:
    """Build a ruleset with caller-tunable parameters.

    Args:
      crowd_cap: max comment count before a bounty is treated as too crowded.
      include_risky: when True, drop the scam/honeypot/prompt-injection
        verification rules so risky bounties still surface (annotated).
    """
    rules = [
        Rule("has_amount", "geometric", 1.5, _r_has_amount),
        Rule("is_open",    "geometric", 1.0, _r_open),
        Rule("has_url",    "geometric", 0.5, _r_has_url),
    ]
    if not include_risky:
        rules += [
            Rule("owner_not_scam",      "verification", 2.0, _r_owner_not_scam),
            Rule("repo_not_honeypot",   "verification", 2.0, _r_repo_not_honeypot),
            Rule("no_prompt_injection", "verification", 2.0, _r_no_prompt_injection),
        ]
    rules += [
        Rule("unassigned", "mercy_civ", 1.5, _r_unassigned),
        Rule("crowd_cap",  "mercy_civ", 1.0, _make_crowd_rule(crowd_cap)),
    ]
    return rules
