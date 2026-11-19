"""Run two agents against one CA and check that the classical anchor still works."""

from __future__ import annotations

from pathlib import Path

from prototype.agent import NEW_SIGALGS, OLD_SIGALGS, migrate
from prototype.ca_server import CaServer
from prototype.certificates import NEW_SIGALG, generate


def run_selftest(runtime: Path, port: int) -> None:
    material = generate(runtime)
    server = CaServer.start(material, port)
    try:
        first = migrate(port, material.old_cert)
        second = migrate(port, material.old_cert)
    finally:
        server.stop()

    for result in (first, second):
        if not result.old_group.startswith("X25519") or "MLKEM" in result.old_group.upper():
            raise AssertionError(f"classical group was {result.old_group}")
        if result.old_signature != OLD_SIGALGS:
            raise AssertionError(f"classical signature was {result.old_signature}")
        if result.received_algorithm != NEW_SIGALG:
            raise AssertionError(f"fetched certificate was {result.received_algorithm}")
        if "MLKEM" not in result.new_group.upper():
            raise AssertionError(f"PQ group was {result.new_group}")
        if result.new_signature != NEW_SIGALGS:
            raise AssertionError(f"PQ signature was {result.new_signature}")
        if result.health != "pq-ok":
            raise AssertionError(result.health)
