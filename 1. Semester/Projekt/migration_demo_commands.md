# CRYME PQC Migration Demo Commands

> **See [GUIDE.md](GUIDE.md) § End-to-End Demo** for the full walkthrough. This file is a quick command reference.

Requires `source ~/.bashrc` so `cryme` works without the `node` prefix.

## 0. Reset

```bash
cryme init
```

## 1. Hidden dependency trap (FAIL)

```bash
cryme migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768
```

## 2. Co-migration (SUCCESS)

```bash
cryme migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768
```

Or explicitly both nodes:

```bash
cryme migrate id=Webserver_Classic.KeyExchange_ECDHE,Client_Browser.KeyExchange_ECDHE X25519_MLKEM768
```

Deploy + verify:

```bash
cryme deploy step=2
cryme verify tls step=2
```

## 3. Redundant migration (ABORTED)

```bash
cryme migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768
```

## 4. Certificate migration

```bash
cryme migrate id=Webserver_Classic.Cert_RSA2048 ML-DSA-44
cryme deploy step=3
```

## 5. Certificate upgrade (optional branch)

```bash
cryme migrate id=Webserver_Classic.Cert_RSA2048 ML-DSA-65
```

## 6. TLS 1.3 only

```bash
cryme migrate id=Webserver_Classic.TLS_1.2_/_1.3_Communication TLS1.3
cryme deploy step=4
```

## 7. Inspect

```bash
cryme show node
cryme show state step=2
cryme show tree
cryme show diff step=2
```

## Automated full demo

```bash
bash deploy/run_demo.sh
```
