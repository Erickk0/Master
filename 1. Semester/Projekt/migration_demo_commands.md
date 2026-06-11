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

## 3. Redundant Ghost Migration (Aborted / Dead-End)
Attempt to migrate the key exchange again. The system detects it's already migrated and aborts, creating a dead-end leaf in the tree:
```bash
node cryme migrate id=Webserver_Classic.KeyExchange_ECDHE X25519_MLKEM768
```

## 4. Migrate the Certificate (Security Level 1)
Migrate the certificate to the first PQC security level:
```bash
node cryme migrate id=Webserver_Classic.Cert_RSA2048 ML-DSA-44
```

## 5. Upgrade the Certificate (Security Level 3)
Upgrade the certificate to a higher security level variant:
```bash
node cryme migrate id=Webserver_Classic.Cert_RSA2048 ML-DSA-65
```

## 6. Update the Security Control
Finally, update the overarching HTTP control component:
```bash
node cryme migrate id=Webserver_Classic.TLS_1.2_/_1.3_Communication TLS1.3
```

## 7. View the Tree
Admire the complete migration tree with dynamic descriptions directly in your terminal:
```bash
node cryme show tree
```
