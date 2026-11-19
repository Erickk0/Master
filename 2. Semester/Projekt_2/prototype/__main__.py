"""Command line for the Meeting 1 prototype.

    python3 -m prototype certs
    python3 -m prototype ca
    python3 -m prototype agent
    python3 -m prototype selftest
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from prototype.agent import migrate
from prototype.ca_server import CaServer, default_port
from prototype.certificates import generate
from prototype.openssl_tool import openssl_version
from prototype.selftest import run_selftest

RUNTIME = Path(__file__).resolve().parent / "runtime"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="prototype")
    shared = argparse.ArgumentParser(add_help=False)
    shared.add_argument(
        "--runtime",
        type=Path,
        default=RUNTIME,
        help="directory for keys, the agent trust anchor, and published files",
    )
    shared.add_argument("--port", type=int, default=default_port())
    commands = parser.add_subparsers(dest="command", required=True)

    commands.add_parser(
        "certs",
        parents=[shared],
        help="create the classical and ML-DSA-65 CA certificates",
    )
    commands.add_parser(
        "ca",
        parents=[shared],
        help="serve both certificates on one TLS 1.3 port",
    )
    commands.add_parser(
        "agent",
        parents=[shared],
        help="fetch cert_CA, then open the PQ session",
    )
    commands.add_parser(
        "selftest",
        parents=[shared],
        help="generate material, serve it, and run two agents",
    )

    args = parser.parse_args(argv)
    version = openssl_version()
    if args.command == "certs":
        material = generate(args.runtime)
        print(f"OpenSSL {version[0]}.{version[1]}.{version[2]}")
        print(f"classical trust anchor: {material.old_cert}")
        print(f"published PQ certificate: {material.new_cert}")
        return 0
    if args.command == "ca":
        material = generate(args.runtime)
        server = CaServer.start(material, args.port)
        print(f"CA listening on 127.0.0.1:{args.port} (TLS 1.3, ECDSA and ML-DSA-65)")
        try:
            server.process.wait()
        except KeyboardInterrupt:
            print("\nstopping")
        finally:
            server.stop()
        return 0
    if args.command == "agent":
        result = migrate(args.port, args.runtime / "config" / "old.crt")
        print(
            f"classical: {result.old_signature} via {result.old_group}; "
            f"received {result.received_algorithm}; "
            f"pq: {result.new_signature} via {result.new_group}; "
            f"health={result.health}"
        )
        return 0
    if args.command == "selftest":
        run_selftest(args.runtime, args.port)
        print("selftest passed")
        return 0
    return 2


if __name__ == "__main__":
    sys.exit(main())
