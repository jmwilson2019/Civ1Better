# Glyph Vault Design Implementation (Reference)

This directory implements a **local reference design** for a Glyph-aligned key vault.

## Goals mapped to the plan

1. `GLYPH_HOME` is used as data root; defaults to `D:/glyph-dataland`.
2. `vault-index.json` tracks each secret version with SHA-256 and signer fingerprint.
3. Envelope records are deterministic JSON with immutable metadata + hash.
4. `policy-bundle.json` is intended to be CI-managed and signed in upstream repos.
5. Role-based gate checks are enforced per action (`service`, `operator`, `break-glass`).
6. Data-at-rest hardening (BitLocker, ACLs) is operational and documented below.
7. `audit-ledger.jsonl` is append-only and hash-chained (tamper-evident).
8. Lifecycle actions are implemented: create/read/rotate/revoke/expire.
9. Azure-parity controls are captured as operational requirements.
10. Integration points are defined for ambient/processor/glyphc/glyph2 repos.

## Usage

```python
from vault import VaultEngine

engine = VaultEngine(actor="vault-service", role="operator")
engine.initialize()
engine.create_version(
    secret_id="db-password",
    version="v1",
    ciphertext_b64="BASE64_CIPHERTEXT_FROM_KMS",
    owner="platform",
    signer_fingerprint="SHA256:FINGERPRINT",
    policy="prod-db-read",
)
secret = engine.read_version("db-password", "v1")
assert engine.verify_audit_chain()
```

## Security notes

- This reference model does **not** implement encryption itself; ciphertext should come from KMS/HSM workflows.
- Recommended controls for `D:`:
  - BitLocker with TPM+PIN.
  - NTFS ACLs restricted to vault service identity.
  - No public endpoint exposure by default.
  - SIEM forwarding for audit events.

## Cross-repo integration contract

- **Glyph_processor_ambient**: storage wake/monitoring and health probes.
- **glyph processor**: policy evaluation and envelope verification.
- **glyphc**: low-level binary validator and host integrity checks.
- **glyph 2**: orchestration/API and operator workflows.
