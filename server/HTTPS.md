# HTTPS in casa, per il telefono

Fotocamera e appunti nel browser esistono solo su HTTPS. In casa i certificati li fa `mkcert`, una volta.

Sul Mac, in Terminal.app:

```
brew install mkcert
mkcert -install                       # chiede la password: mette l'autorità nel portachiavi del Mac
cd ~/messaggi && mkdir -p certificati
ipconfig getifaddr en0                # l'indirizzo del Mac in questa rete: cambia da rete a rete
mkcert -cert-file certificati/cert.pem -key-file certificati/chiave.pem <indirizzo> localhost
sh server/casa.sh                     # server in HTTPS con push, più il certificato di casa sulla porta 8788
```

Sul telefono, sulla stessa Wi‑Fi, una volta sola:

1. Safari → `http://<indirizzo>:8788` → scarica `manti-ca.pem`.
2. Impostazioni → Generali → VPN e gestione dispositivo → installa il profilo "mkcert".
3. Impostazioni → Generali → Info → Impostazioni certificati → attiva la fiducia completa per "mkcert".

Poi l'app: `https://<indirizzo>:8787/app/`. Da Safari, Condividi → Aggiungi alla schermata Home.

Se cambia l'indirizzo del Mac in rete (altra Wi‑Fi, router che riassegna), si rifà solo il passo `mkcert -cert-file …` con il nuovo indirizzo: si possono elencare più indirizzi nello stesso comando. Se il telefono non carica, il firewall del Mac deve consentire a `node` le connessioni in entrata. La cartella `certificati/` non va nel repository.
