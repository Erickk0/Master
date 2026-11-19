"""Create the two self-signed X.509 v3 CA certificates from Meeting 1.

The private keys stay in runtime/keys. Only the new certificate is copied into
runtime/pub, which is the directory the TLS server exposes.
"""

from __future__ import annotations

import os
import stat
from dataclasses import dataclass
from pathlib import Path

from prototype.openssl_tool import require_algorithms, run

HOSTNAME = "localhost"
OLD_SIGALG = "ecdsa-with-SHA256"
NEW_SIGALG = "ML-DSA-65"


@dataclass(frozen=True)
class CertificateMaterial:
    root: Path
    old_key: Path
    old_cert: Path
    new_key: Path
    new_cert: Path
    health: Path

    @classmethod
    def at(cls, root: Path) -> CertificateMaterial:
        pub = root / "pub"
        keys = root / "keys"
        config = root / "config"
        return cls(
            root=root,
            old_key=keys / "old.key",
            old_cert=config / "old.crt",
            new_key=keys / "new.key",
            new_cert=pub / "new.crt",
            health=pub / "health",
        )


def generate(root: Path, *, days: int = 30) -> CertificateMaterial:
    """Generate both trust anchors. Existing files in this runtime are replaced."""
    if days < 1:
        raise ValueError("days must be positive")
    require_algorithms("ML-DSA-65", "X25519", "X25519MLKEM768")
    material = CertificateMaterial.at(root)
    for directory in (
        material.root / "keys",
        material.root / "config",
        material.root / "pub",
    ):
        directory.mkdir(parents=True, exist_ok=True)

    _self_signed(
        key=material.old_key,
        cert=material.old_cert,
        extra=["-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256", "-sha256"],
        days=days,
    )
    _self_signed(
        key=material.new_key,
        cert=material.new_cert,
        extra=["-newkey", "mldsa65"],
        days=days,
    )
    material.health.write_text("pq-ok\n", encoding="utf-8")
    _assert_signature(material.old_cert, OLD_SIGALG)
    _assert_signature(material.new_cert, NEW_SIGALG)
    return material


def _self_signed(*, key: Path, cert: Path, extra: list[str], days: int) -> None:
    run(
        [
            "req",
            "-x509",
            *extra,
            "-nodes",
            "-keyout",
            str(key),
            "-out",
            str(cert),
            "-days",
            str(days),
            "-subj",
            f"/CN={HOSTNAME}",
            "-addext",
            f"subjectAltName=DNS:{HOSTNAME}",
        ]
    )
    os.chmod(key, stat.S_IRUSR | stat.S_IWUSR)
    if _published_private_key(cert):
        raise RuntimeError(f"refusing to leave a private key next to {cert}")


def _published_private_key(cert: Path) -> bool:
    pub = cert.parent
    return any(path.suffix == ".key" or path.name.endswith(".pem.priv") for path in pub.iterdir())


def signature_algorithm(cert: Path) -> str:
    text = run(["x509", "-in", str(cert), "-noout", "-text"]).stdout
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("Signature Algorithm:"):
            return stripped.split(":", 1)[1].strip()
    raise RuntimeError(f"no signature algorithm in {cert}")


def _assert_signature(cert: Path, expected: str) -> None:
    actual = signature_algorithm(cert)
    if actual != expected:
        raise RuntimeError(f"{cert} uses {actual}, expected {expected}")
