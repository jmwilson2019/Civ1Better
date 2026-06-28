# seraphina-algora

**Deterministic, stdlib-only bounty radar for the Algora platform.**

`seraphina-algora` sweeps GitHub for open, bounty-labeled issues, scores
each one through a three-wheel rule pipeline (geometric / verification /
mercy_civ), and emits a ranked table or JSON. Known scam owners, honeypot
fixtures, prompt-injection traps, and crowded races are filtered out by
default.

Patterned after the SynerGro-AI `Seraphina.AGIv1.0.8` engine: pure Python
standard library, no third-party dependencies, no telemetry, deterministic
output for the same input.

## Status

Alpha. The rule engine and scan/watch/show subcommands are wired up and
exercised by unit tests. Live network testing is opt-in via
`SERAPHINA_ALGORA_LIVE=1`.

## Install

```bash
pip install seraphina-algora        # once on PyPI
# or, from source:
pip install -e ./seraphina-algora
```

A `GITHUB_TOKEN` (or `GH_TOKEN`) environment variable is recommended to
avoid GitHub's unauthenticated rate limits; the tool works without one
for small probes.

## Usage

```bash
# One-shot scan with default filters and default query
seraphina-algora scan

# Tighten the crowd cap, only show triad-passing results, emit JSON
seraphina-algora scan --crowd-cap 3 --passing-only --json

# Watch loop, 5-minute interval
seraphina-algora watch -i 300

# Replay the last 20 scans
seraphina-algora show --tail 20
```

### Default query

```
label:"💎 Bounty" state:open
```

Override with `-q` to target a specific repo or label set:

```bash
seraphina-algora scan -q 'repo:archestra-ai/archestra label:bounty state:open'
seraphina-algora scan -q 'label:bounty language:Python state:open stars:>100'
```

## How scoring works

Each bounty is run through three independent "wheels":

| Wheel        | Checks                                                |
| ------------ | ----------------------------------------------------- |
| geometric    | has USD amount, state=open, valid URL                 |
| verification | not on scam-owner list, not a honeypot, no prompt-injection text |
| mercy_civ    | unassigned, comment count below crowd cap             |

A bounty earns `consensus = true` only if **every** rule passes. Each
wheel also contributes a 0..1 sub-score; the overall score is the
weight-normalized average and is used to rank passing results.

`--include-risky` drops the verification-wheel rules so risky bounties
still surface (annotated with their flags) for research purposes.

## Filter inventory

The default filters reject anything from owners or matching keywords
documented in `seraphina_algora/rules.py`. Each entry is backed by live
evidence gathered while sweeping Algora. Edit only with citations.

## Development

```bash
cd seraphina-algora
pip install -e .
python -m unittest discover -s tests -v
```

CI runs the suite on Python 3.9 - 3.12.

## License

MIT. See [LICENSE](LICENSE).
