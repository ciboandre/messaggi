# Regole dei manti

Versione 2.2 — 19 settembre 2026
Stato: definitivo per la fase di test interna. Si rivede prima di estendere il sistema a una seconda azienda.

## 1. Scopo

Una moneta, il **manto**, convertibile in euro, gestita come una banca vera: chiunque può aprirsi un conto dall'app, ricevere, pagare con QR e fare bonifici. I dipendenti dell'azienda, in più, ricevono uno stipendio mensile in manti e i premi, possono essere multati da una polizia interna e possono ricorrere a un giudice. Lo scopo dichiarato è il gioco. Lo scopo reale è collaudare in condizioni vere un portafoglio, un registro firmato, un sistema di pagamenti riservato e un'economia tra persone, prima di riusarli in un prodotto pubblico.

Il gioco è volontario. Chi non partecipa non perde nulla.

## 2. Parametri

Tutti i numeri del sistema in un posto solo. Cambiarne uno significa aggiornare questa tabella e la versione del documento.

| Parametro | Valore | Note |
|---|---|---|
| Fatturato medio mensile di riferimento | 50.000 € netto IVA | Base per la riserva |
| Quota del fatturato versata in riserva | 1% | Circa 500 € al mese, a fine mese |
| Emissione del primo mese | 500 manti | 1 manto = 1 € alla partenza |
| Riduzione mensile dell'emissione | 2% | Composta, ogni mese sul mese precedente |
| Tetto massimo di manti | 25.000 | Limite matematico dell'emissione |
| Quota dell'emissione a stipendio base | 50% | In parti uguali a tutti i dipendenti attivi |
| Quota dell'emissione a premi | 50% | Dal catalogo. Il non assegnato non si emette |
| Commissione sulla conversione | 2% | Trattenuta in manti dalla banca |
| Commissione su pagamenti e bonifici | 0% | |
| Giorni per pagare o contestare una multa | 15 | Dalla data del verbale |
| Frequenza di pubblicazione | Giornaliera | Alle 06:00 ora italiana |

## 3. I ruoli

| Ruolo | Chi tiene la chiave | Cosa può fare | Cosa non può fare |
|---|---|---|---|
| **Banca** | Il titolare, su un dispositivo dedicato | Tiene il registro, custodisce la riserva, esegue le conversioni, pubblica ogni giorno | Creare manti fuori piano, muovere manti altrui, vedere il saldo di qualcuno |
| **Azienda** | Il titolare | Registra i dipendenti, versa in riserva, paga stipendi e premi a fine mese, scrive catalogo e tariffario, nomina la polizia | Emettere più del piano, prelevare da un conto, vedere i saldi |
| **Polizia** | La persona nominata dall'azienda | Emette verbali da tariffario, replica alle contestazioni, usa il proprio conto | Multare fuori tariffario, prelevare da un conto, vedere i saldi |
| **Giudice** | Il servizio che esegue l'intelligenza artificiale | Emette sentenze sulle contestazioni | Qualsiasi altra cosa |
| **Correntista** | Chiunque, sul proprio telefono | Riceve, paga, fa bonifici. Se identificato dalla banca, converte in euro | Nulla di vietato. Custodisce la propria chiave |
| **Dipendente** | Un correntista registrato dall'azienda | Tutto quanto sopra, più stipendio e premi; può essere multato e può contestare | |

Il sistema è progettato per più aziende fin dall'inizio, ognuna con il proprio conto, riserva, polizia e piano. Nella fase di test ce n'è una. Vedi la sezione 13 prima di aggiungerne altre.

## 4. La riserva

- L'ultimo giorno del mese l'azienda versa l'1% del fatturato del mese, netto IVA, su un conto bancario dedicato e separato dai conti operativi.
- Il saldo della riserva è pubblico in ogni momento.
- La riserva serve a una cosa sola: pagare le conversioni. Non si tocca per altro.
- Regola inviolabile: la riserva non può mai scendere sotto il valore dei manti in circolazione.

## 5. L'emissione e il mese

L'emissione è il numero di manti nuovi che entrano in circolazione in un mese. È fissa, decisa in anticipo, e non dipende dal fatturato.

- Primo mese: 500 manti. Ogni mese successivo: il 2% in meno del mese prima. Somma di tutte le emissioni possibili: 25.000.
- **Tutto avviene l'ultimo giorno del mese**, insieme al versamento in riserva:
  1. **Stipendio base**: metà dell'emissione, divisa in parti uguali tra i dipendenti attivi. Con 500 manti e 10 dipendenti, 25 a testa.
  2. **Premi**: l'altra metà, assegnata dall'azienda secondo il catalogo (sezione 9). Quello che non viene assegnato **non viene emesso**: resta fuori dal sistema per sempre e rende più preziosi i manti in circolazione.
- All'inizio l'azienda assegna i premi a mano. In seguito l'assegnazione verrà automatizzata su dati registrati durante il mese.

Con un versamento in euro che segue il fatturato e un'emissione in manti che cala, il manto sale se l'azienda tiene o cresce, e scende se l'azienda cala. Il manto è una scommessa sull'azienda, e va spiegato così.

## 6. Il valore

    valore = euro in riserva / manti in circolazione

Pubblicato ogni giorno. Nessuno lo decide. Cambia solo a fine mese, perché versamento ed emissione avvengono insieme; le conversioni tolgono euro e manti nella stessa proporzione e non lo alterano; multe, pagamenti e bonifici spostano manti tra conti senza toccare il totale.

A fatturato fermo a 50.000 € e premi interamente assegnati:

| Dopo | Riserva | Manti in circolazione | Valore |
|---|---|---|---|
| 1 mese | 500 € | 500 | 1,00 € |
| 12 mesi | 6.000 € | 5.382 | 1,11 € |
| 24 mesi | 12.000 € | 9.605 | 1,25 € |
| 36 mesi | 18.000 € | 12.920 | 1,39 € |
| 60 mesi | 30.000 € | 17.561 | 1,71 € |

Ogni premio non assegnato sposta questi numeri verso l'alto.

## 7. La conversione in euro

1. Il correntista chiede di convertire un numero di manti dall'app. La richiesta contiene, cifrati per la sola banca, i dati per il pagamento in euro. **Può convertire solo chi è identificato dalla banca**: i dipendenti lo sono dalla registrazione dell'azienda; un esterno si identifica una volta, di persona o con un documento, e da lì in poi converte come tutti. Tenere, ricevere e pagare manti non richiede identificazione.
2. La banca trattiene il 2% in manti come commissione e calcola gli euro sul resto, al valore del giorno.
3. I manti convertiti vengono distrutti. La commissione va al conto della banca.
4. La banca paga gli euro **fuori dal sistema**, con il mezzo che il titolare decide, e segna la conversione come pagata. Il registro mostra manti distrutti, commissione ed euro dovuti; non mostra chi.

Non esistono limiti minimi o massimi. Un correntista con multe scadute e non pagate non può convertire finché non salda (sezione 10).

## 8. Apertura del conto, pagamenti e bonifici

- **Il conto si apre da soli.** Chiunque installa l'app, scrive su carta la frase di recupero di dodici parole che l'app genera, e ha un conto con le proprie coordinate. Nessun invito, nessuna email, nessun numero di telefono, nessun permesso della banca. Un esterno all'azienda ha un conto identico a quello di un dipendente: può ricevere manti da chiunque, pagare, fare bonifici.
- **Un dipendente** mostra le sue coordinate all'azienda, che lo registra in anagrafica con il nome e gli consegna un attestato di registrazione firmato, che l'app conserva. Da lì riceve stipendio e premi, e nell'app compare la sezione delle multe. Per chi non è registrato presso un'azienda, la sezione non esiste: un esterno non può essere multato.
- **Ricevere con QR**: il correntista mostra un QR con un indirizzo nuovo, generato al momento, e se vuole l'importo. Chi paga inquadra, controlla, firma. È il modo normale di pagarsi tra colleghi e di pagare le multe.
- **Bonifico**: il correntista invia a un altro conoscendone le coordinate bancarie, una stringa che ognuno può condividere con chi vuole, come un IBAN. Il mittente le salva in rubrica. Chi non le ha ricevute non può inviare nulla a quella persona, né sapere che esiste.
- **Causale**: facoltativa, la legge solo il destinatario.
- Nessuna commissione. Ogni movimento è firmato da chi paga ed è **definitivo**: non esiste storno. Chi sbaglia destinatario chiede al destinatario di restituire.
- Cosa si scambia in cambio dei manti non riguarda il sistema. Il prezzo in euro che due colleghi si fanno tra loro è libero: la riserva garantisce il valore minimo, il mercato può stare sopra.

## 9. Il catalogo dei premi

Il catalogo dice quali comportamenti valgono un premio e quanto. Ogni voce è una quota dell'emissione del mese: "una recensione positiva vale il 4% dell'emissione". Con l'emissione che cala, i premi calano da soli.

- Il catalogo è un dato firmato dall'azienda, modificabile in qualsiasi momento, con storia pubblica. Un premio vale quello che il catalogo diceva a fine mese, quando è stato assegnato.
- La somma dei premi assegnati in un mese non può superare la quota premi dell'emissione.
- Si guadagnano premi per comportamenti tenuti. Le multe sono un'altra cosa, con un'altra chiave e un altro documento (sezione 10): premi e multe non si compensano mai tra loro.

## 10. Le multe

Funzionano come nella vita reale: verbale, termine per pagare, ricorso, e se non si fa niente, esecuzione forzata.

- **Il tariffario** è un dato firmato dall'azienda, pubblico, con storia: "parolaccia in sala: 2 manti", "ritardo oltre 10 minuti: 5 manti". La polizia non può multare fuori tariffario né per importi diversi.
- **Il verbale** lo emette la polizia con la sua chiave, solo verso un dipendente registrato presso la sua azienda: voce del tariffario, importo, data e ora, descrizione. Arriva sul conto del multato. Nel registro pubblico compaiono numero, voce e importo, non il nome.
- **Entro 15 giorni** il multato fa una di due cose:
  - **paga**, inquadrando il QR della polizia dal verbale, con riferimento automatico;
  - **contesta**, scrivendo le proprie ragioni dall'app. La polizia può replicare. Decide il giudice (sezione 11). Finché la contestazione è aperta, nessun termine corre.
- **Se non fa nulla**, il verbale è definitivo e scatta l'**esecuzione forzata**: la multa viene trattenuta dal prossimo stipendio e dai prossimi premi del multato finché non è saldata, e le sue conversioni in euro restano bloccate. La trattenuta la fa l'azienda a fine mese, versando alla polizia la parte trattenuta. Nel registro si vede lo stipendio ridotto e il versamento alla polizia con riferimento al verbale.
- **Il conto della polizia** è un conto come gli altri. I manti che raccoglie si usano per quello che l'azienda decide: cene, feste, quello che si vuole. Si spendono con bonifici o si convertono.

Nessuno, nemmeno la polizia, la banca o l'azienda, può prelevare manti da un conto. L'esecuzione forzata agisce solo su quello che deve ancora entrare.

## 11. Il giudice

- È un'intelligenza artificiale con la propria chiave. Riceve il verbale, la voce del tariffario, la contestazione del multato e l'eventuale replica della polizia. Emette una **sentenza**: confermata, annullata, o ridotta a una voce diversa del tariffario. La sentenza è firmata, entra nel registro con la motivazione completa, ed è pubblica con le parti anonime.
- **Le istruzioni date al giudice** sono pubbliche e versionate nel repository come il codice del motore. Se cambiano, si vede quando e come. Nessuno può orientare le sentenze di nascosto.
- Le sentenze sono definitive. Non c'è appello nella prima versione.
- Se il giudice non è raggiungibile, la contestazione resta aperta e nessun termine corre contro il multato. Un guasto nostro non può costare a un dipendente.
- Chi perde paga la multa e basta. Nessuna maggiorazione per il ricorso respinto, nella prima versione.

## 12. Riservatezza

Il registro è pubblico, ma non dice chi è chi.

- Ogni pagamento va a un **indirizzo usa e getta**, generato per quel pagamento, che solo il destinatario sa riconoscere come proprio. Il registro mostra importi e indirizzi, mai nomi. Nessuno può collegare gli indirizzi a una persona né sommare il saldo di qualcuno.
- **Chi vede cosa:**

| | Nomi dei correntisti | Saldo di una persona | Movimenti |
|---|---|---|---|
| Altri correntisti | no | no | importi e indirizzi anonimi |
| Pubblico sul sito | no | no | importi e indirizzi anonimi |
| Azienda | sì, li ha registrati | no, sa solo quanto ha pagato lei | i propri pagamenti |
| Polizia | sì, per multare | no | le multe emesse e incassate |
| Banca | sì, registra i conti | no, non collega gli indirizzi | valida tutto senza sapere di chi è |
| Giudice | no, vede solo il fascicolo anonimo | no | il verbale contestato |
| Il correntista | sé stesso | il proprio | i propri |

- L'elenco dei dipendenti con le loro coordinate bancarie è un dato dell'azienda e della banca, non del registro. Non viene pubblicato. Gli esterni non sono in nessun elenco finché non chiedono di convertire.
- Le causali sono cifrate per il destinatario.
- Le sentenze sono pubbliche ma con verbale e parti indicati per numero.

## 13. Vincoli di legge

Condizioni da verificare con un commercialista prima di partire e con un avvocato prima di ogni estensione.

- **Gli euro delle conversioni sono retribuzione** e vanno trattati come tali. Come l'azienda li paga è fuori dal sistema.
- **Conto aperto a chiunque, con manti convertibili in euro**: per la legge europea è emissione di moneta elettronica o servizio di pagamento, con autorizzazione della Banca d'Italia e regolamento MiCA. Il titolare ha scelto di costruire il sistema così fin dall'inizio, consapevole che prima di aprirlo davvero a esterni serve quel passaggio. La fase di test resta tra dipendenti.
- **Le multe** in una moneta convertibile in euro sono, per la legge italiana, sanzioni disciplinari, con i limiti e le procedure dello Statuto dei lavoratori. È una scelta del titolare, presa consapevolmente.
- **Dati personali**: l'anagrafica dei correntisti e i fascicoli delle contestazioni sono dati personali. Serve un'informativa e non escono dall'azienda.

## 14. Il motore: regole scritte nel codice

Il motore è il programma che applica le regole. Gira da solo, ogni giorno. Nessuno può aggirare queste regole senza modificare il codice, e ogni modifica al codice è pubblica.

1. I manti si creano solo a fine mese, entro l'emissione del mese, come stipendio base e premi.
2. Nessun movimento in uscita da un indirizzo senza la firma della chiave di quell'indirizzo. Nessuna eccezione. L'esecuzione forzata delle multe agisce solo su ciò che deve ancora entrare.
3. Nessuna riga del registro può essere modificata o cancellata. Ogni riga è concatenata alla precedente tramite hash.
4. La riserva non può scendere sotto il valore dei manti in circolazione.
5. La commissione si applica solo alla conversione.
6. Il valore è calcolato dal registro, mai inserito a mano.
7. Catalogo e tariffario si cambiano solo con una transazione firmata dall'azienda.
8. La polizia firma solo verbali e repliche, da tariffario. Il giudice firma solo sentenze.
9. Il registro non contiene nomi. Mai.

**Cosa è fisso e cosa è modificabile**

| Fisso (codice) | Modificabile (dati firmati) |
|---|---|
| Piano di emissione e quote stipendio/premi | Catalogo dei premi |
| Formula del valore | Tariffario delle multe |
| Commissioni | Assegnazione dei premi a fine mese |
| Termine di 15 giorni | Verbali, contestazioni, sentenze |
| Regole di firma e catena | Versamenti in riserva |
| Istruzioni del giudice | Nomina della polizia |

**Pubblicazione giornaliera.** Ogni mattina il motore rilegge il registro da capo, verifica ogni riga, calcola valore, riserva, circolazione, catalogo, tariffario e sentenze, e genera il sito. Ogni pubblicazione riporta data, ora, numero e hash dell'ultima riga. Se qualcosa non torna, il sito mostra l'errore invece dei numeri.

**Indipendenza.** Motore, registro, istruzioni del giudice e sito vivono in un repository con cronologia visibile ai partecipanti. Ogni versione e ogni pubblicazione è un commit. Non si può cambiare qualcosa di nascosto: solo alla luce del sole.

## 15. Cosa succede se

- **Un correntista perde il telefono.** Al primo avvio l'app gli ha fatto scrivere una frase di recupero di dodici parole. Con quella, su un telefono nuovo, ritrova tutto. Senza, i manti sono persi come contanti persi. Non esiste una copia presso la banca: se esistesse, la regola 14.2 sarebbe una finzione.
- **Il telefono viene rubato.** Chi lo ha non può firmare senza il blocco biometrico. Il correntista, con la frase di recupero su un telefono nuovo, sposta subito i manti su indirizzi nuovi.
- **Un dipendente lascia l'azienda.** L'azienda lo toglie dall'anagrafica: non riceve più stipendio né premi, non può più essere multato. Il conto resta suo, come quello di qualsiasi esterno: i manti che ha li tiene, li spende e, essendo già identificato, li converte quando vuole.
- **Il fatturato cala molto.** La riserva cresce meno, l'emissione cala comunque. Il valore può scendere. Nessuna regola interviene: è il rischio dichiarato.
- **La polizia sbaglia.** Il multato contesta, il giudice annulla. Se la polizia abusa, l'azienda ne nomina un'altra.
- **L'azienda vuole chiudere il gioco.** Preavviso di un mese, tutti convertono al valore del giorno, la riserva residua torna all'azienda.
- **Un errore nel software.** Il registro è verificabile da tutti. Una riga risultata invalida viene neutralizzata con una riga correttiva firmata dalla banca, motivata pubblicamente. Non si cancella niente.

## 16. Opzioni per dopo

- **QR "paga"**: mostri tu il codice e l'altro incassa, come alla cassa. Richiede un'autorizzazione firmata a tempo. Seconda versione.
- **Bonifico in euro tra colleghi** dentro il sistema. Da valutare con l'avvocato: cambia la natura del servizio.
- **Premi automatici** su dati registrati durante il mese.
- **Maggiorazione per ricorso respinto.**
- **Conto deposito**: manti bloccati per sei mesi con bonus dalle commissioni.
- **Seconda azienda**, solo dopo il passaggio legale.

## 17. Revisione

Questo documento si rivede:

- prima di scrivere il primo catalogo e il primo tariffario;
- prima del primo mese di gioco, con il commercialista;
- dopo tre mesi di gioco, con i dati reali;
- prima di qualsiasi estensione a soggetti esterni all'azienda.
