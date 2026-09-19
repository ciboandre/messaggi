# Regole dei manti

Versione 3.1 — 19 settembre 2026
Stato: definitivo per la fase di test. La 3.1 rende riservati importi e mittente dei pagamenti tra correntisti, alla maniera di Monero (sezione 12). Si rivede prima di vendere manti a soggetti esterni alla prima azienda.

## 1. Scopo

Il **manto** è una moneta privata emessa da una banca, coperta uno a uno da euro tenuti in riserva, e convertibile in euro. Chiunque può aprirsi un conto dall'app, comprare manti dalla banca, riceverli, pagare con QR, fare bonifici e riconvertirli. Le aziende comprano manti per pagare stipendi e premi ai dipendenti; ogni azienda ha il proprio catalogo dei premi, il proprio tariffario delle multe, una polizia interna, e un giudice.

Il valore del manto non lo decide nessuno: è la riserva divisa per i manti in circolazione, e per costruzione può solo salire.

Lo scopo dichiarato è il gioco. Lo scopo reale è collaudare in condizioni vere una moneta privata, un portafoglio, un registro firmato e riservato, e un'economia tra persone.

## 2. Parametri

Tutti i numeri del sistema in un posto solo. Ogni parametro è pubblico; quelli segnati "firmato" si cambiano solo con una transazione firmata dalla banca, visibile nel registro.

| Parametro | Valore | Note |
|---|---|---|
| Prezzo di lancio | 1 manto = 1,00 € | Solo per la prima vendita |
| Sovrapprezzo sull'acquisto dalla banca | 5% | Sul valore ufficiale. Va in riserva |
| Commissione sulla conversione | 2% | Sul valore ufficiale. Resta in riserva |
| Tetto della riserva | 4.000 € | Firmato. Sopra il tetto la banca non vende |
| Interessi sulla riserva | 100% in riserva | Conto remunerato; gli interessi non vanno alla banca |
| Quota delle multe bruciata | 50% | L'altra metà al conto polizia |
| Commissione su pagamenti e bonifici | 0% | |
| Dimensione dell'anello | 16 | Uscite tra cui si nasconde ogni entrata spesa da un correntista |
| Giorni per pagare o contestare una multa | 15 | Dalla data del verbale, contati sulle righe di giorno del registro |
| Pubblicazione | Giornaliera, 06:00 ora italiana | |
| Estratto conto della riserva | Mensile | Pubblicato accanto al registro |

## 3. I ruoli

| Ruolo | Chi tiene la chiave | Cosa può fare | Cosa non può fare |
|---|---|---|---|
| **Banca** | Il titolare, su un dispositivo dedicato | Vende manti sotto il tetto, esegue conversioni, custodisce la riserva, registra interessi ed estratti, cambia il tetto, pubblica ogni giorno | Creare manti senza euro in cambio, muovere manti altrui, vedere il saldo di qualcuno |
| **Azienda** | L'azienda | Compra manti, paga stipendi e premi dal proprio conto, registra i dipendenti, scrive catalogo e tariffario, nomina la polizia, applica le trattenute | Prelevare da un conto, vedere i saldi |
| **Polizia** | La persona nominata dall'azienda | Emette verbali da tariffario ai dipendenti della sua azienda, replica alle contestazioni, usa il conto polizia | Multare fuori tariffario o esterni, prelevare da un conto |
| **Giudice** | Il servizio che esegue l'intelligenza artificiale | Emette sentenze | Qualsiasi altra cosa |
| **Correntista** | Chiunque, sul proprio telefono | Compra dalla banca, riceve, paga, fa bonifici. Se identificato, converte | Nulla di vietato. Custodisce la propria chiave |
| **Dipendente** | Un correntista registrato da un'azienda | Tutto quanto sopra, più stipendio e premi; può essere multato e può contestare | |

Più aziende convivono dalla partenza: ognuna ha il proprio conto, catalogo, tariffario e polizia. La banca, la riserva e il valore del manto sono unici.

## 4. La riserva

- È tutta in **euro**, su un conto bancario dedicato e separato dai conti personali del titolare, **remunerato**. Nessun altro strumento: niente oro, niente valute, niente investimenti. Aggiungerli è un'opzione futura (sezione 16), non un'eccezione.
- Ci entrano: gli euro pagati per comprare manti, sovrapprezzo compreso; la commissione delle conversioni; gli interessi del conto.
- Ci escono: solo gli euro pagati per le conversioni.
- La banca **non preleva mai** dalla riserva per sé. Un eventuale compenso della banca è un canone in euro alle aziende, fuori dalla riserva e fuori dal sistema, da decidere a parte.
- Il **tetto**: la banca vende manti finché la riserva è sotto 4.000 €. Raggiunto il tetto, non vende più finché una conversione non libera spazio o finché il titolare non alza il tetto con una transazione firmata e pubblica. Il tetto non ferma le conversioni.
- Ogni mese la banca pubblica l'**estratto conto** della riserva, così chiunque può confrontare il saldo reale con quello dichiarato nel registro. È l'unico dato che il registro non può dimostrare da solo.
- Regola inviolabile: la riserva non può mai scendere sotto il valore ufficiale dei manti in circolazione. Con queste regole non può succedere, e il motore lo verifica comunque ogni giorno.

## 5. Vendita dei manti

- Chiunque compra dalla banca, aziende e privati, con un pagamento in euro fuori dal sistema. La banca registra la vendita e consegna i manti all'indirizzo dell'acquirente.
- **Prezzo di acquisto** = valore ufficiale del giorno + 5%. La prima vendita in assoluto è a 1,00 €.
- Il sovrapprezzo entra in riserva e alza il valore per tutti quelli che già hanno manti. È il primo motore della crescita: ogni nuovo cliente arricchisce chi c'era prima.
- Sotto il tetto la banca vende quanto le viene chiesto. Al tetto, "manti esauriti": chi ne vuole li compra da chi li ha, al prezzo che si accordano. Il valore ufficiale è il pavimento, il mercato può stare sopra.
- Quando il tetto viene alzato, i nuovi manti si vendono al prezzo di acquisto del giorno, mai sotto.

## 6. Il valore

    valore ufficiale = euro in riserva / manti in circolazione

Pubblicato ogni giorno con il conto esplicito. Nessuno lo decide.

**Cosa lo fa salire**, e sono le sole quattro cose che possono succedere:

1. una vendita con sovrapprezzo: entrano più euro di quanti manti escono;
2. una conversione: escono manti e meno euro del loro valore, la commissione resta;
3. gli interessi del conto di riserva: entrano euro, nessun manto esce;
4. una multa: metà dei manti viene bruciata, nessun euro esce.

**Cosa lo fa scendere**: niente. Pagamenti, bonifici e stipendi spostano manti tra conti senza toccare il totale. Non esiste operazione che tolga euro dalla riserva senza togliere almeno altrettanto valore in manti.

**Ordine di grandezza.** Con interessi al 2,5%, vendite regolari e un po' di multe, il manto sale del 4–6% l'anno a regime, di più nei periodi in cui la banca vende molto. Supera 1,00 € alla prima vendita con sovrapprezzo e non torna più sotto.

## 7. La conversione in euro

1. Il correntista chiede di convertire dall'app. La richiesta contiene, cifrati per la sola banca, i dati per il pagamento in euro. **Può convertire solo chi è identificato dalla banca**: i dipendenti lo sono dalla registrazione dell'azienda; un esterno si identifica una volta. Tenere, ricevere, pagare e comprare non richiede identificazione.
2. **Prezzo di conversione** = valore ufficiale del giorno − 2%.
3. Tutti i manti convertiti vengono **bruciati**. La banca paga gli euro fuori dal sistema e segna la conversione come pagata. Il 2% in euro resta in riserva.
4. Nel registro compaiono manti bruciati ed euro dovuti; non chi, né da quali indirizzi vengono.

Non esistono limiti minimi o massimi. Un dipendente con multe definitive non pagate non può convertire finché non salda (sezione 10).

## 8. Apertura del conto, pagamenti e bonifici

- **Il conto si apre da soli.** Chiunque installa l'app, scrive su carta la frase di recupero di dodici parole, e ha un conto con le proprie coordinate. Nessun invito, email, telefono, documento o permesso.
- **Un dipendente** mostra le coordinate all'azienda, che lo registra e gli consegna un attestato firmato che l'app conserva. Da lì riceve stipendio e premi, e nell'app compare la sezione delle multe. Senza attestato la sezione non esiste e nessuno può multarlo.
- **Ricevere con QR**: l'app mostra un QR con un indirizzo nuovo, generato al momento, e se si vuole l'importo. Chi paga inquadra, controlla, firma.
- **Bonifico**: si invia a delle coordinate, una stringa che ognuno condivide con chi vuole, come un IBAN, e che si salva in rubrica. Chi non le ha non può inviare nulla né sapere che quella persona esiste.
- **Causale** facoltativa, la legge solo il destinatario. L'**importo** lo leggono solo chi paga e chi riceve; nel registro c'è un impegno crittografico, non un numero.
- **Chi paga non si vede.** Ogni entrata spesa è mescolata con quindici entrate di altri, prese dal registro; chi guarda sa che una delle sedici è stata spesa, non quale.
- Nessuna commissione. Ogni movimento è firmato da chi paga ed è **definitivo**. Chi sbaglia destinatario chiede al destinatario di restituire.
- Cosa si scambia in cambio dei manti, e a che prezzo in euro tra privati, non riguarda il sistema.

## 9. Le aziende

- Un'azienda **compra manti dalla banca** quando vuole e li tiene sul proprio conto. Da lì paga i dipendenti quando e quanto decide: per convenzione a fine mese, uno **stipendio base** uguale per tutti più i **premi** del catalogo. Nessun piano di emissione: quello che l'azienda non paga resta sul suo conto.
- Il **catalogo dei premi** è un dato firmato dall'azienda, modificabile in qualsiasi momento, con storia pubblica. Ogni voce vale un numero fisso di manti, deciso dall'azienda. Un premio vale quello che il catalogo diceva quando è stato assegnato.
- All'inizio l'azienda assegna i premi a mano. In seguito l'assegnazione potrà essere automatizzata su dati registrati durante il mese.
- Premi e multe non si compensano mai tra loro: chiavi diverse, documenti diversi, movimenti diversi.

## 10. Le multe

Come nella vita reale: verbale, termine, ricorso, esecuzione forzata.

- **Il tariffario** è un dato firmato dall'azienda, pubblico, con storia. La polizia non può multare fuori tariffario, per importi diversi, né chi non è dipendente della sua azienda.
- **Il verbale** lo emette la polizia con la sua chiave: voce, importo, data e ora, descrizione. Arriva sul conto del multato. Nel registro pubblico compaiono numero, voce e importo, non il nome.
- **Entro 15 giorni** il multato **paga** dall'app, oppure **contesta** scrivendo le proprie ragioni. La polizia può replicare. Decide il giudice. Finché la contestazione è aperta, nessun termine corre.
- **Quando una multa viene pagata**, per scelta o per trattenuta, **metà dei manti viene bruciata** e metà va al conto della polizia. La metà bruciata alza il valore per tutti.
- **Se non fa nulla**, il verbale è definitivo e scatta l'**esecuzione forzata**: l'azienda trattiene l'importo dal prossimo stipendio e dai prossimi premi del multato finché non è saldato, versando la metà alla polizia e bruciando l'altra metà; e le sue conversioni restano bloccate. Nessuno preleva dal suo conto: l'esecuzione agisce solo su ciò che deve ancora entrare.
- **Il conto della polizia** è un conto come gli altri. Quello che raccoglie si usa per ciò che l'azienda decide.

## 11. Il giudice

- Un'intelligenza artificiale con la propria chiave. Riceve verbale, voce del tariffario, contestazione ed eventuale replica. Emette una **sentenza**: confermata, annullata, o ridotta a un'altra voce. Firmata, nel registro con la motivazione, pubblica con le parti anonime.
- **Le istruzioni del giudice** sono pubbliche e versionate nel repository come il codice. Se cambiano, si vede quando e come.
- Le sentenze sono definitive. Se il giudice non è raggiungibile, la contestazione resta aperta e nessun termine corre. Chi perde paga la multa e basta.

## 12. Riservatezza

Il registro è pubblico, ma non dice chi è chi, né quanto passa di mano tra correntisti, né da dove. È il modello di Monero, con una differenza: le righe firmate da un ruolo restano in chiaro.

**Tre cose nascoste nei pagamenti tra correntisti:**

1. **Chi riceve.** Ogni pagamento va a un **indirizzo usa e getta** che solo il destinatario riconosce. Nessuno può collegare gli indirizzi a una persona né sommare il saldo di qualcuno.
2. **Quanto.** L'importo non è scritto: al suo posto c'è un impegno crittografico che permette di verificare che entrate e uscite si equivalgono senza leggerle, e una prova che nessun importo è negativo. Il numero lo conoscono chi paga e chi riceve.
3. **Chi spende.** Ogni entrata spesa è messa in un **anello** con quindici entrate di altri, prese dal registro. La firma prova che una delle sedici appartiene a chi firma e che non è già stata spesa, senza dire quale. Le quindici esche restano spendibili dai loro proprietari.

**Cosa resta in chiaro, e perché.** Vendite della banca, stipendi, premi e trattenute delle aziende, verbali e loro incasso, conversioni eseguite e ogni bruciatura hanno l'importo visibile e le entrate consumate dichiarate. Servono a calcolare il circolante e quindi il valore: manti venduti meno convertiti meno bruciati. Se fossero nascosti nessuno potrebbe verificare che la riserva copre. Il destinatario di uno stipendio o di un premio è comunque un indirizzo usa e getta: si vede che l'azienda ha pagato dieci stipendi da tanto, non a chi.

| | Nomi | Saldo di una persona | Importi | Movimenti |
|---|---|---|---|---|
| Altri correntisti, pubblico | no | no | solo quelli firmati da un ruolo | anelli e indirizzi anonimi |
| Azienda | i propri dipendenti | no, sa solo quanto ha pagato | i propri | i propri |
| Polizia | i dipendenti della sua azienda | no | le multe | le multe emesse e incassate |
| Banca | chi si è identificato per convertire, e chi ha comprato da lei | no | vendite e conversioni | valida tutto senza sapere di chi è né quanto |
| Giudice | no | no | la multa | il verbale contestato |
| Il correntista | sé stesso | il proprio | i propri | i propri |

Le causali sono cifrate per il destinatario. L'anagrafica non è nel registro e non si pubblica. Un esterno che non ha mai comprato dalla banca né convertito non compare da nessuna parte.

**Limite dichiarato.** Nei primi giorni, quando il registro ha poche uscite, gli anelli sono piccoli e proteggono poco. La protezione cresce con l'uso.

## 13. Vincoli di legge

- **Una moneta venduta al pubblico e coperta uno a uno in euro** è, per il regolamento europeo MiCA, un token di moneta elettronica: la categoria meno pesante, ma richiede autorizzazione come istituto di moneta elettronica o di pagamento presso la Banca d'Italia. Il titolare lo sa e ha scelto di costruire il sistema così. La fase di test resta tra la prima azienda e i suoi dipendenti; prima di vendere a esterni serve quel passaggio.
- **Gli euro delle conversioni** pagati ai dipendenti sono retribuzione, da trattare come tale. Come l'azienda o la banca li paga è fuori dal sistema.
- **Le multe** in una moneta convertibile sono, per la legge italiana, sanzioni disciplinari con i limiti dello Statuto dei lavoratori. Scelta consapevole del titolare.
- **Dati personali**: anagrafica e fascicoli delle contestazioni sono dati personali. Serve un'informativa e non escono dal sistema.

## 14. Il motore: regole scritte nel codice

Il motore applica le regole da solo, ogni giorno. Nessuno le aggira senza modificare il codice, e ogni modifica è pubblica.

1. I manti si creano solo con una vendita registrata dalla banca, con gli euro corrispondenti in riserva, sotto il tetto, al prezzo di acquisto del giorno.
2. Nessuna entrata si spende senza la chiave del suo indirizzo, e nessuna si spende due volte. Nessuna eccezione.
3. Nessuna riga del registro può essere modificata o cancellata. Ogni riga è concatenata alla precedente tramite hash.
4. Gli euro escono dalla riserva solo per conversioni, al prezzo di conversione del giorno, e per ogni euro uscito vengono bruciati almeno altrettanti manti in valore.
5. Metà di ogni multa pagata viene bruciata.
6. Il valore è calcolato dal registro, mai inserito a mano. La riserva dichiarata è una riga firmata dalla banca, riconciliata con l'estratto conto mensile.
7. Catalogo, tariffario e nomina della polizia si cambiano solo con una transazione firmata dall'azienda. Il tetto solo con una firmata dalla banca.
8. La polizia firma solo verbali e repliche, da tariffario, verso dipendenti della sua azienda. Il giudice firma solo sentenze.
9. Il registro non contiene nomi. Mai. Non contiene importi né mittente dei pagamenti tra correntisti.
10. Un pagamento riservato è valido solo se la prova dimostra che entrate e uscite si equivalgono e che nessuna uscita è negativa. Il motore non conosce i numeri e non gli servono.

| Fisso (codice) | Modificabile (dati firmati) |
|---|---|
| Sovrapprezzo, commissione, quota bruciata, dimensione dell'anello | Tetto della riserva |
| Formula del valore | Cataloghi e tariffari |
| Termine di 15 giorni | Verbali, contestazioni, sentenze |
| Regole di firma e catena | Vendite, conversioni, interessi, estratti |
| Istruzioni del giudice | Nomina della polizia, registrazione dei dipendenti |

**Pubblicazione giornaliera.** Ogni mattina il motore rilegge il registro da capo, verifica ogni riga, calcola valore ufficiale, prezzo di acquisto, prezzo di conversione, riserva, spazio sotto il tetto, manti in circolazione e bruciati, cataloghi, tariffari, sentenze, e genera il sito con data, numero e hash dell'ultima riga. Se qualcosa non torna, il sito mostra l'errore invece dei numeri.

**Indipendenza.** Motore, registro, istruzioni del giudice e sito vivono in un repository con cronologia visibile. Ogni versione e ogni pubblicazione è un commit.

## 15. Cosa succede se

- **Un correntista perde il telefono.** Con la frase di dodici parole ritrova tutto su un altro telefono. Senza, i manti sono persi come contanti. Non esiste copia presso la banca.
- **Il telefono viene rubato.** Chi lo ha non può firmare senza il blocco biometrico. Il correntista, con la frase su un telefono nuovo, sposta subito i manti su indirizzi nuovi.
- **Un dipendente lascia l'azienda.** L'azienda revoca l'attestato: niente più stipendio, premi o multe. Il conto resta suo, come quello di qualsiasi esterno.
- **Un'azienda smette.** Tiene o converte i manti che ha sul conto. I dipendenti tengono i loro. Il manto non ne risente.
- **Tutti convertono insieme.** La riserva copre tutto per costruzione: ogni manto vale al massimo la sua quota di riserva.
- **La banca vuole chiudere.** Preavviso di un mese, tutti convertono al valore del giorno senza commissione, la riserva residua è zero.
- **La polizia sbaglia.** Il multato contesta, il giudice annulla. Se abusa, l'azienda nomina un'altra polizia.
- **Un errore nel software.** Una riga risultata invalida viene neutralizzata con una riga correttiva firmata dalla banca, motivata pubblicamente. Non si cancella niente.

## 16. Opzioni per dopo

- **Mercato dentro l'app**: offerte di vendita in euro, la banca fa da intermediario e pubblica l'ultimo prezzo di scambio accanto al valore ufficiale.
- **Riacquisto**: la banca usa eventuali profitti per ricomprare manti sul mercato e bruciarli.
- **Riserva in parte non in euro** (oro, valute), per legare il manto all'andamento dell'euro. Cambia la categoria legale.
- **QR "paga"**: mostri tu il codice e l'altro incassa.
- **Premi automatici** su dati del mese.
- **Canone alle aziende** per il servizio, fuori dalla riserva.
- **Stripe** per tre cose: incassare gli acquisti di manti con carta o addebito SEPA, con la vendita firmata in automatico all'arrivo del pagamento; identificare chi vuole convertire tramite Stripe Identity; in futuro, pagare le conversioni. Due avvertenze: le regole di Stripe trattano una valuta riconvertibile in denaro come attività da approvare, quindi vale la stessa condizione della licenza; e le commissioni di Stripe si aggiungono al prezzo pagato dal compratore, così in riserva entrano esattamente gli euro del prezzo.
- **Cose che si comprano solo in manti**: negozio interno, convenzioni.

## 17. Revisione

- Prima del primo catalogo e del primo tariffario.
- Prima della prima vendita, con il commercialista.
- Dopo tre mesi, con i dati reali.
- Prima di vendere a soggetti esterni alla prima azienda, con l'avvocato.
