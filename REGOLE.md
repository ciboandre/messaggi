# Regole del manto

Il manto è una moneta che, una volta creata, non dipende da nessuno: un contratto immutabile su Base (rete di secondo livello di Ethereum), senza proprietario, senza interruttore, senza regole modificabili, senza nessun indirizzo nominato. Il contratto sa fare solo ciò che è scritto qui. Chi la crea non riceve nulla dal contratto: partecipa come tutti.

## 1. Emissione: 1.000 manti al giorno, per sempre

- Il giorno di creazione è il giorno 0. Ogni giorno, compreso il giorno 0, nascono al massimo **1.000 manti**.
- La quantità è fissa: non cambia mai, non ha tetto, non si dimezza.
- Un manto si divide in 100 centesimi.

Conseguenza: dopo 1 anno esistono al più 365.000 manti, dopo 10 anni 3.650.000. L'inflazione annua è del 100% il primo anno, del 10% il decimo, e continua a scendere.

## 2. Destinatari: chi li reclama, in parti uguali

- Chiunque, in un dato giorno, chiama il contratto per **reclamare** entra nell'elenco di quel giorno. Il reclamo costa solo la commissione di rete; il contratto non chiede altro.
- I 1.000 manti del giorno si dividono **in parti uguali** tra gli indirizzi che hanno reclamato. Un indirizzo conta una volta sola al giorno. Il resto della divisione (al più qualche centesimo) non nasce.
- Il giorno dopo, chi ha reclamato **ritira** la sua parte; il ritiro non scade, e il reclamo del giorno successivo ritira da sé quello precedente.
- Se nessuno reclama, quel giorno i manti **non nascono**: non si accumulano e non si recuperano.
- Non c'è mining, non c'è interesse sul saldo, non c'è nessun privilegio.

## 3. Creatore

Nessuna quota, nessuna commissione, nessun indirizzo speciale. Il creatore reclama come chiunque e compra manti da chi li ha, come chiunque. Ogni manto che passa di mano arriva intero.

## Ciò che il contratto non fa

Non ha proprietario, non ha pausa, non blocca conti, non cambia le regole, non stampa fuori regola, non distingue tra indirizzi, non tassa i trasferimenti. Non c'è banca, giudice, polizia, multe, conversione in euro.

## Il manto e 2m2.it

Ciò che dà valore al manto sta fuori dal contratto, ed è una promessa del negozio, valida finché il negozio la mantiene:

- **2m2.it compra manti** da chi li ha, a un prezzo che annuncia. All'inizio il negozio è l'unico compratore, cioè il mercato.
- **2m2.it accetta manti in pagamento con uno sconto**: chi paga in manti spende meno di chi paga in euro, alle condizioni pubblicate sul sito. Sconto e prezzo di acquisto si possono cambiare per il futuro, mai per gli ordini già fatti.
- Altri negozi potranno fare lo stesso alle loro condizioni: è un accordo tra loro e i clienti, il contratto non c'entra.

Reclamare ogni giorno è il modo di ricordarsi del negozio ogni giorno: è a questo che servono i social.

## Limiti da tenere presenti

- **Dipende da Base.** Il sequencer è di Coinbase e il software di Base può essere aggiornato da un gruppo ristretto; non possono toccare i saldi, ma la rete di tutti i giorni dipende da loro. Ogni operazione costa una frazione di centesimo in ETH.
- **Un errore nel codice resta per sempre.** Contratto minimo, standard ERC-20, senza librerie esterne, provato a lungo su Base Sepolia prima della rete vera.
- **Il manto vale quanto il negozio lo paga.** Se il negozio smette di comprarlo e accettarlo, resta un contatore. Chi lo reclama lo sa.
- **Legale e fiscale.** Il contratto non vende nulla e non promette nulla. L'acquisto di manti da parte del negozio e lo sconto a chi paga in manti sono operazioni ordinarie del negozio: da confermare con il commercialista (come trattare i manti acquistati e lo sconto in fattura).
