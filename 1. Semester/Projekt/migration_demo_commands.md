# CRYME PQC Migration Demo Commands

To build the perfect migration tree with all features (failures, learning, redundance, and upgrades), follow these steps in order.

## 0. Reset the Database
First, click **"Import & Initialize"** in the web UI, or run:
```bash
curl -X POST http://localhost:3050/api/init
```

## 1. The "Hidden Dependency" Trap (Failure)
Attempt to migrate the web server's key exchange. It will fail because the client browser depends on it, but the system will discover the hidden dependency:
```bash
node cryme migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768
```

## 2. Successful Co-Migration (Success)
Run the exact same command again. The system now knows about the dependency and migrates both components successfully:
```bash
node cryme migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768
```

Or migrate both nodes explicitly in one command:
```bash
node cryme migrate id=Webserver_Classic.KeyExchange_ECDHE,Client_Browser.KeyExchange_ECDHE X25519_MLKEM768
```

## 3. Redundant Ghost Migration (Aborted / Dead-End)
Attempt to migrate the key exchange again. The system detects it's already migrated and aborts, creating a dead-end leaf in the tree:
```bash
node cryme migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768
```

## 4. Migrate the Certificate (Security Level 1)
```bash
node cryme migrate id=Webserver_Classic.Cert_RSA2048 ML-DSA-44
```

## 5. Upgrade the Certificate (Security Level 3)
```bash
node cryme migrate id=Webserver_Classic.Cert_RSA2048 ML-DSA-65
```

## 6. Update the Security Control
```bash
node cryme migrate id=Webserver_Classic.TLS_1.2_/_1.3_Communication TLS1.3
```

## 7. Inspect Migration History & Graph

View nodes (replaces `show system`):
```bash
node cryme show node
```

View migration tree with HEAD marker:
```bash
node cryme show tree
```

View dependency graph at step 2:
```bash
node cryme show graph step=2
```

View what changed in step 2 (git diff style):
```bash
node cryme show diff step=2
node cryme show step step=2
```

Run deploy + TLS verify after each successful step:
```bash
node cryme deploy step=2
node cryme verify tls step=2
```

Full automated server demo:
```bash
bash deploy/run_demo.sh
```

See [GRAPH_VERSIONING.md](GRAPH_VERSIONING.md) for the full graph versioning model.
