"""Agent that learns cert_CA over a classical session, then opens a PQ session.

The received certificate is trusted only for the second connection. It is
never written into the server's published directory and it does not replace
the classical trust anchor.
"""

from __future__ import annotations

import re
import tempfile
from dataclasses import dataclass
from pathlib import Path

from prototype.certificates import HOSTNAME, NEW_SIGALG, signature_algorithm
from prototype.openssl_tool import OpensslError, run

OLD_GROUPS = "X25519"
OLD_SIGALGS = "ecdsa_secp256r1_sha256"
NEW_GROUPS = "X25519MLKEM768"
NEW_SIGALGS = "mldsa65"

_NEGOTIATED_GROUP = re.compile(r"Negotiated TLS1\.3 group:\s*(\S+)")
_TEMP_KEY = re.compile(r"Peer Temp Key:\s*([^,\n]+)")
_SIGNATURE = re.compile(r"Signature type:\s*(\S+)")
_PEM = re.compile(
    r"-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----",
    re.DOTALL,
)


@dataclass(frozen=True)
class Handshake:
    group: str
    signature: str


@dataclass(frozen=True)
class MigrationResult:
    received_algorithm: str
    old_group: str
    old_signature: str
    new_group: str
    new_signature: str
    health: str


def migrate(port: int, old_cert: Path) -> MigrationResult:
    if not old_cert.is_file():
        raise FileNotFoundError(old_cert)

    old_session = _session(port, old_cert, OLD_GROUPS, OLD_SIGALGS)
    fetched = _http_get(port, "/new.crt", cafile=old_cert, groups=OLD_GROUPS, sigalgs=OLD_SIGALGS)
    received = _only_certificate(fetched)
    with tempfile.TemporaryDirectory(prefix="cert-ca-") as directory:
        received_path = Path(directory) / "cert_CA.crt"
        received_path.write_text(received + "\n", encoding="utf-8")
        algorithm = signature_algorithm(received_path)
        if algorithm != NEW_SIGALG:
            raise OpensslError(
                f"certificate fetched over the classical session is {algorithm}, "
                f"expected {NEW_SIGALG}"
            )
        new_session = _session(port, received_path, NEW_GROUPS, NEW_SIGALGS)
        health = _http_get(
            port,
            "/health",
            cafile=received_path,
            groups=NEW_GROUPS,
            sigalgs=NEW_SIGALGS,
        )
    if health.strip() != "pq-ok":
        raise OpensslError(f"unexpected health body: {health!r}")
    return MigrationResult(
        received_algorithm=algorithm,
        old_group=old_session.group,
        old_signature=old_session.signature,
        new_group=new_session.group,
        new_signature=new_session.signature,
        health=health.strip(),
    )


def _session(port: int, cafile: Path, groups: str, sigalgs: str) -> Handshake:
    """Record the negotiated group and signature, then close without an HTTP request."""
    result = run(
        _client_args(port, cafile, groups, sigalgs) + ["-brief"],
        stdin="",
        check=False,
    )
    report = result.stdout + result.stderr
    if result.returncode != 0 or "Verification: OK" not in report:
        raise OpensslError(f"handshake failed ({result.returncode})\n{report}")
    return Handshake(
        group=_group(report),
        signature=_one(_SIGNATURE, report, "peer signature"),
    )


def _http_get(port: int, path: str, *, cafile: Path, groups: str, sigalgs: str) -> str:
    request = (
        f"GET {path} HTTP/1.0\r\n"
        f"Host: {HOSTNAME}\r\n"
        "Connection: close\r\n"
        "\r\n"
    )
    result = run(
        _client_args(port, cafile, groups, sigalgs) + ["-quiet"],
        stdin=request,
        check=False,
    )
    status = _status_line(result.stdout)
    if not status.startswith("HTTP/1.0 200"):
        raise OpensslError(
            f"GET {path} failed ({result.returncode}, {status or 'no status'})\n"
            f"{result.stderr.strip()}\n{result.stdout.strip()}"
        )
    return _http_body(result.stdout)


def _client_args(port: int, cafile: Path, groups: str, sigalgs: str) -> list[str]:
    return [
        "s_client",
        "-connect",
        f"127.0.0.1:{port}",
        "-servername",
        HOSTNAME,
        "-tls1_3",
        "-CAfile",
        str(cafile.resolve()),
        "-verify_return_error",
        "-verify_hostname",
        HOSTNAME,
        "-groups",
        groups,
        "-sigalgs",
        sigalgs,
    ]


def _status_line(response: str) -> str:
    return response.splitlines()[0].strip() if response else ""


def _http_body(response: str) -> str:
    parts = re.split(r"\r?\n\r?\n", response, maxsplit=1)
    return parts[1] if len(parts) == 2 else ""


def _only_certificate(body: str) -> str:
    matches = _PEM.findall(body)
    if len(matches) != 1:
        raise OpensslError(f"expected one PEM certificate, found {len(matches)}")
    return matches[0]


def _group(text: str) -> str:
    negotiated = _NEGOTIATED_GROUP.search(text)
    if negotiated is not None:
        return negotiated.group(1)
    temp_key = _TEMP_KEY.search(text)
    if temp_key is not None:
        return temp_key.group(1).strip()
    raise OpensslError(f"TLS report has no negotiated group\n{text.strip()}")


def _one(pattern: re.Pattern[str], text: str, label: str) -> str:
    match = pattern.search(text)
    if match is None:
        raise OpensslError(f"TLS report has no {label}\n{text.strip()}")
    return match.group(1)
