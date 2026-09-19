# messaggi

Il **manto**: una moneta privata emessa da una banca, coperta uno a uno da euro in riserva, convertibile. Chiunque apre un conto e compra, riceve, paga con QR, fa bonifici. Le aziende comprano manti per pagare stipendi e premi ai dipendenti, con catalogo, tariffario delle multe, polizia interna e giudice.

- [Regole](REGOLE_MONETA.md): riserva, tetto, prezzi di acquisto e conversione, cosa fa salire il valore, aziende, multe, giudice, riservatezza.
- [Architettura](ARCHITETTURA.md): chiavi, indirizzi usa e getta, registro, transazioni, motore giornaliero, piano dei passi.
- [Mockup](mockup/index.html): sito pubblico, app, pannelli azienda, polizia e banca, con dati finti.

Codice: `npm test` esegue i test (`nucleo/`, `motore/`, `test/`); `npm run pubblica` rilegge `ledger.jsonl` e scrive il sito in `sito/`. Node 22 o superiore; dipendenze solo noble/scure.

**Chiunque può ricalcolare il sito.** Il registro è `ledger.jsonl`, una riga per transazione, scritto e committato dalla banca. Il sito pubblico lo genera una GitHub Action ogni giorno alle 05:00 UTC eseguendo solo `node motore/pubblica.js ledger.jsonl sito`: nessuna chiave, nessun segreto, nessuna data di generazione. Lo stesso comando sulla stessa copia del repository produce gli stessi byte, quindi chi non si fida della pagina la rifà da sé e la confronta. Se una riga non passa la verifica, il motore si ferma lì, il sito mostra l'ultimo stato buono con l'avviso, e il run fallisce in modo visibile.

Metodo di lavoro: un passo alla volta, ogni passo discusso, autorizzato, committato e pushato.

La cartella `archivio/` contiene il materiale del progetto di messaggistica, abbandonato.
