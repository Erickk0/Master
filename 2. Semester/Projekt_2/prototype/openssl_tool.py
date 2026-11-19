"""Small wrapper around the openssl command line.

Python 3.13's ssl module is linked to OpenSSL 3.6, but it cannot set TLS groups
or signature algorithms. Those calls arrive with Python 3.15. The prototype
therefore uses the same OpenSSL binary for every handshake, so the classical
phase can be forced onto X25519 and ECDSA P-256.
"""

from __future__ import annotations

import re
import shutil
import subprocess
from dataclasses import dataclass


class OpensslError(RuntimeError):
    """OpenSSL is missing, too old, or a command failed."""


_VERSION = re.compile(r"OpenSSL\s+(\d+)\.(\d+)\.(\d+)")


@dataclass(frozen=True)
class CommandResult:
    args: tuple[str, ...]
    returncode: int
    stdout: str
    stderr: str

    @property
    def ok(self) -> bool:
        return self.returncode == 0


def openssl_bin() -> str:
    binary = shutil.which("openssl")
    if binary is None:
        raise OpensslError("openssl was not found on PATH")
    return binary


def openssl_version() -> tuple[int, int, int]:
    result = run(["version"])
    match = _VERSION.search(result.stdout)
    if match is None:
        raise OpensslError(f"could not parse openssl version: {result.stdout!r}")
    version = tuple(int(part) for part in match.groups())
    if version < (3, 5, 0):
        raise OpensslError(
            f"OpenSSL {version[0]}.{version[1]}.{version[2]} is too old; "
            "the prototype needs 3.5 or newer for native ML-DSA and ML-KEM"
        )
    return version


def require_algorithms(*names: str) -> None:
    listed = run(["list", "-public-key-algorithms"]).stdout
    missing = [name for name in names if name not in listed]
    if missing:
        raise OpensslError("OpenSSL is missing algorithms: " + ", ".join(missing))


def run(
    args: list[str],
    *,
    stdin: str | None = None,
    cwd: str | None = None,
    timeout: float = 20,
    check: bool = True,
) -> CommandResult:
    completed = subprocess.run(
        [openssl_bin(), *args],
        input=stdin,
        text=True,
        capture_output=True,
        cwd=cwd,
        timeout=timeout,
        check=False,
    )
    result = CommandResult(
        args=tuple(args),
        returncode=completed.returncode,
        stdout=completed.stdout,
        stderr=completed.stderr,
    )
    if check and not result.ok:
        raise OpensslError(_format_failure(result))
    return result


def _format_failure(result: CommandResult) -> str:
    detail = (result.stderr or result.stdout).strip()
    command = "openssl " + " ".join(result.args)
    return f"{command} failed ({result.returncode})\n{detail}"
