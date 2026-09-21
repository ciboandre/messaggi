# Regole del manto

Il manto è il credito prepagato di 2m2.it. È una moneta che, una volta creata, non dipende da nessuno: un contratto immutabile su Base (rete di secondo livello di Ethereum), senza proprietario, senza interruttore, senza regole modificabili. Il contratto sa fare solo ciò che è scritto in questo file. La **promessa** che dà valore al manto (un manto vale un euro di merce su 2m2.it) la fa il negozio, fuori dal contratto, e vale finché il negozio la mantiene.

## 1. Emissione: 1.000 manti al giorno, per sempre, al negozio

- Il giorno di creazione è il giorno 0. Ogni giorno nascono **1.000 manti**, accreditati all'**indirizzo del negozio**. Chiunque può chiamare il contratto per far accreditare i giorni maturati; i giorni non ancora accreditati si accumulano.
- La quantità è fissa: non cambia mai, non ha tetto, non si dimezza.
- Alla creazione il negozio riceve una **scorta iniziale di 100.000 manti**, subito disponibile, per vendite e cashback dal primo giorno.
- Un manto si divide in 100 centesimi.

Conseguenza: dopo 1 anno esistono 465.000 manti, dopo 10 anni 3.750.000. Tutti nascono nelle mani del negozio; da lì escono solo venduti o regalati.

## 2. L'indirizzo del negozio

- È l'unico indirizzo che il contratto conosce. Non ha alcun potere sugli altri: non blocca, non confisca, non cambia regole. Riceve i manti nuovi, e basta.
- L'indirizzo del negozio **può cedere il ruolo a un altro indirizzo**, con una sola operazione firmata da sé stesso. Serve per cambiare chiave se quella in uso è compromessa o persa in modo ordinato. Nessun altro può farlo.
- Se la chiave del negozio va persa senza cessione, i manti nuovi continuano ad accumularsi su un indirizzo morto. È il rischio da custodire: chiave sul server, cifrata, con copia di riserva su carta.

## 3. Come si ottengono i manti

- **Acquisto**: su 2m2.it si compra il prodotto "manti". **100 manti costano 90 €** (10% di sconto a chi anticipa). Pagato l'ordine, il negozio invia i manti all'indirizzo Base indicato dal cliente.
- **Cashback**: ogni ordine pagato in euro su 2m2.it rende al cliente il **3% in manti**, inviati al suo indirizzo se ne ha indicato uno.
- **Tra persone**: i manti si passano liberamente da un indirizzo all'altro, senza chiedere a nessuno. Il contratto non distingue tra chi li ha comprati e chi li ha ricevuti.

Nessuno reclama manti gratis dal contratto: le regole precedenti col reclamo giornaliero sono sostituite da queste.

## 4. Come si spendono

- **1 manto = 1 € di merce su 2m2.it, IVA inclusa**, senza tetto: un ordine si può pagare interamente in manti, o in parte manti e in parte euro.
- Al checkout il cliente manda i manti all'indirizzo del negozio con il numero d'ordine; il negozio vede la transazione sulla rete e segna l'ordine pagato.
- I manti **non scadono**: il contratto non sa cosa sia una scadenza.
- I manti non si riconvertono in euro dal negozio: si spendono in merce o si passano ad altri.
- Altri negozi potranno accettare manti alle loro condizioni; è un accordo tra loro e i clienti, il contratto non c'entra.

## 5. Il creatore

Il creatore è il negozio: guadagna dagli euro incassati in anticipo e dai clienti che tornano a spendere manti. Non esiste una quota separata del creatore né una commissione sui trasferimenti: ogni manto che passa di mano arriva intero.

## Ciò che il contratto non fa

Non ha proprietario, non ha pausa, non blocca conti, non cambia le regole, non stampa fuori regola, non tassa i trasferimenti. Prezzo di vendita, cashback e valore in merce sono promesse del negozio, non righe del contratto: si possono cambiare per il futuro, mai per i manti già in giro.

## Limiti da tenere presenti

- **Dipende da Base.** Il sequencer è di Coinbase e il software di Base può essere aggiornato da un gruppo ristretto; non possono toccare i saldi, ma la rete di tutti i giorni dipende da loro. Ogni operazione costa una frazione di centesimo in ETH.
- **Un errore nel codice resta per sempre.** Contratto minimo, standard ERC-20, provato a lungo su Base Sepolia prima della rete vera.
- **I manti venduti sono un debito in merce.** Per ogni manto in giro il negozio deve un euro di merce. Non vanno venduti più di quanti se ne possano onorare.
- **Legale e fiscale.** Buono prepagato spendibile in una rete limitata di negozi: fuori da moneta elettronica e MiCA finché resta tale. La vendita di manti si tratta come un buono (monovalore o multivalore): da confermare con il commercialista prima di vendere.
