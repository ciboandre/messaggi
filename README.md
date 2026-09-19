# messaggi

Il **manto**: una moneta privata emessa da una banca, coperta uno a uno da euro in riserva, convertibile. Chiunque apre un conto e compra, riceve, paga con QR, fa bonifici. Le aziende comprano manti per pagare stipendi e premi ai dipendenti, con catalogo, tariffario delle multe, polizia interna e giudice.

- [Regole](REGOLE_MONETA.md): riserva, tetto, prezzi di acquisto e conversione, cosa fa salire il valore, aziende, multe, giudice, riservatezza.
- [Architettura](ARCHITETTURA.md): chiavi, indirizzi usa e getta, registro, transazioni, motore giornaliero, piano dei passi.
- [Mockup](mockup/index.html): sito pubblico, app, pannelli azienda, polizia e banca, con dati finti.

Codice: `npm test` esegue i test (`nucleo/`, `motore/`, `test/`); `npm run pubblica` rilegge `ledger.jsonl` e scrive il sito in `sito/`. Node 22 o superiore; dipendenze solo noble/scure.

La banca scrive le sue righe dal terminale: `node banca/cli.js nuova-frase` genera le dodici parole (su carta, mai su disco), `genesi` apre il registro, poi `giorno`, `vendita`, `interessi`, `estratto`, `conversioni`, `esegui`, `pagata` e gli altri comandi elencati in testa a `banca/cli.js`. La frase la chiede a video senza mostrarla; dopo ogni riga si fa `git push` e il sito si rifà da solo.

Un conto di prova, prima dell'app: `node correntista/cli.js nuovo` (dodici parole in una finestra, coordinate a video), `saldo`, `paga <importo> <coordinate> [causale]`, `converti <importo> "<nome e IBAN>"`. Le righe vanno in `ledger.jsonl` e poi su git come quelle della banca.

**Chiunque può ricalcolare il sito.** Il registro è `ledger.jsonl`, una riga per transazione, scritto e committato dalla banca. Il sito pubblico lo genera una GitHub Action ogni giorno alle 05:00 UTC eseguendo solo `node motore/pubblica.js ledger.jsonl sito`: nessuna chiave, nessun segreto, nessuna data di generazione. Lo stesso comando sulla stessa copia del repository produce gli stessi byte, quindi chi non si fida della pagina la rifà da sé e la confronta. Se una riga non passa la verifica, il motore si ferma lì, il sito mostra l'ultimo stato buono con l'avviso, e il run fallisce in modo visibile.

Metodo di lavoro: un passo alla volta, ogni passo discusso, autorizzato, committato e pushato.

La cartella `archivio/` contiene il materiale del progetto di messaggistica, abbandonato.
