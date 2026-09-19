# Architettura del registro

Versione 3.1 — 19 settembre 2026
Stato: proposta per la fase di test. La 3.1 introduce importi e mittente riservati nei pagamenti tra correntisti (sezioni 6 e 8).

Questo documento traduce le [regole](REGOLE_MONETA.md) in struttura tecnica. Ogni scelta rimanda alla sezione delle regole che la giustifica.

## 1. Le parti del sistema

```
  app del correntista        pannello azienda         pannello polizia       pannello banca
  (chiavi, QR, bonifici,     (acquisti, stipendi,     (verbali, repliche,    (vendite, conversioni,
   acquisti, conversioni,     premi, catalogo,         conto polizia)         riserva, tetto,
   multe, contestazioni)      tariffario, dipendenti)                         identificazioni)
          │                        │                        │                       │
          ▼                        ▼                        ▼                       ▼
     ┌────────────────────────────────────────────────────────────────────────────────┐
     │  banca (server): riceve transazioni firmate, valida contro le regole, accoda   │
     └───────────────────────────────────────┬────────────────────────────────────────┘
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
| **App del correntista** | Custodisce le chiavi, genera indirizzi usa e getta, riconosce e decifra i propri movimenti, sceglie le esche, costruisce impegni, prove e firme ad anello, firma pagamenti, bonifici, richieste di acquisto e conversione, contestazioni | 7, 8, 12, 15 |
| **Pannello azienda** | Acquisti dalla banca, stipendi e premi dal proprio conto, registrazione dipendenti e attestati, catalogo, tariffario, polizia, trattenute | 9, 10 |
| **Pannello polizia** | Verbali e repliche; app del conto polizia | 10 |
| **Pannello banca** | Vendite, esecuzione conversioni, riserva e interessi, estratti, tetto, identificazioni | 4, 5, 7 |
| **Server banca** | Unico scrittore del registro. Valida ogni transazione e la accoda. Tiene l'anagrafica | 14 |
| **Registro** | File append-only, una transazione per riga, catena di hash | 14.3 |
| **Giudice** | Servizio che interroga un modello con istruzioni pubbliche e firma sentenze | 11 |
| **Motore giornaliero** | Rilegge il registro da zero, verifica, calcola lo stato, genera il sito, committa | 14 |

Server, giudice e motore sono programmi separati sullo stesso codice. Il motore non scrive mai nel registro. Se il server accodasse qualcosa di invalido, il motore lo rifiuta e il sito mostra l'errore.

## 2. Fasi di sviluppo

| Fase | Cosa esiste | Cosa manca |
|---|---|---|
| **A. Nucleo** | Chiavi, indirizzi usa e getta, registro, tutte le transazioni, motore da riga di comando, test | Server, sito, app, giudice |
| **B. Pubblicazione** | Motore su GitHub Actions ogni giorno, sito su GitHub Pages | Server, app, giudice |
| **C. Server e giudice** | Server che accetta transazioni firmate via HTTP; servizio giudice; incasso e identificazione con Stripe | App e pannelli |
| **D. App e pannelli** | App del correntista con QR; pannelli banca, azienda e polizia | |

Nella fase A tutto si prova da riga di comando con chiavi finte, per tre mesi simulati, prima di coinvolgere chiunque.

## 3. Tecnologia

- **Node.js** (versione 26 installata). Librerie di sistema: `node:crypto` per hash, casualità e cifratura simmetrica, `node:test` per i test, `node:fs` per il registro.
- **Una sola famiglia di dipendenze esterne, noble/scure** dello stesso autore, con audit pubblici e senza dipendenze a loro volta: `@noble/curves` per l'aritmetica su Ed25519, `@noble/hashes` per SHA-256 e SHA-512, `@scure/bip39` per la frase di dodici parole, `@scure/base` per bech32m e base64, `@noble/ciphers` per XChaCha20-Poly1305 sulle causali. Si usano anche al posto di `node:crypto` per hash e firme, così il nucleo gira identico in Node e nel browser (regola: stesso codice sul server e nell'app). Ogni altra aggiunta va motivata nel commit.
- **Riservatezza alla Monero, scritta in casa.** Nessuna libreria pronta: impegni di Pedersen, prove di intervallo, firme ad anello e immagini di chiave stanno in `nucleo/`, su Ed25519 con le primitive di `@noble/curves`. Nel dettaglio:
  - **secondo generatore** `H = hash_to_curve("manti/H/v1")` con l'Elligator 2 di RFC 9380 che noble espone per Ed25519; nessuno conosce il logaritmo di `H` rispetto a `G`;
  - **impegno** di un importo `a` con maschera `b`: `C = b·G + a·H`. Un importo in chiaro è l'impegno con `b = 0`;
  - **prova di intervallo**: Bulletproofs+ a 64 bit, una prova aggregata per riga fino a 16 uscite riservate (riempite a potenza di 2 con impegni all'identità), così un importo non può essere negativo né traboccare;
  - **immagine di chiave** dell'indirizzo `P` con chiave privata `p`: `I = p·hash_to_curve(P)`. È la stessa per chiunque spenda `P`, quindi la doppia spesa si vede;
  - **firma ad anello** CLSAG sull'hash della riga: prova che il firmatario conosce la chiave di uno dei membri e la differenza di maschera tra il suo impegno e lo pseudo-impegno dichiarato, senza rivelare quale membro.
  Ogni costruzione ha test contro vettori generati a mano e contro le proprietà (una prova falsificata non passa, un'immagine ripetuta viene rifiutata). Prima di soldi veri va fatta rivedere da qualcuno che non l'ha scritta.
- **Firma degli indirizzi usa e getta.** La chiave privata di un indirizzo è uno scalare `s + k`, non un seme: si firma con lo scalare direttamente (nonce deterministico da scalare e messaggio) e la firma che ne esce è una firma Ed25519 normale, verificata dalla stessa funzione standard. È la tecnica di Monero; i test lo controllano.
- **JavaScript con JSDoc**, non TypeScript.
- **JSONL** per il registro.
- **Giudice**: un modello linguistico via API. Modello e versione sono parametri pubblici; le istruzioni sono un file nel repository.
- **Nessuna fonte esterna per il valore**: la riserva è in euro e il valore si calcola dal solo registro. Il motore è completamente deterministico.

## 4. Unità di misura

Nessun decimale. Tutte le quantità sono interi.

| Grandezza | Unità |
|---|---|
| Manti | centesimi di manto (1 manto = 100) |
| Euro | centesimi di euro |
| Prezzi | centesimi di euro per manto, con quattro decimali interni (1 manto = 1,0000 €) |
| Tempo | ISO 8601 in UTC |

Formule, tutte su interi BigInt, con l'arrotondamento sempre nel verso che lascia euro in riserva (in `banca.js`, due sole funzioni: `perDifetto` e `perEccesso`):

- `valore = riserva_cent × 10000 / circolazione_cent` per difetto (in decimillesimi di euro per manto; nessuno a circolazione zero)
- `prezzo_acquisto = valore × 105 / 100` per eccesso; `manti_venduti = euro_pagati × 10000 / prezzo_acquisto` per difetto. A circolazione zero il prezzo è quello di lancio, 1,0000 €
- `prezzo_conversione = valore × 98 / 100` per difetto; `euro_dovuti = manti × prezzo_conversione / 10000` per difetto

Invariante, ricontrollato da ogni riga della banca dopo aver cambiato lo stato: `riserva × 10000 ≥ circolazione × valore_prima`, cioè il valore non scende mai. Gli importi nelle righe sono interi JSON; le somme nello stato sono BigInt.
- `bruciati_per_multa = importo / 2` (se dispari, il centesimo in più va alla polizia)

## 5. Chiavi, coordinate e indirizzi usa e getta

Questa è la parte che rende i saldi segreti su un registro pubblico (regola 12). Usa la tecnica degli indirizzi stealth su Ed25519, crittografia standard.

**Apertura del conto.** L'app è pubblica. Al primo avvio genera la frase di recupero, la fa trascrivere e verificare, deriva le chiavi e mostra le coordinate. Non parla con nessun server. L'indirizzo del server e la chiave pubblica della banca sono nell'app stessa.

**Registrazione presso un'azienda.** Il dipendente mostra le coordinate; il pannello azienda le salva in anagrafica e genera un **attestato**: un QR firmato con la chiave azienda con coordinate del dipendente, nome dell'azienda, coordinate della polizia e data. L'app lo inquadra e lo conserva. Solo con l'attestato mostra la sezione multe. La revoca è un attestato di cancellazione. Un'app senza attestato è un conto esterno.

**Ogni correntista ha:**

- una **frase di recupero** di dodici parole, generata al primo avvio e mai trasmessa;
- da questa, la **chiave di spesa** `s` e la **chiave di vista** `v`, con le pubbliche `S = s·G` e `V = v·G`;
- le **coordinate**: la coppia `(S, V)` in bech32m con prefisso `mnt`, 113 caratteri, con checksum. Sono l'equivalente dell'IBAN. La frase usa la lista di parole italiana di BIP39; le chiavi `s` e `v` sono derivate dal seme della frase con hash separati (`manti/spesa/v1`, `manti/vista/v1`).

**Quando qualcuno paga a delle coordinate `(S, V)`:** genera `r` casuale, `R = r·G`, `k = H(r·V)`, indirizzo usa e getta `P = S + k·G`; scrive un'uscita con `P`, `R` e l'importo.

**Il destinatario riconosce le proprie entrate** scorrendo il registro: per ogni uscita calcola `k' = H(v·R)` e controlla se `S + k'·G = P`. Per spendere usa `p = s + k'`.

Nessuno, nemmeno la banca, può collegare due indirizzi alla stessa persona o sommarne il saldo. Con gli impegni e gli anelli della sezione 6, nemmeno leggere quanto passa né da dove.

**Ruoli di sistema** (banca, aziende, polizie, giudice) hanno una chiave Ed25519 per firmare, più coordinate come tutti per ricevere manti (l'azienda quando compra, la polizia per le multe).

**Le causali** e ogni testo per una sola persona sono cifrati con una chiave derivata dallo stesso segreto `k`. Dallo stesso `k` si derivano la **maschera** dell'impegno (`b = H("manti/maschera/v1" ‖ k)` mod ordine) e la chiave che cifra l'**importo** (8 byte, XOR con `H("manti/importo/v1" ‖ k)`): il destinatario ricava tutto da `R` e `v`, chi paga da `r` e `V`.

## 6. Uscite ed entrate

Il registro non ha conti con un saldo. Ha **uscite**: manti fermi su un indirizzo usa e getta finché qualcuno li spende. Un movimento consuma una o più uscite proprie per intero e ne crea di nuove: per il destinatario e, se avanza, per sé stessi a un indirizzo nuovo. È il modello di Bitcoin per la struttura, di Monero per la riservatezza.

**Tre forme di uscita:**

```
riservata = { addr: P, eph: R, commit: C, amt: "…8 byte cifrati…", memo: "…cifrato…" }
in chiaro = { addr: P, eph: R, amount: 1500, tag: "stipendio", memo: "…cifrato…" }
bruciata  = { addr: null, amount: 100, reason: "multa:V-031" }
```

- **Riservata**: l'importo `a` e la maschera `b` sono noti a chi paga e a chi riceve; nel registro c'è `C = b·G + a·H` e l'importo cifrato. La creano i correntisti.
- **In chiaro**: importo visibile, impegno implicito `a·H`. La creano i ruoli: la banca nelle vendite, le aziende in stipendi, premi e trattenute, la polizia; e chiunque paghi una multa, per la metà che va alla polizia. Il `tag` c'è sulle uscite create da banca e aziende.
- **Bruciata**: `addr: null`, importo visibile, manti fuori dalla circolazione per sempre.

**Due modi di spendere:**

```
in anello = { ring: ["3a1f…:0", "b07c…:2", … 16 riferimenti], img: "I", pseudo: "C'" }
in chiaro = { ref: "3a1f…:0" }                       (se l'uscita era riservata: + amount, mask)
```

- **In anello**, per i correntisti: l'entrata vera sta tra sedici riferimenti a uscite del registro, in ordine di creazione; `img` è l'immagine di chiave dell'indirizzo vero; `pseudo` è un nuovo impegno allo stesso importo con maschera diversa, scelta da chi paga. Le esche sono uscite riservate o in chiaro di righe precedenti, non spese in chiaro. Se le uscite disponibili nate fino all'esca più recente sono meno di sedici, l'anello le comprende tutte: contare fino all'esca più recente, e non fino all'ultima riga, rende valida una riga anche se altre uscite nascono mentre viaggia. Come scegliere le esche è lasciato aperto (sezione 13).
  Con una manciata di uscite l'anello dice tutto: la riservatezza delle prime spese è nominale finché il registro non ha almeno qualche decina di uscite.
- **In chiaro**, per i ruoli: l'entrata è dichiarata. Se era un'uscita riservata (un'azienda che incassa un pagamento), la riga rivela importo e maschera, il motore ricalcola l'impegno, e porta anche l'immagine di chiave con una firma ad anello di uno: così la stessa uscita non si spende una volta in anello e una in chiaro. Il controllo va nei due versi: una rivelazione con immagine già spesa è invalida, e la rivelazione registra l'immagine.

**Bilancio di una riga.** Vale sempre, senza leggere gli importi riservati:

    Σ pseudo-impegni delle entrate in anello + Σ (importo in chiaro delle entrate)·H
  = Σ impegni delle uscite riservate + Σ (importo in chiaro delle uscite + bruciature)·H

Chi costruisce la riga sceglie le maschere degli pseudo-impegni in modo che tornino; il motore verifica l'uguaglianza di punti. La prova di intervallo, una per riga, copre tutte le uscite riservate. Le entrate in anello sono valide se ogni `img` non compare già nel registro e ogni firma CLSAG passa sull'anello degli indirizzi e delle differenze `C_j − pseudo`.

Il saldo di un correntista è la somma delle proprie uscite non spese: lo calcola l'app, scorrendo il registro con la chiave di vista e decifrando gli importi. Nessun altro può.

## 7. Il registro

Un file `ledger.jsonl`. Ogni riga:

```json
{ "seq": 412, "ts": "2026-12-14T17:32:10Z", "type": "transfer",
  "body": { "in": [ { "ring": [ …16 ], "img": "…", "pseudo": "…" } ],
            "out": [ { "addr": "…", "eph": "…", "commit": "…", "amt": "…" }, … ],
            "proof": "…", "ref": null },
  "prev": "9f8e7d…", "hash": "0c1d2e…",
  "sigs": [ { "img": "…", "sig": "…CLSAG…" } ] }
```

| Campo | Significato |
|---|---|
| `seq` | Progressivo da 0, senza buchi |
| `ts` | Quando il server ha accodato |
| `type` | Tipo, sezione 8 |
| `body` | Contenuto |
| `prev` | Hash della riga precedente; zeri nella genesi |
| `hash` | SHA-256 della serializzazione canonica di `seq`, `ts`, `type`, `body`, `prev` |
| `sigs` | Una firma dell'`hash` per ogni autorizzazione. `{ by, sig }`: Ed25519 della chiave di un ruolo o di un'entrata spesa in chiaro. `{ img, sig }`: CLSAG per ogni entrata in anello, legata alla sua immagine di chiave |

Serializzazione canonica: JSON con chiavi in ordine alfabetico, senza spazi, UTF-8. Chi chiede il movimento riceve dal server `seq`, `ts` e `prev` proposti, firma la riga completa, la rimanda; se nel frattempo è entrata un'altra riga, il server rifiuta e l'app ritenta. Ogni firma è legata a una posizione della catena.

Verifica di una riga: hash uguale, firme valide, `prev` giusto, immagini di chiave nuove, bilancio degli impegni che torna, prova di intervallo valida, regole del tipo rispettate dato lo stato fino a lì. Verifica del registro: dalla riga 0 all'ultima, ogni giorno da capo.

## 8. I tipi di transazione

| Tipo | Firma | Contenuto | Validità |
|---|---|---|---|
| `genesis` | banca | Parametri delle regole, chiave e coordinate della banca, tetto iniziale | Solo a `seq` 0 |
| `day` | banca | Data del giorno che si apre | Date crescenti; le righe che seguono non sono datate prima. È il **calendario**: i termini (i 15 giorni delle multe) si contano in righe `day`, non in timestamp, perché è l'unico orologio che chiunque può ricontrollare. Che il calendario sia giusto lo attesta la banca con la firma |
| `cap.set` | banca | Nuovo tetto in centesimi di euro | Sostituisce il precedente |
| `sale` | banca | Euro ricevuti, prezzo applicato, uscite in chiaro verso l'acquirente con `tag: vendita`, riferimento al pagamento in euro | Riserva prima della vendita < tetto. Prezzo = prezzo di acquisto del giorno (1,00 se prima vendita). Manti = euro / prezzo. Riserva += euro |
| `reserve.interest` | banca | Interessi maturati in centesimi di euro, periodo | Riserva += interessi |
| `reserve.statement` | banca | Mese, saldo dell'estratto conto, hash del documento pubblicato | Il saldo coincide con la riserva calcolata, o la riga spiega la differenza. È un'**affermazione firmata**, non una prova: il registro fa i conti tra le sue righe, non può sapere se gli euro esistono. È l'unico punto in cui la fiducia entra nel sistema |
| `company.register` | banca | Chiave, coordinate e nome pubblico dell'azienda | Una volta per azienda |
| `police.appoint` | azienda | Chiave e coordinate della polizia | Sostituisce la precedente |
| `judge.register` | banca | Chiave del giudice, versione delle istruzioni | Sostituisce la precedente |
| `catalog.set` | azienda | Catalogo completo: voci `{ codice, nome, amount }`, codice `[a-z0-9-]` unico | Sostituisce il precedente per quell'azienda |
| `tariff.set` | azienda | Tariffario completo, stessa forma del catalogo | Sostituisce il precedente per quell'azienda |
| `transfer` | CLSAG per ogni entrata in anello | Entrate in anello, uscite riservate (almeno una: il resto c'è sempre, anche da zero), prova di intervallo, `ref` facoltativo a un verbale con le due uscite in chiaro | Immagini di chiave nuove, anelli di uscite esistenti e non spese in chiaro, bilancio degli impegni, prova valida. Se `ref` a un verbale: bruciatura `reason: multa:id` per la quota bruciata, alla polizia il resto con `tag: multa`, `ref` e lo scalare `r` dell'indirizzo, così chiunque ricalcola l'indirizzo dalle coordinate della polizia e vede che i manti sono andati lì |
| `payout` | azienda, più le chiavi usa e getta delle sue entrate (o l'anello di uno delle rivelate) | Entrate in chiaro o rivelate, uscite in chiaro taggate stipendio o premio (voce), trattenute con riferimento ai verbali definitivi, ciascuna con metà alla polizia e metà bruciata; resto all'azienda in chiaro, tag resto | Le uscite di stipendio sono tutte uguali tra loro; ogni premio riferisce una voce del catalogo in vigore con l'importo giusto |
| `conversion.request` | CLSAG per ogni entrata in anello | Entrate in anello, importo in chiaro da convertire, un resto riservato con prova (sempre, anche da zero: altrimenti con una sola entrata lo pseudo-impegno coinciderebbe con l'impegno vero e l'anello direbbe quale membro è), dati di pagamento cifrati per le coordinate della banca, indirizzo effimero di ritorno (per una futura restituzione: il registro non sa di chi è la richiesta, può restituire solo a un indirizzo che la richiesta porta) | Bilancio: Σ pseudo = importo·H + impegno del resto; la prova copre solo il resto. I manti chiesti non sono un'uscita: stanno in `conversioni`, fuori da anelli e spese, in circolazione finché non vengono bruciati. Identificazione e blocco per multe li controlla la banca prima di eseguire, con l'anagrafica: l'anello nasconde di chi è la richiesta anche al registro |
| `conversion.execute` | banca | Riferimento alla richiesta, prezzo applicato, euro dovuti | Prezzo = prezzo di conversione **del giorno dell'esecuzione**: è il valore che la riserva copre in quel momento, e siccome il valore non scende un'esecuzione tardiva non danneggia mai chi ha chiesto. Brucia i manti, riserva −= euro dovuti, invariante ricontrollato |
| `conversion.paid` | banca | Riferimento, data del pagamento in euro | Una per esecuzione. **Affermazione firmata**, come l'estratto conto: che gli euro siano arrivati lo dice solo la banca |
| `fine.issue` | polizia | Azienda, numero verbale, voce, importo, descrizione cifrata per il multato all'indirizzo di consegna | Voce e importo dal tariffario della sua azienda; serve un giorno aperto, il verbale nasce in quel giorno. Il pannello propone solo dipendenti registrati |
| `fine.contest` | chiave usa e getta dell'indirizzo di consegna | Verbale, testo cifrato per giudice e polizia | Entro 15 righe `day` dal giorno del verbale; serve un giudice registrato |
| `fine.reply` | polizia | Verbale, testo cifrato per il giudice | Una per contestazione |
| `verdict` | giudice | Verbale, esito (annullata / confermata), motivazione pubblica, hash del fascicolo, versione delle istruzioni | Contestazione aperta, dopo la replica o dopo 3 giorni senza; versione uguale a quella registrata |
| `fine.withdraw` | polizia | Verbale, motivazione pubblica | Solo se aperto. È un atto del ruolo che l'ha emesso, non una correzione |
| `correction` | banca | Riferimento a una riga **valida ma sbagliata nei fatti**, motivazione pubblica | Oggi solo `reserve.interest`: la riserva torna indietro di quegli euro. Una riga si corregge una volta, al massimo per l'importo che riferisce. È l'unica riga in cui il valore può scendere, perché dichiara che quello di prima era sbagliato. Conseguenza che nessuno può annullare: le conversioni eseguite tra l'interesse sbagliato e la correzione sono state pagate a un prezzo troppo alto, e quella differenza è a carico della banca Mai per righe invalide: quelle non entrano, e se il motore le trova rileggendo la catena è rotta (sezione 11). `sale` non si corregge (i manti sono già di qualcuno): una vendita senza euro si vede nell'estratto conto, e gli euro ce li mette la banca. `cap.set` si corregge con un altro `cap.set` |

Non esiste un tipo che crei manti senza una `sale`, che tolga euro dalla riserva senza una conversione, o che consumi un'entrata senza la sua chiave. Il codice non li riconosce.

Regola generale: **chi firma con la chiave di un ruolo spende e paga in chiaro; chi firma da correntista spende in anello e paga riservato.** Le sole uscite in chiaro create da un correntista sono le due metà di una multa.

**Definitivo non saldato**: un verbale aperto da più di 15 giorni di registro senza contestazione né pagamento, o confermato dal giudice e non pagato. Si paga ancora (anche in ritardo); l'azienda può trattenerlo in un `payout` con la stessa coppia di uscite, al posto del dipendente, e gliela scala fuori dal registro. La banca lo usa per bloccare le conversioni (con l'anagrafica).

## 9. Lo stato

Calcolato rileggendo tutto, mai memorizzato:

- **Uscite**, tutte, con indice per riferimento: servono da esche e da entrate. Non si segnano mai spese, tranne quelle **spese in chiaro** da un ruolo, che escono dagli anelli futuri.
- **Immagini di chiave spese**: una per ogni entrata in anello. Una ripetuta è una doppia spesa e la riga è invalida.
- **Emessi** (somma delle vendite), **convertiti**, **bruciati** (conversioni + multe), tutti in chiaro. **Circolazione** = emessi − bruciati. Non si può ottenere sommando le uscite, perché gli importi riservati non si leggono: si ottiene dalle sole righe dei ruoli, e ogni riga riservata prova di conservarla.
- **Riserva**: vendite + interessi − euro dovuti nelle conversioni eseguite.
- **Valore, prezzo di acquisto, prezzo di conversione**, spazio sotto il tetto.
- **Per azienda**: catalogo, tariffario, polizia in vigore.
- **Verbali**: aperti, pagati, contestati, decisi, definitivi non saldati.

L'**anagrafica** (nome ↔ coordinate ↔ identificato ↔ azienda ↔ verbali a carico) è fuori dal registro, in un file cifrato del server; la parte dei dipendenti è condivisa con la loro azienda. Serve per stipendi, multe, conversioni e trattenute. Non è pubblica e non serve a verificare il registro.

## 10. Il giudice

Un servizio con la propria chiave. Quando una contestazione riceve la replica o passano 3 giorni senza:

1. costruisce il **fascicolo**: verbale, voce del tariffario alla data, contestazione e replica decifrate, e nient'altro;
2. interroga il modello con le **istruzioni** in `giudice/istruzioni.md`;
3. ottiene esito e motivazione;
4. firma un `verdict` e lo invia al server.

Se il modello non risponde o risponde con un esito non ammesso, nessuna sentenza: la contestazione resta aperta e nessun termine corre.

## 11. Il motore giornaliero

`node motore/pubblica.js [ledger.jsonl] [sito/]`, ogni giorno alle 06:00: legge il registro da capo, verifica ogni riga, calcola lo stato, scrive `sito/stato.json` e `sito/index.html` (valore con il conto esplicito, prezzi, riserva e tetto, circolazione, emessi e bruciati, estratti conto con l'avvertenza che sono affermazioni, correzioni, cataloghi, tariffari, verbali e sentenze, registro completo con uscite anonime e senza importi riservati, riga di firma). Non scrive mai nel registro. Il sito è statico, senza script: quello che si vede è quello che c'è nel file. Il commit `Pubblicazione YYYY-MM-DD, seq N, hash H` lo fa la GitHub Action (fase B).

**La catena è o intera o rotta, mai rammendata.** Se una riga non passa la sua regola, il motore scrive quale e perché, esce con codice 1, e il sito mostra l'ultimo stato buono con l'avviso al posto dei numeri correnti. Nessuna riga successiva può neutralizzarne una invalida: per arrivarci bisognerebbe averla saltata, e le righe riservate lasciano effetti che non si tolgono (uscite usate come esche, immagini spese). La segnalazione al momento dell'ingresso è del server (fase C), che una riga invalida la rifiuta prima.

## 12. Cosa può fare la banca e cosa no

| Può | Non può |
|---|---|
| Vendere sotto il tetto, al prezzo del giorno | Vendere sopra il tetto o a un prezzo diverso: il motore rifiuta la riga |
| Eseguire e segnare pagate le conversioni | Cambiare valore, sovrapprezzo o commissione: sono calcolati |
| Alzare o abbassare il tetto, pubblicamente | Prelevare euro dalla riserva per sé: non esiste un tipo di riga per farlo |
| Registrare interessi ed estratti | Dichiarare una riserva diversa dall'estratto senza che si veda |
| Aprire i giorni (`day`) | Far correre i termini senza righe di giorno visibili a tutti |
| Sapere chi ha comprato e chi si è identificato | Sapere i saldi, collegare gli indirizzi, leggere l'importo di un pagamento tra correntisti o sapere quale entrata spende |
| Bloccare le conversioni di chi ha multe definitive non saldate | Prelevare da un indirizzo |
| Firmare correzioni motivate | Cancellare o modificare righe |

**I punti di fiducia**, cioè le sole cose che il registro non può verificare e che valgono per la firma della banca: l'estratto conto (`reserve.statement`), il pagamento in euro delle conversioni (`conversion.paid`), l'arrivo degli euro delle vendite (il riferimento al pagamento in `sale`), e il calendario (`day`). Tutto il resto è aritmetica ricontrollabile da chiunque.

## 13. Lasciato aperto

- Limiti mensili per voce di catalogo e tariffario.
- Come l'app scorre il registro quando cresce (indice delle uscite per `R`). Con gli impegni, per ogni uscita c'è una moltiplicazione scalare in più.
- **Scelta delle esche**: uniforme tra tutte le uscite, o pesata verso le recenti come fa Monero (distribuzione gamma). Uniforme nella fase di test; si decide con i dati.
- **Anelli piccoli nei primi giorni**: la banca può seminare uscite in chiaro a sé stessa nella genesi per dare esche fin dall'inizio. Da valutare.
- **Dimensione delle righe**: un `transfer` con due entrate pesa 2–3 KB tra anelli, firme e prova. Il registro cresce più in fretta; va bene per anni, ma il sito non lo mostra più intero.
- Come un esterno si identifica presso la banca: di persona, o con documento cifrato nella richiesta.
- Come la banca verifica l'arrivo degli euro di una vendita prima di firmarla: manuale nella fase di test. In fase C, Stripe Checkout con webhook: al pagamento riuscito il server fa firmare la `sale` alla chiave banca, con il riferimento del pagamento nel `body`. Stripe Identity per l'identificazione degli esterni. Il nucleo non vede Stripe: una vendita firmata è una vendita firmata.
- Una `conversion.request` che la banca non esegue (richiedente non identificato, multe non saldate) resta in sospeso: serve un tipo di riga che restituisca i manti, firmato dalla banca, verso l'indirizzo di ritorno che la richiesta già porta.
- Backup del registro fuori dal repository.
- Modello e versione per il giudice.

## 14. Piano dei passi

| Passo | Contenuto | Fase |
|---|---|---|
| 4 | Serializzazione canonica, hash, chiavi Ed25519, firma e verifica. Test | A |
| 5 | Frase di recupero, chiavi di spesa e di vista, coordinate bech32m, indirizzi usa e getta, riconoscimento. Test | A |
| 6 | Registro: genesi, accodamento, verifica della catena. Test | A |
| 7 | Uscite, entrate, bruciature, `transfer` in chiaro, causali cifrate. Test. Fatto: il passo 11 lo rende riservato | A |
| 8 | Generatore `H`, impegni di Pedersen, maschera e importo cifrato derivati da `k`, bilancio. Test | A |
| 9 | Prova di intervallo Bulletproofs+ a 64 bit: 9a per un impegno, 9b aggregata per riga. Test | A |
| 10 | Immagini di chiave, anelli, firma CLSAG e verifica. Test | A |
| 11 | `transfer` riservato con resto sopra il passo 7; la spesa in chiaro resta come base del `payout`. Test | A |
| 12 | Vendite, tetto, interessi, estratti, valore e prezzi, invariante di copertura. Test | A |
| 13 | Aziende: registrazione, polizia, catalogo, tariffario, `payout`, rivelazione delle entrate riservate. Test (trattenute al 15) | A |
| 14 | Conversioni: richiesta in anello con resto riservato, esecuzione al prezzo del giorno, pagamento attestato. Test (blocco per multe: della banca, con l'anagrafica) | A |
| 15 | Verbali, pagamento con bruciatura e metà alla polizia verificabile, contestazioni, repliche, sentenze, trattenute, termini in giorni di registro. Test | A |
| 16 | Motore giornaliero e generatore del sito; `correction` stretta; `fine.withdraw` | A |
| 17 | Simulazione di tre mesi da riga di comando: `node simulazione/tre-mesi.js [giorni] [correntisti] [righe/giorno] [seme]`, scenario con seme, crittografia con casualità vera, invarianti a ogni riga, riserva = euro veri, circolazione = somma dei saldi, replay del motore e tempi per tipo di riga | A |
| 18 | GitHub Action senza chiavi: `pubblica` su cron (05:00 UTC) e a ogni push del registro, Pages; catena rotta = run fallito; uscita deterministica | B |
| 19 | Pannello banca da terminale (`banca/cli.js`): frase di dodici parole della banca, genesi, giorno, vendite, tetto, interessi, estratti, correzioni, aziende, giudice, conversioni; ogni riga verificata e accodata, poi git push | A/B |
| 19b | Conto di prova da terminale (`correntista/cli.js`): frase, coordinate, saldo, pagamento riservato, richiesta di conversione; righe in `ledger.jsonl` come quelle della banca | A/B |
| 20 | Server via HTTP (`server/server.js`): unico scrittore, senza chiavi; `GET /stato`, `GET /registro?da=N`, `GET /prossima`, `POST /righe` con 201/400/409; scritture in fila; `MANTI_PUSH=1` fa il push dopo ogni riga. Banca e correntista lo usano con `MANTI_SERVER=http://…` al posto del file | C |
| 21 | Servizio giudice con modello reale | C |
| 22 | App del correntista con QR | D |
| 23 | Pannelli azienda e polizia; pannello banca con interfaccia | D |
