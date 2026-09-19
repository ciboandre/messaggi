# Architettura del registro

Versione 2.1 — 19 settembre 2026
Stato: proposta per la fase di test. Da confermare prima del primo codice.

Questo documento traduce le [regole](REGOLE_MONETA.md) in struttura tecnica. Ogni scelta rimanda alla sezione delle regole che la giustifica.

## 1. Le parti del sistema

```
  app del correntista            pannello azienda        pannello polizia
  (chiavi, QR, bonifici,         (versamenti, stipendi,  (verbali, repliche,
   multe, contestazioni)          premi, catalogo,        conto polizia)
          │                        tariffario)                 │
          │ transazioni firmate         │                       │
          ▼                             ▼                       ▼
     ┌──────────────────────────────────────────────────────────────┐
     │  banca (server): riceve, valida contro le regole, accoda     │
     └──────────────────────────────┬───────────────────────────────┘
                                    │ ledger.jsonl (catena di hash)
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
     motore giornaliero        giudice (IA)          chiunque
     verifica, calcola,        legge i fascicoli,    scarica e
     genera il sito,           firma sentenze        verifica
     committa
```

| Componente | Compito | Regole |
|---|---|---|
| **App del correntista** | Custodisce le chiavi, genera indirizzi usa e getta, riconosce i propri movimenti nel registro, firma pagamenti, bonifici, conversioni, contestazioni | 8, 12, 15 |
| **Pannello azienda** | Firma versamenti, stipendi e premi a fine mese, catalogo, tariffario, nomina della polizia, trattenute | 4, 5, 9, 10 |
| **Pannello polizia** | Firma verbali e repliche; è anche l'app del conto polizia | 10 |
| **Banca** | Unico scrittore del registro. Valida ogni transazione, la accoda, esegue le conversioni, tiene l'anagrafica | 3, 7, 14 |
| **Registro** | File append-only, una transazione per riga, catena di hash | 14.3 |
| **Giudice** | Servizio che riceve i fascicoli delle contestazioni, interroga un modello di intelligenza artificiale con istruzioni pubbliche, firma la sentenza | 11 |
| **Motore giornaliero** | Rilegge il registro da zero, verifica, calcola lo stato, genera il sito, committa | 14 |

Banca, giudice e motore sono programmi separati sullo stesso codice. Il motore non scrive mai nel registro. Se la banca accodasse qualcosa di invalido, il motore lo rifiuta e il sito mostra l'errore.

## 2. Fasi di sviluppo

| Fase | Cosa esiste | Cosa manca |
|---|---|---|
| **A. Nucleo** | Chiavi, indirizzi usa e getta, registro, tutte le transazioni, motore da riga di comando, test | Server, sito, app, giudice |
| **B. Pubblicazione** | Motore su GitHub Actions ogni giorno, sito su GitHub Pages | Server, app, giudice |
| **C. Banca e giudice** | Server che accetta transazioni firmate via HTTP; servizio giudice | App |
| **D. App e pannelli** | App del correntista nel browser del telefono con QR; pannelli azienda e polizia | |

Nella fase A tutto si prova da riga di comando con chiavi finte, per un mese intero simulato, prima di coinvolgere chiunque.

## 3. Tecnologia

- **Node.js** (versione 26 installata). Librerie di sistema: `node:crypto` per hash, casualità e cifratura simmetrica, `node:test` per i test, `node:fs` per il registro.
- **Una sola dipendenza esterna: `@noble/curves`** (con `@noble/hashes`), per l'aritmetica sulla curva Ed25519 che serve agli indirizzi usa e getta. `node:crypto` firma e verifica con Ed25519 ma non espone le operazioni sui punti della curva. Noble è piccola, senza dipendenze a sua volta, con audit pubblici, ed è la scelta standard nell'ecosistema. Nessun'altra dipendenza nella fase A; ogni aggiunta va motivata nel commit.
- **JavaScript con JSDoc**, non TypeScript. Nessun passo di compilazione.
- **JSONL** per il registro. Una riga per transazione, leggibile con qualsiasi strumento, diffabile in git.
- **Giudice**: un modello linguistico interrogato via API dal servizio giudice. Il modello e la versione sono un parametro pubblico; le istruzioni sono un file nel repository.

## 4. Unità di misura

Nessun decimale. Tutte le quantità sono interi.

| Grandezza | Unità |
|---|---|
| Manti | centesimi di manto (1 manto = 100) |
| Euro | centesimi di euro |
| Tempo | ISO 8601 in UTC |
| Mese di gioco | intero da 1; il mese 1 è quello della genesi |

Il valore del manto non viene mai memorizzato: è il rapporto tra due interi. Le conversioni arrotondano per difetto al centesimo di euro; il resto rimane in riserva.

Emissione del mese *m*: `floor(50000 × 0.98^(m−1))` centesimi di manto. Stipendio base del mese: `floor(emissione / 2 / dipendenti attivi)` per ciascuno; il resto della divisione non si emette. Premi: al massimo `emissione − stipendio base totale`.

## 5. Chiavi, coordinate e indirizzi usa e getta

Questa è la parte che rende i saldi segreti su un registro pubblico (regola 12). Usa la tecnica degli indirizzi stealth: crittografia standard su Ed25519, nessuna invenzione.

**Apertura del conto.** L'app è pubblica e chiunque la installa. Al primo avvio genera la frase di recupero, la fa trascrivere e verificare (tre parole a caso), deriva le chiavi e mostra le coordinate. Non parla con nessun server per farlo. L'indirizzo del server banca e le coordinate dell'azienda e della polizia sono nell'app stessa, firmati con la chiave banca, così un'app non può essere indirizzata a un server finto.

**Ogni correntista ha:**

- una **frase di recupero** di dodici parole, generata al primo avvio e mai trasmessa;
- da questa, due chiavi private: la **chiave di spesa** `s` e la **chiave di vista** `v`, con le rispettive pubbliche `S = s·G` e `V = v·G`;
- le **coordinate bancarie**: la coppia `(S, V)` codificata in una stringa con prefisso e checksum, per esempio `MNT1…`. Sono l'equivalente dell'IBAN: si danno a chi deve inviarci qualcosa, e non rivelano nulla del saldo.

**Quando qualcuno paga a delle coordinate `(S, V)`:**

1. genera un numero casuale `r` e calcola `R = r·G`;
2. calcola il segreto condiviso `k = H(r·V)`;
3. calcola l'**indirizzo usa e getta** `P = S + k·G`;
4. scrive nel registro un'uscita con `P`, `R` e l'importo.

**Il destinatario riconosce le proprie entrate** scorrendo il registro: per ogni uscita calcola `k' = H(v·R)` e controlla se `S + k'·G = P`. Solo chi ha `v` ci riesce. Per spendere da `P` usa la chiave privata `p = s + k'`, che solo chi ha `s` può calcolare.

Il registro mostra `P`, `R` e l'importo. Nessuno, nemmeno la banca, può collegare due indirizzi alla stessa persona o sommarne il saldo.

**Il QR "ricevi"** contiene le coordinate `(S, V)` e, se voluto, l'importo. Chi inquadra fa i passi 1–4. Il **bonifico** è la stessa cosa con le coordinate prese dalla rubrica invece che dal QR.

**Ruoli di sistema** (banca, azienda, polizia, giudice) hanno una chiave Ed25519 semplice per firmare, più coordinate come tutti per ricevere manti quando serve (la banca per le commissioni, la polizia per le multe).

**Le causali** e ogni altro testo destinato a una sola persona sono cifrati con una chiave derivata dallo stesso segreto `k`, così solo il destinatario li legge.

## 6. Uscite ed entrate

Il registro non ha conti con un saldo. Ha **uscite**: ognuna è una somma di manti ferma su un indirizzo usa e getta, finché qualcuno la spende. Un pagamento **consuma** una o più uscite proprie per intero e ne **crea** di nuove: una per il destinatario e, se avanza, una per sé stessi a un indirizzo nuovo (il resto). È il modello di Bitcoin, senza la parte di mining.

```
uscita = { addr: P, eph: R, amount: 1500, memo: "…cifrato…", tag: "premio:recensione" }
```

Il campo `tag` c'è solo sulle uscite create dall'azienda a fine mese (stipendio base, premio e quale voce, trattenuta) e sulla commissione della banca. Serve al motore per controllare i limiti dell'emissione. Sui pagamenti tra correntisti non c'è.

Il saldo di un correntista è la somma delle proprie uscite non ancora spese. Lo calcola l'app, nessun altro.

## 7. Il registro

Un file `ledger.jsonl`. Ogni riga:

```json
{
  "seq": 412,
  "ts": "2026-12-14T17:32:10Z",
  "type": "transfer",
  "body": { "in": ["3a1f…:0", "b902…:1"], "out": [ …uscite… ], "ref": null },
  "prev": "9f8e7d…",
  "hash": "0c1d2e…",
  "sigs": [ { "by": "P1", "sig": "…" }, { "by": "P2", "sig": "…" } ]
}
```

| Campo | Significato |
|---|---|
| `seq` | Progressivo da 0, senza buchi |
| `ts` | Quando la banca ha accodato |
| `type` | Tipo, sezione 8 |
| `body` | Contenuto, dipende dal tipo |
| `prev` | Hash della riga precedente; zeri nella genesi |
| `hash` | SHA-256 della serializzazione canonica di `seq`, `ts`, `type`, `body`, `prev` |
| `sigs` | Una firma Ed25519 dell'`hash` per ogni chiave che deve autorizzare la riga: le chiavi usa e getta delle entrate consumate, oppure la chiave del ruolo |

**Serializzazione canonica**: JSON con chiavi in ordine alfabetico, senza spazi, UTF-8.

**Chi firma cosa.** Chi chiede il movimento riceve dalla banca `seq`, `ts` e `prev` proposti, firma la riga completa, la rimanda. Se nel frattempo è entrata un'altra riga, la banca rifiuta e l'app ritenta. Ogni firma è legata a una posizione precisa della catena: non si può riutilizzare altrove.

**Verifica di una riga**: hash ricalcolato uguale; ogni firma valida per la chiave indicata; `prev` uguale all'hash della riga precedente; regole del tipo rispettate dato lo stato fino a quel punto. **Verifica del registro**: dalla riga 0 all'ultima. Il motore la fa ogni giorno da capo.

## 8. I tipi di transazione

| Tipo | Firma | Contenuto | Validità |
|---|---|---|---|
| `genesis` | banca | Parametri delle regole, chiave pubblica della banca, sue coordinate | Solo a `seq` 0 |
| `company.register` | banca | Chiave pubblica e coordinate dell'azienda, nome pubblico | Una volta per azienda |
| `police.appoint` | azienda | Chiave pubblica e coordinate della polizia | Sostituisce la precedente |
| `judge.register` | banca | Chiave pubblica del giudice, versione delle istruzioni | Sostituisce la precedente |
| `reserve.deposit` | azienda | Centesimi di euro, mese | Positivo. Uno per mese |
| `catalog.set` | azienda | Catalogo completo | Sostituisce il precedente |
| `tariff.set` | azienda | Tariffario completo | Sostituisce il precedente |
| `payout` | azienda | Uscite con `tag` stipendio o premio, numero di dipendenti attivi, trattenute con riferimento ai verbali | Ultimo giorno del mese. Somma stipendi = base × attivi. Somma premi ≤ quota premi. Ogni trattenuta riferisce un verbale definitivo e crea un'uscita alla polizia |
| `transfer` | chiavi usa e getta delle entrate | Entrate consumate, uscite create, `ref` facoltativo a un verbale | Entrate esistenti e non spese. Somma entrate = somma uscite |
| `conversion.request` | chiavi usa e getta delle entrate | Entrate consumate, importo, dati di pagamento e prova di identità cifrati per la banca | Entrate non spese. Il richiedente è identificato in anagrafica (dipendente registrato, o esterno identificato una volta). Nessun verbale definitivo non saldato |
| `conversion.execute` | banca | Riferimento alla richiesta, manti distrutti, commissione (uscita alla banca), euro dovuti | Commissione = 2%. Euro = resto × valore, per difetto. Riserva sufficiente |
| `conversion.paid` | banca | Riferimento, data del pagamento in euro | Una per esecuzione |
| `fine.issue` | polizia | Numero verbale, voce del tariffario, importo, data, descrizione cifrata per il multato, indirizzo usa e getta di consegna | Voce esistente, importo uguale al tariffario |
| `fine.contest` | chiave usa e getta dell'indirizzo di consegna | Verbale, testo cifrato per giudice e polizia | Entro 15 giorni. Prova di essere il destinatario |
| `fine.reply` | polizia | Verbale, testo cifrato per il giudice | Una per contestazione |
| `verdict` | giudice | Verbale, esito (confermato, annullato, ridotto a voce), motivazione pubblica, hash del fascicolo | Contestazione aperta |
| `correction` | banca | Riferimento alla riga errata, movimento inverso, motivazione | Solo per righe segnalate invalide dal motore |

Il pagamento di una multa è un `transfer` con `ref` al verbale, verso l'indirizzo che il verbale indica. Non esiste un tipo per creare manti fuori da `payout`, né per consumare un'entrata senza la sua chiave. Il codice non li riconosce.

## 9. Lo stato

Calcolato rileggendo tutto, mai memorizzato:

- **Uscite non spese**: l'insieme da cui si può pagare. La circolazione è la loro somma.
- **Emessi**: somma dei `payout`. **Distrutti**: somma delle conversioni eseguite. Circolazione = emessi − distrutti, che deve coincidere con la somma delle uscite non spese.
- **Riserva**: versamenti − euro dovuti.
- **Valore**: riserva / circolazione.
- **Verbali**: aperti, pagati (un `transfer` con `ref`), contestati, decisi, definitivi non pagati (da trattenere).
- **Catalogo, tariffario, polizia, giudice** in vigore.

L'**anagrafica** (nome ↔ coordinate ↔ verbali a carico ↔ identificato sì/no) è fuori dal registro, in un file cifrato della banca; la parte dei dipendenti è condivisa con l'azienda. Serve per stipendi, multe, conversioni e trattenute. Non è pubblica e non è necessaria per verificare il registro. Un esterno che non ha mai chiesto di convertire non compare da nessuna parte.

## 10. Il giudice

Un servizio con la propria chiave. Quando una contestazione riceve l'eventuale replica o scadono 3 giorni senza replica:

1. costruisce il **fascicolo**: verbale, voce del tariffario in vigore alla data, contestazione decifrata, replica decifrata, e nient'altro. Nessun nome, nessun saldo, nessuna storia della persona;
2. interroga il modello con le **istruzioni** in `giudice/istruzioni.md` e il fascicolo;
3. ottiene un esito tra confermato, annullato, ridotto a una voce del tariffario, con motivazione;
4. firma un `verdict` con esito, motivazione e hash del fascicolo, e lo invia alla banca.

Il fascicolo completo (decifrato) viene conservato dalla banca e mostrato solo alle parti. La motivazione è pubblica. Le istruzioni sono versionate: il `verdict` riporta la versione usata.

Se il modello non risponde, non risponde in modo interpretabile, o risponde con un esito non ammesso, nessuna sentenza viene emessa e la contestazione resta aperta. Nessun termine corre.

## 11. Il motore giornaliero

`node motore/pubblica.js`, ogni giorno alle 06:00:

1. legge `ledger.jsonl` da capo e verifica ogni riga. Al primo errore scrive una pagina di errore con `seq` e motivo, la committa, e si ferma;
2. calcola lo stato;
3. genera il sito: valore, riserva, circolazione, emessi e distrutti, mese in corso con dipendenti attivi ed emissione prevista, catalogo, tariffario, sentenze, registro completo con uscite anonime, riga di firma con data, `seq` e hash;
4. committa sito e registro con messaggio `Pubblicazione YYYY-MM-DD, seq N, hash H`.

Non scrive mai nel registro. Il sito è statico. Chiunque può scaricare registro e motore e ottenere la stessa pagina.

## 12. Cosa può fare la banca e cosa no

| Può | Non può |
|---|---|
| Rifiutare una transazione invalida | Accettarne una invalida senza che il motore lo mostri |
| Eseguire e segnare pagate le conversioni | Cambiare valore o commissione: sono calcolati |
| Registrare l'azienda, il giudice | Nominare la polizia: lo fa l'azienda |
| Sapere chi sono i correntisti | Sapere i loro saldi o collegare i loro indirizzi |
| Bloccare le conversioni di chi ha multe definitive non pagate | Prelevare da un indirizzo |
| Firmare correzioni motivate | Cancellare o modificare righe |
| Spegnere il server | Nasconderlo: il motore pubblica l'assenza di aggiornamenti |

## 13. Lasciato aperto

- Codifica esatta delle coordinate bancarie (prefisso, checksum) e formato del QR.
- Formato del catalogo e del tariffario; se una voce ha un limite mensile per persona.
- Come l'app scorre il registro in modo efficiente quando cresce (indice delle uscite per `R`).
- Come un esterno si identifica presso la banca per convertire: di persona, o con documento caricato cifrato nella richiesta. Da decidere con l'avvocato insieme al perimetro legale.
- Backup del registro fuori dal repository.
- Modello e versione per il giudice, e formato esatto delle istruzioni.

## 14. Piano dei passi

| Passo | Contenuto | Fase |
|---|---|---|
| 4 | Serializzazione canonica, hash, chiavi Ed25519, firma e verifica. Test | A |
| 5 | Frase di recupero, chiavi di spesa e di vista, coordinate, indirizzi usa e getta, riconoscimento delle entrate. Test | A |
| 6 | Registro: genesi, accodamento, verifica della catena. Test | A |
| 7 | Uscite ed entrate, `transfer` con resto, cifratura delle causali. Test | A |
| 8 | Azienda, polizia, giudice: registrazioni, versamenti, catalogo, tariffario. Test | A |
| 9 | `payout` di fine mese con stipendi, premi e trattenute. Test | A |
| 10 | Conversioni con commissione e blocco per multe. Test | A |
| 11 | Verbali, contestazioni, repliche, sentenze (giudice finto), esecuzione forzata. Test | A |
| 12 | Motore giornaliero e generatore del sito statico | A |
| 13 | Simulazione di tre mesi con dati finti da riga di comando | A |
| 14 | GitHub Actions con cron e Pages | B |
| 15 | Server banca via HTTP | C |
| 16 | Servizio giudice con modello reale e istruzioni pubbliche | C |
| 17 | App del correntista con QR | D |
| 18 | Pannelli azienda e polizia | D |
