#!/bin/sh
# Avvia il server in HTTPS con i certificati di mkcert (server/HTTPS.md).
# Uso: sh server/casa.sh          dalla cartella del progetto
cd "$(dirname "$0")/.." || exit 1
[ -f certificati/cert.pem ] || { echo "manca certificati/cert.pem: vedi server/HTTPS.md"; exit 1; }
MANTI_PUSH=1 MANTI_CERT=certificati/cert.pem MANTI_CHIAVE=certificati/chiave.pem MANTI_CA="$(mkcert -CAROOT)/rootCA.pem" exec node server/server.js
