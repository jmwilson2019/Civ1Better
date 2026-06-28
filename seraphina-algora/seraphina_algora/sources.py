"""Upstream fetchers: GitHub Search + Algora.

Pattern lifted from Seraphina's `plan_grok` in cli.py: every HTTP call goes
through `urllib.request` with explicit timeouts, env-var-sourced auth, and
no third-party dependencies.
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional

from .core import Bounty


GITHUB_SEARCH_URL = "https://api.github.com/search/issues"
GITHUB_REPO_URL = "https://api.github.com/repos/{owner}/{repo}"
USER_AGENT = "seraphina-algora/0.1 (+https://github.com/jmwilson2019/Civ1Better)"
DEFAULT_TIMEOUT = 20  # seconds


# Match dollar amounts in issue bodies / titles, e.g. "$250", "$1,500", "$250.99".
# Decimal cents are captured so they survive the float() conversion below.
_AMOUNT_RE = re.compile(r"\$\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)")
# Match Algora's `/bounty 50` invocation in issue bodies.
_BOUNTY_CMD_RE = re.compile(r"/bounty\s+\$?\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)", re.IGNORECASE)


def _http_get_json(url: str, *, token: Optional[str] = None,
                   timeout: int = DEFAULT_TIMEOUT) -> Dict[str, Any]:
    """Minimal stdlib HTTP GET returning parsed JSON.

    Raises urllib.error.HTTPError on non-2xx; caller is responsible for
    handling rate-limit (403/429) responses.
    """
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": USER_AGENT,
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (controlled URL)
        data = resp.read()
    return json.loads(data.decode("utf-8"))


def _extract_amount(text: str) -> Optional[float]:
    """Pull the first $amount we can find. Prefers explicit /bounty commands."""
    if not text:
        return None
    m = _BOUNTY_CMD_RE.search(text)
    if not m:
        m = _AMOUNT_RE.search(text)
    if not m:
        return None
    try:
        return float(m.group(1).replace(",", ""))
    except ValueError:
        return None


def _normalize_github_issue(item: Dict[str, Any],
                            repo_meta_cache: Dict[str, Dict[str, Any]],
                            token: Optional[str]) -> Bounty:
    """Convert a GitHub Search /issues hit into a Bounty."""
    repo_url = item.get("repository_url", "") or ""
    # repository_url ends in /repos/<owner>/<repo>
    parts = repo_url.rstrip("/").split("/")
    owner = parts[-2] if len(parts) >= 2 else ""
    repo = parts[-1] if parts else ""

    repo_meta: Dict[str, Any] = {}
    if owner and repo:
        key = f"{owner}/{repo}"
        if key not in repo_meta_cache:
            try:
                repo_meta_cache[key] = _http_get_json(
                    GITHUB_REPO_URL.format(owner=owner, repo=repo),
                    token=token,
                )
            except urllib.error.HTTPError:
                repo_meta_cache[key] = {}
        repo_meta = repo_meta_cache[key]

    labels = tuple(
        lbl.get("name", "") for lbl in item.get("labels", []) if isinstance(lbl, dict)
    )
    assignees = tuple(
        a.get("login", "") for a in (item.get("assignees") or []) if isinstance(a, dict)
    )

    body = item.get("body") or ""
    title = item.get("title") or ""
    amount = _extract_amount(body) or _extract_amount(title)

    return Bounty(
        source="github",
        owner=owner,
        repo=repo,
        number=int(item.get("number", 0)),
        title=title,
        url=item.get("html_url", ""),
        amount_usd=amount,
        labels=labels,
        state=item.get("state", "open"),
        assignees=assignees,
        comments=int(item.get("comments", 0)),
        created_at=item.get("created_at", ""),
        updated_at=item.get("updated_at", ""),
        repo_description=repo_meta.get("description", "") or "",
        repo_stars=int(repo_meta.get("stargazers_count", 0) or 0),
        language=repo_meta.get("language", "") or "",
        body=body,
        extra={"id": item.get("id")},
    )


def fetch_github_bounties(query: str = 'label:"💎 Bounty" state:open',
                          *,
                          per_page: int = 30,
                          page: int = 1,
                          token: Optional[str] = None,
                          timeout: int = DEFAULT_TIMEOUT) -> List[Bounty]:
    """Search GitHub Issues for bounty-labeled issues.

    Args:
      query: GitHub search query string (see GitHub docs for full syntax).
      per_page: results per page (1-100).
      page: page number (1-based).
      token: GitHub PAT or installation token. Falls back to
        GITHUB_TOKEN env var if not provided. Anonymous requests are
        allowed but heavily rate-limited.
      timeout: socket timeout in seconds.
    """
    if token is None:
        token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")

    params = {
        "q": query,
        "per_page": str(max(1, min(per_page, 100))),
        "page": str(max(1, page)),
    }
    url = f"{GITHUB_SEARCH_URL}?{urllib.parse.urlencode(params)}"
    payload = _http_get_json(url, token=token, timeout=timeout)
    items = payload.get("items") or []
    cache: Dict[str, Dict[str, Any]] = {}
    return [_normalize_github_issue(it, cache, token) for it in items]


def fetch_bounties(*, query: Optional[str] = None,
                   per_page: int = 30,
                   token: Optional[str] = None) -> List[Bounty]:
    """Top-level dispatcher. Currently routes only to GitHub.

    Algora's public API requires session auth in the browser; for now the
    GitHub Search route is sufficient because every funded Algora bounty
    mirrors as a labeled issue on the target repo.
    """
    q = query or 'label:"💎 Bounty" state:open'
    return fetch_github_bounties(query=q, per_page=per_page, token=token)
