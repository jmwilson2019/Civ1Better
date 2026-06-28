"""Tests for the source-normalization helpers.

Focused on the offline-safe pieces: amount extraction and GitHub Search
payload normalization. Live HTTP is exercised only when GITHUB_TOKEN is
set; otherwise the network test is skipped.
"""
import os
import unittest
from unittest.mock import patch

from seraphina_algora.sources import (
    _extract_amount,
    _normalize_github_issue,
    fetch_github_bounties,
)


class AmountExtraction(unittest.TestCase):
    def test_plain_dollar_amount(self):
        self.assertEqual(_extract_amount("Pays $250 on merge"), 250.0)

    def test_bounty_command_preferred(self):
        # /bounty wins over a bare $200 elsewhere.
        text = "Discussion of $9999 budget. /bounty $200 to ship the fix."
        self.assertEqual(_extract_amount(text), 200.0)

    def test_amount_with_comma(self):
        self.assertEqual(_extract_amount("/bounty $1,500"), 1500.0)

    def test_amount_with_cents(self):
        self.assertEqual(_extract_amount("Pays $250.99 on merge"), 250.99)

    def test_bounty_command_with_cents(self):
        self.assertEqual(_extract_amount("/bounty $1,234.50"), 1234.50)

    def test_no_amount(self):
        self.assertIsNone(_extract_amount("Help wanted, no payout listed."))

    def test_empty_string(self):
        self.assertIsNone(_extract_amount(""))


class GithubNormalization(unittest.TestCase):
    def test_normalize_minimal_issue(self):
        item = {
            "number": 42,
            "title": "Fix something",
            "html_url": "https://github.com/acme/widget/issues/42",
            "repository_url": "https://api.github.com/repos/acme/widget",
            "labels": [{"name": "\U0001f48e Bounty"}],
            "assignees": [],
            "state": "open",
            "comments": 1,
            "body": "/bounty $150",
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-02T00:00:00Z",
            "id": 999,
        }
        # Stub the per-repo metadata fetch so the test stays offline.
        with patch("seraphina_algora.sources._http_get_json") as mock_get:
            mock_get.return_value = {
                "description": "Widget factory",
                "stargazers_count": 250,
                "language": "Python",
            }
            cache = {}
            b = _normalize_github_issue(item, cache, token=None)

        self.assertEqual(b.owner, "acme")
        self.assertEqual(b.repo, "widget")
        self.assertEqual(b.number, 42)
        self.assertEqual(b.amount_usd, 150.0)
        self.assertEqual(b.repo_stars, 250)
        self.assertEqual(b.language, "Python")
        self.assertEqual(b.slug, "acme/widget#42")

    def test_repo_meta_cached_across_calls(self):
        item = {
            "number": 1,
            "title": "x",
            "html_url": "https://github.com/acme/widget/issues/1",
            "repository_url": "https://api.github.com/repos/acme/widget",
            "labels": [],
            "assignees": [],
            "state": "open",
            "comments": 0,
            "body": "",
        }
        with patch("seraphina_algora.sources._http_get_json") as mock_get:
            mock_get.return_value = {"description": "", "stargazers_count": 0}
            cache = {}
            _normalize_github_issue(item, cache, token=None)
            _normalize_github_issue(item, cache, token=None)
            # Only one HTTP call despite two normalizations.
            self.assertEqual(mock_get.call_count, 1)


@unittest.skipUnless(
    os.environ.get("SERAPHINA_ALGORA_LIVE"),
    "set SERAPHINA_ALGORA_LIVE=1 to exercise network",
)
class LiveSmoke(unittest.TestCase):  # pragma: no cover - opt-in only
    def test_fetch_runs(self):
        results = fetch_github_bounties(per_page=1)
        self.assertIsInstance(results, list)


if __name__ == "__main__":
    unittest.main()
