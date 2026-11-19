"""CA that is also the TLS server and offers both certificates at once.

OpenSSL keeps one certificate per public-key algorithm. The client selects
ECDSA P-256 or ML-DSA-65 with its signature-algorithm list. The server does
not switch after the first download, so a later agent can still authenticate
with the classical certificate.
"""

from __future__ import annotations

import subprocess
import time
from dataclasses import dataclass
from pathlib import Path

from prototype.certificates import CertificateMaterial
from prototype.openssl_tool import OpensslError, openssl_bin

SERVER_GROUPS = "X25519:X25519MLKEM768"


@dataclass
class CaServer:
    material: CertificateMaterial
    port: int
    process: subprocess.Popen[str]
    log_path: Path

    @classmethod
    def start(cls, material: CertificateMaterial, port: int) -> CaServer:
        log_path = material.root / "ca.log"
        log_file = log_path.open("w", encoding="utf-8")
        process = subprocess.Popen(
            [
                openssl_bin(),
                "s_server",
                "-accept",
                f"127.0.0.1:{port}",
                "-tls1_3",
                "-cert",
                str(material.old_cert.resolve()),
                "-key",
                str(material.old_key.resolve()),
                "-dcert",
                str(material.new_cert.resolve()),
                "-dkey",
                str(material.new_key.resolve()),
                "-groups",
                SERVER_GROUPS,
                "-WWW",
                "-verify_quiet",
            ],
            cwd=material.root / "pub",
            stdout=log_file,
            stderr=subprocess.STDOUT,
            text=True,
        )
        log_file.close()
        server = cls(material, port, process, log_path)
        try:
            server._wait_until_listening()
        except Exception:
            server.stop()
            raise
        return server

    def stop(self) -> None:
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=3)

    def _wait_until_listening(self) -> None:
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if self.process.poll() is not None:
                raise OpensslError(
                    "CA server exited during startup\n" + self.log_path.read_text(encoding="utf-8")
                )
            if "ACCEPT" in self.log_path.read_text(encoding="utf-8"):
                return
            time.sleep(0.05)
        raise TimeoutError(
            f"CA server did not listen on 127.0.0.1:{self.port}\n"
            + self.log_path.read_text(encoding="utf-8")
        )


def default_port() -> int:
    return 4433
