# Architettura del registro

Versione 1.0 — 19 settembre 2026
Stato: proposta per la fase di test. Da confermare prima del primo codice.

Questo documento traduce le [regole](REGOLE_MONETA.md) in struttura tecnica. Ogni scelta rimanda alla sezione delle regole che la giustifica.

## 1. Le parti del sistema

```
 dipendenti / azienda                       chiunque partecipi
 (portafoglio: chiave + firma)              (verifica e legge)
          │                                         ▲
          │ transazioni firmate                     │ sito statico
          ▼                                         │
 ┌─────────────────┐    registro     ┌──────────────┴──────┐
 │  banca (server) │ ──────────────▶ │  motore giornaliero │
 │  accetta, valida│                 │  verifica, calcola, │
 │  e accoda       │                 │  pubblica           │
 └─────────────────┘                 └─────────────────────┘
          │                                         │
          ▼                                         ▼
    ledger.jsonl                           repository git
    (catena di hash)                       (storia pubblica)
```

Quattro componenti, ciascuno con un compito solo:

| Componente | Compito | Regole |
|---|---|---|
| **Portafoglio** | Custodisce la chiave privata, firma transazioni, mostra saldo e catalogo | 3, 8, 11.2 |
| **Banca** | Riceve transazioni firmate, le valida contro le regole, le accoda al registro. È l'unico che scrive | 11 |
| **Registro** | Un file append-only, una transazione per riga, ogni riga concatenata alla precedente con hash | 11.3 |
| **Motore giornaliero** | Rilegge tutto il registro da zero, verifica catena e firme, calcola lo stato, genera il sito, committa | 11 pubblicazione |

La banca e il motore sono due programmi separati sullo stesso codice. La banca gira sempre e accoda. Il motore gira una volta al giorno e non scrive mai nel registro, salvo un caso deterministico (sezione 10): legge, verifica, pubblica. Se la banca fosse compromessa e accodasse qualcosa di invalido, il motore lo rifiuta e il sito mostra l'errore invece dei numeri.

## 2. Fasi di sviluppo

La stessa architettura, costruita in ordine di rischio.

| Fase | Cosa esiste | Cosa manca |
|---|---|---|
| **A. Nucleo** | Registro, transazioni, firme, motore da riga di comando, test | Server, sito, interfaccia |
| **B. Pubblicazione** | Il motore gira su GitHub Actions ogni giorno e pubblica su GitHub Pages | Server, interfaccia |
| **C. Banca** | Piccolo server che accetta transazioni firmate via HTTP | Interfaccia |
| **D. Portafoglio** | Interfaccia web per dipendenti: chiave nel browser, saldo, invio, conversione | |

Nella fase A il registro è un file nel repository e le transazioni si creano da riga di comando. È sufficiente per collaudare tutte le regole con dati veri prima di esporre qualcosa ai colleghi.

## 3. Tecnologia

- **Node.js** (già installato, versione 26). Nessun framework nella fase A. Librerie di sistema per tutto: `node:crypto` per Ed25519 e SHA-256, `node:test` per i test, `node:fs` per il registro.
- **Nessuna dipendenza esterna nella fase A.** Meno codice di terzi da fidarsi, meno cose che cambiano sotto i piedi. Se una dipendenza diventa necessaria, va motivata nel commit.
- **JavaScript con controllo dei tipi via JSDoc**, non TypeScript. Evita un passo di compilazione e resta leggibile a chiunque apra il repository.
- **Formato dati JSON**, una transazione per riga (JSONL). Leggibile con qualunque strumento, diffabile in git.

## 4. Unità di misura

Nessun numero decimale nel sistema. Tutte le quantità sono interi.

| Grandezza | Unità | Esempio |
|---|---|---|
| Gettoni | centesimi di gettone | 1 gettone = 100 |
| Euro | centesimi di euro | 1 € = 100 |
| Tempo | ISO 8601 in UTC | `2026-10-01T00:00:00Z` |
| Mese di gioco | intero da 1 | il mese 1 è il mese della genesi |

Il valore del gettone non viene mai memorizzato: si calcola al bisogno come rapporto tra due interi. Quando serve convertire in euro, il risultato si arrotonda per difetto al centesimo. Il resto resta in riserva.

L'emissione del mese *m* in centesimi di gettone: `floor(50000 × 0.98^(m−1))`. Mese 1: 50.000 (500 gettoni). Mese 12: 40.043 (400,43 gettoni).

## 5. Identità e chiavi

- Ogni partecipante (banca, azienda, dipendente) ha una coppia di chiavi **Ed25519**.
- L'identificatore di un conto è l'hash SHA-256 della chiave pubblica, in esadecimale. Non è un nome scelto: deriva dalla chiave.
- La chiave privata non lascia mai il dispositivo del titolare. Nella fase A è un file locale. Nella fase D è nel browser (WebCrypto o IndexedDB cifrato).
- Il nome leggibile ("Marco Rossi") è un dato dell'anagrafica, firmato dall'azienda alla registrazione. Non fa parte dell'identità crittografica.

**Tre ruoli, tre tipi di chiave**

| Ruolo | Chi la custodisce | Cosa firma |
|---|---|---|
| Banca | Il titolare del progetto, su un dispositivo dedicato | Genesi, registrazione aziende, conversioni, correzioni, recuperi |
| Azienda | L'azienda, su un dispositivo del titolare o dell'amministrazione | Registrazione dipendenti, versamenti, emissioni, catalogo, recuperi |
| Dipendente | Il dipendente, sul proprio telefono | Trasferimenti, richieste di conversione |

Nella fase di test la chiave banca e la chiave azienda sono entrambe tue. Restano separate comunque: quando arriverà una seconda azienda, il ruolo è già distinto.

## 6. Il registro

Un file `ledger.jsonl`. Ogni riga è una transazione:

```json
{
  "seq": 42,
  "ts": "2026-10-03T14:22:10Z",
  "type": "transfer",
  "signer": "a1b2c3…",
  "body": { "to": "d4e5f6…", "amount": 1500, "memo": "grazie per il turno" },
  "prev": "9f8e7d…",
  "hash": "0c1d2e…",
  "sig": "base64…"
}
```

| Campo | Significato |
|---|---|
| `seq` | Numero progressivo, da 0 (genesi). Senza buchi |
| `ts` | Quando la banca ha accodato la transazione |
| `type` | Tipo, vedi sezione 7 |
| `signer` | Id del conto che ha firmato |
| `body` | Il contenuto, dipende dal tipo |
| `prev` | Hash della transazione precedente. Nella genesi è una stringa di zeri |
| `hash` | SHA-256 della serializzazione canonica di `seq`, `ts`, `type`, `signer`, `body`, `prev` |
| `sig` | Firma Ed25519 di `hash` con la chiave privata del firmatario |

**Serializzazione canonica:** JSON con chiavi ordinate alfabeticamente, senza spazi, UTF-8. Serve perché due programmi diversi producano lo stesso hash dallo stesso contenuto.

**Verifica di una riga:** ricalcolare l'hash e confrontarlo; verificare la firma con la chiave pubblica del `signer`; controllare che `prev` sia l'hash della riga precedente; controllare che la transazione rispetti le regole del suo tipo dato lo stato del registro fino a quel punto.

**Verifica del registro:** dalla riga 0 all'ultima, in ordine. Se una riga fallisce, tutto ciò che segue è invalido. Il motore lo fa ogni giorno da zero, senza cache.

**Chi firma cosa.** Il partecipante firma la riga completa, quindi `seq`, `ts` e `prev` devono essere noti al momento della firma. La banca li propone al portafoglio, il portafoglio firma, la banca accoda. Se nel frattempo un'altra transazione è entrata, la banca rifiuta e il portafoglio ritenta con i valori nuovi. Nella fase A, con un solo scrittore, il conflitto non si presenta. Questo lega ogni firma a una posizione precisa nella catena: una transazione firmata non può essere riutilizzata altrove.

## 7. I tipi di transazione

Ogni tipo ha un firmatario ammesso e regole di validità. Le regole citano la sezione delle [regole](REGOLE_MONETA.md).

| Tipo | Firma | Contenuto | Validità |
|---|---|---|---|
| `genesis` | banca | Parametri: emissione iniziale, riduzione mensile, commissione, mese di partenza, chiave pubblica della banca | Solo a `seq` 0. Immutabile |
| `company.register` | banca | Chiave pubblica e nome dell'azienda | L'azienda non esiste già |
| `employee.register` | azienda | Chiave pubblica e nome del dipendente | Il dipendente non esiste già. L'azienda è registrata |
| `reserve.deposit` | azienda | Importo in centesimi di euro, mese di riferimento | Importo positivo. Un versamento per mese per azienda |
| `catalog.set` | azienda | Catalogo completo: lista di voci con id, descrizione, quota dell'emissione in millesimi | Sostituisce il catalogo precedente per intero (regola 9) |
| `emission` | azienda | Conto destinatario, voce del catalogo, data del comportamento premiato | Il dipendente esiste. La voce esiste nel catalogo in vigore. L'importo è quota × emissione del mese. Somma delle emissioni del mese ≤ emissione del mese (regole 5, 11.1) |
| `transfer` | dipendente | Destinatario, importo, memo facoltativo | Saldo sufficiente. Destinatario esistente e non chiuso. Nessuna commissione (regola 8) |
| `conversion.request` | dipendente | Importo in gettoni | Saldo sufficiente. I gettoni restano bloccati fino all'esecuzione |
| `conversion.execute` | banca | Riferimento alla richiesta, commissione trattenuta, euro riconosciuti, mese di busta paga | La richiesta esiste e non è già eseguita. Commissione = 2% dell'importo. Euro = (importo − commissione) × valore del giorno, per difetto. Riserva sufficiente (regole 7, 11.4) |
| `account.close` | azienda | Conto da chiudere | Il dipendente non ha conversioni pendenti. I gettoni residui vengono distrutti (regola 12) |
| `account.recover` | banca + azienda | Conto vecchio, chiave pubblica nuova | Vedi sezione 9. Due firme richieste |
| `correction` | banca | Riferimento alla transazione errata, movimento inverso, motivazione | Solo per transazioni che il motore ha segnalato invalide. Motivazione obbligatoria, pubblicata (regola 12) |

La banca non ha un tipo per creare gettoni dal nulla, per togliere gettoni a qualcuno, o per cambiare i parametri della genesi. Non sono tipi con regole severe: non esistono, e il codice del motore non li riconosce.

## 8. Lo stato

Il registro è la verità. Lo stato è una vista calcolata rileggendo tutto:

- **Conti**: per ogni id, ruolo, nome, chiave pubblica, saldo in centesimi di gettone, aperto o chiuso.
- **Riserva**: somma dei versamenti meno gli euro riconosciuti nelle conversioni.
- **Gettoni in circolazione**: somma delle emissioni meno i gettoni distrutti (conversioni e chiusure). I gettoni di commissione non si distruggono: passano al conto della banca.
- **Valore**: riserva / circolazione. Se la circolazione è zero, il valore non è definito e il sito lo dice.
- **Budget residuo del mese**: emissione del mese meno la somma delle emissioni già fatte nel mese.
- **Catalogo in vigore**: l'ultimo `catalog.set`, con il valore in gettoni di ogni voce calcolato sull'emissione del mese corrente.
- **Conversioni pendenti**: richieste senza esecuzione.

Nessuno di questi numeri è memorizzato. Se il codice che li calcola cambia, cambiano retroattivamente per tutta la storia, e questo è voluto: la storia è nel registro, l'interpretazione è nel codice, e il codice è pubblico.

## 9. Chiave persa

È l'unico caso in cui gettoni si spostano senza la firma del titolare, quindi va reso lento e visibile.

1. Il dipendente genera una chiave nuova e la comunica all'azienda di persona.
2. L'azienda firma un `account.recover` con il conto vecchio e la chiave nuova. La banca aggiunge la propria firma.
3. La transazione entra nel registro ma **non ha effetto per 7 giorni**. Il sito la mostra in evidenza: "richiesto recupero del conto di Marco Rossi, effettivo il [data]".
4. Se nei 7 giorni il titolare della chiave vecchia firma un qualsiasi movimento, il recupero decade: la chiave non era persa.
5. Passati i 7 giorni, il motore sposta il saldo sul conto nuovo e chiude il vecchio.

Due firme e sette giorni pubblici rendono impossibile a una persona sola, anche a te, svuotare un conto altrui di nascosto. Costa una settimana di attesa a chi ha perso davvero il telefono. È il prezzo giusto.

Non esiste backup della chiave presso la banca. Se ci fosse, la regola 11.2 sarebbe una finzione.

## 10. Il motore giornaliero

Un comando: `node motore/pubblica.js`. Ogni giorno, a un'ora fissa:

1. Legge `ledger.jsonl` da capo.
2. Verifica ogni riga (sezione 6). Al primo errore si ferma, scrive una pagina di errore con `seq` e motivo, e committa quella.
3. Calcola lo stato (sezione 8).
4. Applica i recuperi maturati (sezione 9) generando le righe corrispondenti. È l'unico caso in cui il motore scrive nel registro, ed è deterministico: chiunque riesegua il motore sullo stesso registro ottiene le stesse righe.
5. Genera il sito: pagina principale con valore, riserva, circolazione, budget residuo, catalogo in vigore con valori in gettoni; pagina del registro completo; pagina dei recuperi in attesa; una riga in fondo con data, ora, `seq` dell'ultima transazione e il suo hash.
6. Committa registro e sito con messaggio `Pubblicazione YYYY-MM-DD, seq N, hash H`.

Nella fase B il comando gira su GitHub Actions con un cron. Il repository stesso è la prova di indipendenza: ogni pubblicazione è un commit, e la cronologia mostra se qualcuno ha toccato il registro fuori dal motore.

Il sito è statico: HTML generato, nessun database, nessun server da bucare. Chi lo legge può scaricare il registro e rifare i conti con il motore.

## 11. Cosa può fare la banca e cosa no

Vale la pena essere espliciti, perché la banca sei tu.

| La banca può | La banca non può |
|---|---|
| Rifiutare una transazione invalida | Accettarne una invalida: il motore la rileverebbe e il sito mostrerebbe l'errore |
| Eseguire le conversioni | Cambiare la commissione o il valore: sono calcolati |
| Registrare aziende | Registrare dipendenti: lo fa l'azienda |
| Firmare correzioni motivate | Cancellare o modificare righe: la catena si romperebbe |
| Partecipare a un recupero | Fare un recupero da sola: servono due firme e sette giorni |
| Spegnere il server | Nasconderlo: il motore pubblica l'assenza di aggiornamenti |

## 12. Cosa questo documento lascia aperto

Da decidere nei passi successivi, non ora.

- L'ora della pubblicazione giornaliera e il fuso orario di riferimento per il "mese di gioco".
- Il formato esatto del catalogo e se una voce può avere un limite mensile per persona.
- Come i dipendenti ricevono la chiave nella fase D: generata nel browser al primo accesso, con un codice di invito firmato dall'azienda.
- Se il memo dei trasferimenti è pubblico (nel registro) o cifrato per il destinatario. Nella fase A è pubblico.
- Backup del registro fuori dal repository.

## 13. Piano dei passi

Ognuno un commit o pochi, ognuno autorizzato.

| Passo | Contenuto | Fase |
|---|---|---|
| 3 | Serializzazione canonica, hash, chiavi Ed25519, firma e verifica. Test | A |
| 4 | Registro: genesi, accodamento, verifica della catena. Test | A |
| 5 | Registrazione aziende e dipendenti, versamenti, stato dei conti. Test | A |
| 6 | Emissione con budget mensile, catalogo, trasferimenti. Test | A |
| 7 | Conversione con commissione e valore. Test | A |
| 8 | Chiusura conti, recupero chiave, correzioni. Test | A |
| 9 | Generatore del sito statico | A |
| 10 | GitHub Actions con cron giornaliero e Pages | B |
| 11 | Server banca via HTTP | C |
| 12 | Portafoglio web | D |

Dopo il passo 9 il sistema è già collaudabile da riga di comando con dati finti per un mese intero, prima di coinvolgere chiunque.
