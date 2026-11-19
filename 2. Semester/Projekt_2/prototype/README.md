# Meeting 1 prototype

This is the first runnable piece from the 13 November meeting. It is smaller than the cross-certification design in the report. One CA is also the TLS server. One agent starts with the old certificate, downloads the new one, and then connects again with only the new certificate.

Both sessions are TLS 1.3.

| | First session | Second session |
|---|---|---|
| Certificate | self-signed X.509, ECDSA P-256, SHA-256 | self-signed X.509, ML-DSA-65 |
| Key exchange | X25519 only | X25519MLKEM768 (hybrid) |
| Who the agent trusts | `config/old.crt`, already on disk | only the certificate just downloaded |

The CA does not switch over after the first download. A second agent can still start from the old certificate.

## Why it calls the `openssl` command

The meeting notes use Python's `ssl` module (`set_groups`, `set_server_sigalgs`). Those two calls exist from Python 3.15. The Python on this machine is 3.13, linked to OpenSSL 3.6, but without those calls. If the groups were left at the OpenSSL default, the "old" session would already be hybrid and would not be a classical session.

So certificate creation and both TLS sessions go through the `openssl` binary (3.5 or newer). Python only starts the server, runs the agent, and checks the results.

## What you need

From the project directory `2. Semester/Projekt_2`:

```bash
openssl version
```

That must print OpenSSL 3.5 or newer. 3.6.1 is what this machine has, and it includes ML-DSA-65 and X25519MLKEM768.

## Fastest check

One command generates the certificates, starts the CA, runs two agents, and stops the CA:

```bash
cd "/Users/erickzeiler/Desktop/Master/2. Semester/Projekt_2"
python3 -m prototype selftest
```

`selftest passed` means both agents did the full switch, the downloaded certificate really is ML-DSA-65, and the second agent was still able to begin with the old certificate.

## Start it yourself

Use two terminals. Both start in `2. Semester/Projekt_2`.

Terminal 1, the CA:

```bash
python3 -m prototype ca
```

Leave it running. It listens on `127.0.0.1:4433`.

Terminal 2, the agent:

```bash
python3 -m prototype agent
```

A successful run looks like this:

```text
classical: ecdsa_secp256r1_sha256 via X25519; received ML-DSA-65; pq: mldsa65 via X25519MLKEM768; health=pq-ok
```

Stop the CA with Ctrl-C in terminal 1.

`ca` creates the certificates if they are not there yet. To create them without starting the server:

```bash
python3 -m prototype certs
```

Another port, if 4433 is taken:

```bash
python3 -m prototype ca --port 8443
python3 -m prototype agent --port 8443
```

## Files it writes

Everything lands in `prototype/runtime/`. That directory is gitignored. The private keys are mode `600`.

```text
prototype/runtime/
  keys/old.key          private, classical, never served
  keys/new.key          private, ML-DSA-65, never served
  config/old.crt        what the agent is allowed to trust at the start
  pub/new.crt           the PQ certificate the agent downloads
  pub/health            small text file, answer of the second request
  ca.log                OpenSSL server log
```

`pub/` is the only directory the TLS server exposes. A key next to `new.crt` would be a bug. The check in `certificates.py` refuses to generate material in that state.

## What the agent does

1. Open TLS 1.3 to `127.0.0.1:4433`. Trust only `config/old.crt`. Allow only X25519 and only an ECDSA P-256 server signature.
2. `GET /new.crt`. Read the PEM from the response. Reject it unless the signature algorithm is `ML-DSA-65`.
3. Close that connection. The received PEM is kept in a temporary file for the next connection only. It does not replace `config/old.crt`.
4. Open a new TLS 1.3 connection. Trust only the received certificate. Require group `X25519MLKEM768` and signature `mldsa65`.
5. `GET /health`. The body must be `pq-ok`.

The trust in the new certificate comes from the old, not post-quantum, session. That is the point of this first prototype. The dual signature from the report is the later fix for that gap, and it is not implemented here.

## Code map

| File | Role |
|---|---|
| `__main__.py` | the four commands: `certs`, `ca`, `agent`, `selftest` |
| `certificates.py` | builds both self-signed certificates with `openssl req` |
| `ca_server.py` | one `openssl s_server` with both certificates |
| `agent.py` | the two sessions and the certificate check |
| `openssl_tool.py` | runs `openssl` and refuses versions older than 3.5 |
| `selftest.py` | starts the CA and runs two agents |

The written report is `../projekt_research.typ`. Meeting 1 in that report is the same design. This directory is the part that actually runs.
