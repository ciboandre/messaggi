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

Ciò che dà valore al manto sta fuori dal contratto, ed è una promessa del negozio, valida finché il negozio la mantiene. **Il negozio accetta soltanto**: non vende manti e non li compra per rivenderli; nessun euro dei clienti passa dal contratto o dal negozio per i manti.

- **Pagare in manti dà uno sconto.** Il negozio pubblica sul sito un valore di riferimento (per esempio 1 manto = 1 € di merce) e lo sconto per chi paga in manti. Si possono cambiare per il futuro, mai per gli ordini già fatti.
- **I manti incassati tornano in giro**: cashback a chi paga in euro, regali per una recensione, un cliente portato, il primo ordine. Se il negozio compra manti per questo, li compra da chi li ha, come chiunque, ed è una spesa pubblicitaria.
- **Altri negozi** potranno accettare manti alle loro condizioni: è un accordo tra loro e i clienti, il contratto non c'entra.

Da dove li prende un cliente:

1. **Li reclama**: il sito ha il bottone "Reclama i manti di oggi"; il giorno dopo ritira la sua parte. È lento per costruzione: premia chi torna ogni giorno, ed è a questo che servono i social.
2. **Li compra da chi li ha**: un passaparola all'inizio; poi, quando ce ne sono abbastanza in giro, chiunque può aprire uno scambio automatico su Base (Uniswap o simili) mettendo manti e una moneta stabile in riserva. Il negozio al più linka lo scambio; i soldi vanno a chi vende, mai al negozio. Prima di mettere il nome del negozio su un link "compra manti", una domanda a un avvocato su MiCA.
3. **Li riceve**: dal cashback e dai regali del negozio, o da chi ne ha.

Il cliente che arriva oggi non ne ha: compra in euro, riceve un piccolo cashback, e la prossima volta ne ha. Il negozio, nei primi giorni, reclama come tutti per avere i manti dei primi cashback.

Il sito deve fare tre cose: **reclama**, **paga in manti** con lo sconto, **cashback e regali**.

## Contabilità del negozio

Non è un parere professionale: è il quadro da portare al commercialista. Per la società i manti sono **cripto-attività iscritte in bilancio come un bene**, al costo, come buoni da regalare; il portafoglio non è un conto e non serve un registro a parte. La pezza d'appoggio è il contratto stesso: ogni movimento dell'indirizzo del negozio è pubblico, con data e importo, esportabile a fine anno.

1. **Acquisto di manti**: uscita in euro, manti in entrata al costo; ricevuta del venditore o estratto dello scambio. Nessuna IVA sul passaggio.
2. **Cashback e regali**: spesa promozionale deducibile per il costo sostenuto; se legata a un acquisto è di fatto uno sconto. Da decidere una volta con il commercialista se trattarla come sconto o come pubblicità.
3. **Incasso in manti**: vendita al prezzo scontato (sconto in fattura ordinario); la parte in manti è un pagamento in natura, iscritto al valore di riferimento pubblicato. L'IVA si calcola sul prezzo scontato in euro, come sempre.
4. **Fine anno**: i manti in cassa restano al costo; le oscillazioni non contano finché non si cedono. Sul valore detenuto si applica l'imposta sul valore delle cripto-attività (2 per mille), anche per le società.

Le due scelte da fare col commercialista: come trattare il cashback (sconto o pubblicità) e a che valore iscrivere i manti incassati. Il valore di riferimento pubblicato risolve la seconda.

## Limiti da tenere presenti

- **Dipende da Base.** Il sequencer è di Coinbase e il software di Base può essere aggiornato da un gruppo ristretto; non possono toccare i saldi, ma la rete di tutti i giorni dipende da loro. Ogni operazione costa una frazione di centesimo in ETH.
- **Un errore nel codice resta per sempre.** Contratto minimo, standard ERC-20, senza librerie esterne, provato a lungo su Base Sepolia prima della rete vera.
- **Il manto vale quanto il negozio lo paga.** Se il negozio smette di comprarlo e accettarlo, resta un contatore. Chi lo reclama lo sa.
- **Legale.** Il contratto non vende nulla e non promette nulla. Finché il manto si reclama e si spende è un buono; appena è scambiabile con denaro su un mercato è una cripto-attività ai sensi di MiCA, senza emittente né gestore: zona ancora poco chiara, da chiedere a un avvocato prima che il negozio ci metta il nome.
