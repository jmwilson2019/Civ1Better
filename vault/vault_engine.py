from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _sha256_json(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return _sha256_bytes(canonical)


class VaultPolicyError(PermissionError):
    pass


class VaultIntegrityError(RuntimeError):
    pass


@dataclass(frozen=True)
class VaultPaths:
    root: Path
    index_file: Path
    envelope_dir: Path
    audit_file: Path
    policy_file: Path


class VaultEngine:
    """Deterministic vault metadata + audit model.

    This engine stores secret metadata/indexing and hash-verified envelopes.
    Ciphertext must be produced by an external KMS/HSM workflow.
    """

    def __init__(self, root: str | None = None, actor: str = "system", role: str = "service") -> None:
        default_root = "D:/glyph-dataland"
        resolved_root = root or os.environ.get("GLYPH_HOME", default_root)
        base = Path(resolved_root)
        self.paths = VaultPaths(
            root=base,
            index_file=base / "vault-index.json",
            envelope_dir=base / "envelopes",
            audit_file=base / "audit-ledger.jsonl",
            policy_file=base / "policy-bundle.json",
        )
        self.actor = actor
        self.role = role

    def initialize(self) -> None:
        self.paths.root.mkdir(parents=True, exist_ok=True)
        self.paths.envelope_dir.mkdir(parents=True, exist_ok=True)
        if not self.paths.index_file.exists():
            self._write_json(self.paths.index_file, {"entries": []})
        if not self.paths.policy_file.exists():
            self._write_json(
                self.paths.policy_file,
                {
                    "version": "1",
                    "roles": {
                        "service": ["create", "read"],
                        "operator": ["create", "read", "rotate", "revoke", "expire"],
                        "break-glass": ["create", "read", "rotate", "revoke", "expire", "unseal"],
                    },
                },
            )

    def create_version(
        self,
        secret_id: str,
        version: str,
        ciphertext_b64: str,
        owner: str,
        signer_fingerprint: str,
        policy: str,
    ) -> dict[str, Any]:
        self._authorize("create")
        envelope = {
            "secret_id": secret_id,
            "version": version,
            "created_at": _utc_now(),
            "owner": owner,
            "policy": policy,
            "signer_fingerprint": signer_fingerprint,
            "ciphertext_b64": ciphertext_b64,
        }
        envelope_hash = _sha256_json(envelope)
        envelope["sha256"] = envelope_hash
        envelope_path = self.paths.envelope_dir / f"{secret_id}__{version}.json"
        self._write_json(envelope_path, envelope)

        index = self._read_index()
        self._upsert_index_entry(
            index,
            {
                "secret_id": secret_id,
                "version": version,
                "sha256": envelope_hash,
                "status": "active",
                "policy": policy,
                "signer_fingerprint": signer_fingerprint,
                "path": str(envelope_path),
                "updated_at": _utc_now(),
            },
        )
        self._write_json(self.paths.index_file, index)
        self._append_audit("create", secret_id, version, "allow")
        return envelope

    def read_version(self, secret_id: str, version: str) -> dict[str, Any]:
        self._authorize("read")
        entry = self._find_index_entry(secret_id, version)
        self._assert_status_allows_read(entry)
        envelope = self._read_json(Path(entry["path"]))
        expected = entry["sha256"]
        actual = _sha256_json({k: v for k, v in envelope.items() if k != "sha256"})
        if envelope.get("sha256") != expected or actual != expected:
            self._append_audit("read", secret_id, version, "deny", reason="hash_mismatch")
            raise VaultIntegrityError("Envelope hash mismatch")
        self._append_audit("read", secret_id, version, "allow")
        return envelope

    def rotate(self, secret_id: str, from_version: str, to_version: str, ciphertext_b64: str) -> dict[str, Any]:
        self._authorize("rotate")
        self._find_index_entry(secret_id, from_version)
        created = self.create_version(
            secret_id=secret_id,
            version=to_version,
            ciphertext_b64=ciphertext_b64,
            owner=self.actor,
            signer_fingerprint="rotation",
            policy="service-default",
        )
        self._append_audit("rotate", secret_id, f"{from_version}->{to_version}", "allow")
        return created

    def revoke(self, secret_id: str, version: str) -> None:
        self._set_status(secret_id, version, "revoked", action="revoke")

    def expire(self, secret_id: str, version: str) -> None:
        self._set_status(secret_id, version, "expired", action="expire")

    def verify_audit_chain(self) -> bool:
        if not self.paths.audit_file.exists():
            return True
        previous = "GENESIS"
        with self.paths.audit_file.open("r", encoding="utf-8") as fh:
            for line in fh:
                row = json.loads(line)
                payload = {k: v for k, v in row.items() if k != "chain_hash"}
                if row["previous_hash"] != previous:
                    return False
                digest = _sha256_json(payload)
                if digest != row["chain_hash"]:
                    return False
                previous = row["chain_hash"]
        return True

    def _set_status(self, secret_id: str, version: str, status: str, action: str) -> None:
        self._authorize(action)
        index = self._read_index()
        entry = self._find_entry(index, secret_id, version)
        entry["status"] = status
        entry["updated_at"] = _utc_now()
        self._write_json(self.paths.index_file, index)
        self._append_audit(action, secret_id, version, "allow")

    def _authorize(self, action: str) -> None:
        policy = self._read_json(self.paths.policy_file)
        allowed = policy.get("roles", {}).get(self.role, [])
        if action not in allowed:
            self._append_audit(action, "n/a", "n/a", "deny", reason=f"role={self.role}")
            raise VaultPolicyError(f"role '{self.role}' cannot perform '{action}'")

    def _assert_status_allows_read(self, entry: dict[str, Any]) -> None:
        if entry["status"] != "active":
            self._append_audit("read", entry["secret_id"], entry["version"], "deny", reason=f"status={entry['status']}")
            raise VaultPolicyError(f"version status is {entry['status']}")

    def _read_index(self) -> dict[str, Any]:
        return self._read_json(self.paths.index_file)

    def _find_index_entry(self, secret_id: str, version: str) -> dict[str, Any]:
        index = self._read_index()
        return self._find_entry(index, secret_id, version)

    @staticmethod
    def _find_entry(index: dict[str, Any], secret_id: str, version: str) -> dict[str, Any]:
        for entry in index.get("entries", []):
            if entry["secret_id"] == secret_id and entry["version"] == version:
                return entry
        raise KeyError(f"secret {secret_id}:{version} not found")

    @staticmethod
    def _upsert_index_entry(index: dict[str, Any], candidate: dict[str, Any]) -> None:
        entries = index.setdefault("entries", [])
        for i, entry in enumerate(entries):
            if entry["secret_id"] == candidate["secret_id"] and entry["version"] == candidate["version"]:
                entries[i] = candidate
                return
        entries.append(candidate)

    def _append_audit(self, action: str, secret_id: str, version: str, result: str, reason: str | None = None) -> None:
        previous = "GENESIS"
        if self.paths.audit_file.exists():
            with self.paths.audit_file.open("rb") as fh:
                lines = [line for line in fh.read().splitlines() if line]
            if lines:
                previous = json.loads(lines[-1].decode("utf-8"))["chain_hash"]
        payload = {
            "at": _utc_now(),
            "actor": self.actor,
            "role": self.role,
            "action": action,
            "secret_id": secret_id,
            "version": version,
            "result": result,
            "reason": reason,
            "previous_hash": previous,
        }
        payload["chain_hash"] = _sha256_json(payload)
        self.paths.audit_file.parent.mkdir(parents=True, exist_ok=True)
        with self.paths.audit_file.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(payload, sort_keys=True) + "\n")

    @staticmethod
    def _write_json(path: Path, payload: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2, sort_keys=True)

    @staticmethod
    def _read_json(path: Path) -> dict[str, Any]:
        with path.open("r", encoding="utf-8") as fh:
            return json.load(fh)
