# Regole del manto

Il manto è una moneta che, una volta creata, non dipende da nessuno: un contratto immutabile su Base (rete di secondo livello di Ethereum), senza proprietario, senza interruttore, senza regole modificabili, senza nessun indirizzo nominato. Il contratto sa fare solo ciò che è scritto qui. Chi la crea non riceve nulla dal contratto: partecipa come tutti.

## 1. Emissione: 100 manti al giorno, per sempre

- Il giorno di creazione è il giorno 0. Ogni giorno, compreso il giorno 0, nascono al massimo **100 manti**.
- La quantità è fissa: non cambia mai, non ha tetto, non si dimezza.
- Un manto si divide in 100 centesimi.

Conseguenza: dopo 1 anno esistono al più 36.500 manti, dopo 10 anni 365.000. L'inflazione annua è del 100% il primo anno, del 10% il decimo, e continua a scendere.

## 2. Destinatari: chi versa ETH, in proporzione

- Chiunque, in un dato giorno, **versa ETH** al contratto entra nell'asta di quel giorno. Basta un invio di ETH all'indirizzo del contratto, o la chiamata `versa()`.
- I 100 manti del giorno si dividono **in proporzione a quanto ciascuno ha versato**. Il prezzo del giorno lo fa la domanda: se in totale arrivano 10 $, quel giorno un manto costa 10 centesimi; se arrivano 1.000 $, 10 $. Mille indirizzi non servono a niente: conta quanto versi, non da quanti indirizzi.
- Dal giorno dopo, chi ha versato **ritira** la sua parte; il ritiro non scade, e una chiamata ritira tutti i giorni arretrati insieme. Il resto della divisione (frazioni di centesimo) non nasce.
- Se nessuno versa, quel giorno i manti **non nascono**: non si accumulano e non si recuperano.

## 3. La riserva: gli ETH restano nel contratto

- Gli ETH versati **restano nel contratto per sempre**, come riserva. Nessuno può prelevarli: né chi ha pubblicato, né chi ha versato, né alcun amministratore, perché non esiste.
- Gli ETH del giorno in corso non fanno ancora parte della riserva: entrano a fine giornata, insieme ai manti che hanno comprato.

## 4. Il riscatto: chi brucia manti riceve la sua parte della riserva

- In qualsiasi momento, chiunque può **bruciare** manti che possiede: spariscono per sempre, e riceve subito ETH pari a (manti bruciati ÷ manti esistenti) × riserva. Nessuno può dire di no, non c'è coda, non c'è "liquidità finita".
- I manti esistenti sono tutti quelli nati nei giorni conclusi, **ritirati o no**, meno quelli bruciati: chi brucia subito dopo mezzanotte non prende niente a chi ritira dopo.
- Il **pavimento** del manto è riserva ÷ esistenti: la media di quanto è stato pagato finora. Non scende mai quando qualcuno brucia, chiunque sia; sale con gli arrotondamenti che restano nel contratto. Chi compra sopra la media e brucia subito riprende meno; chi ha comprato prima, di più.
- Sopra il pavimento, un manto vale quello che qualcuno è disposto a darti per averlo, o ad accettarlo in pagamento.

## 5. Creatore

Nessuna quota, nessuna commissione, nessun indirizzo speciale. Il creatore versa come chiunque, ritira come chiunque, brucia come chiunque.

## Ciò che il contratto non fa

Non ha proprietario, non ha pausa, non blocca conti, non cambia le regole, non stampa fuori regola, non distingue tra indirizzi, non tassa i trasferimenti, non preleva la riserva. Non c'è banca, giudice, polizia, multe, conversione in euro. La riserva è solo in ETH: l'unica cosa su Base che non ha un padrone e non si congela.

## Il manto e 2m2.it

Ciò che dà valore al manto **sopra il pavimento** sta fuori dal contratto, ed è una promessa del negozio, valida finché il negozio la mantiene. **Il negozio accetta soltanto**: non vende manti e non li compra per rivenderli.

- **Pagare in manti dà uno sconto.** Il negozio pubblica sul sito un valore di riferimento e lo sconto per chi paga in manti. Si possono cambiare per il futuro, mai per gli ordini già fatti.
- **I manti incassati tornano in giro**: cashback a chi paga in euro, regali per una recensione, un cliente portato, il primo ordine. Se il negozio ne ha bisogno di più, versa all'asta come chiunque.
- **Altri negozi** potranno accettare manti alle loro condizioni: è un accordo tra loro e i clienti, il contratto non c'entra.

Da dove li prende un cliente: li compra all'asta (dal sito, "versa"), li compra da chi li ha, li riceve dal cashback e dai regali del negozio. Il sito deve fare tre cose: **versa/ritira/brucia**, **paga in manti** con lo sconto, **cashback e regali**.

## Contabilità del negozio

Non è un parere professionale: è il quadro da portare al commercialista. Per la società i manti sono **cripto-attività iscritte in bilancio come un bene**, al costo; il portafoglio non è un conto e non serve un registro a parte. La pezza d'appoggio è il contratto stesso: ogni movimento dell'indirizzo del negozio è pubblico, con data e importo, esportabile a fine anno.

1. **Acquisto di manti** (all'asta o da chi li ha): uscita in ETH/euro, manti in entrata al costo. Nessuna IVA sul passaggio.
2. **Cashback e regali**: spesa promozionale deducibile per il costo sostenuto; se legata a un acquisto è di fatto uno sconto. Da decidere una volta con il commercialista se trattarla come sconto o come pubblicità.
3. **Incasso in manti**: vendita al prezzo scontato (sconto in fattura ordinario); la parte in manti è un pagamento in natura, iscritto al valore di riferimento pubblicato. L'IVA si calcola sul prezzo scontato in euro, come sempre.
4. **Riscatto** (bruciare per ETH) e vendita di ETH per euro: realizzo, con plusvalenza o minusvalenza rispetto al costo.
5. **Fine anno**: i manti in cassa restano al costo; le oscillazioni non contano finché non si cedono. Sul valore detenuto si applica l'imposta sul valore delle cripto-attività (2 per mille), anche per le società.

## Limiti da tenere presenti

- **Dipende da Base.** Il sequencer è di Coinbase e il software di Base può essere aggiornato da un gruppo ristretto; non possono toccare i saldi né la riserva, ma la rete di tutti i giorni dipende da loro. Ogni operazione costa una frazione di centesimo in ETH.
- **Un errore nel codice resta per sempre.** Contratto minimo, senza librerie esterne, con i test; provato su Base Sepolia prima della rete vera.
- **Il pavimento è in ETH.** In euro sale e scende con l'ETH.
- **Legale.** Il contratto raccoglie ETH e li tiene in riserva senza che nessuno li gestisca: non ha emittente né gestore, ma è una cripto-attività scambiabile con denaro ai sensi di MiCA, in una zona ancora poco chiara. Da chiedere a un avvocato prima che il negozio ci metta il nome sopra.
- **Fiscale, per i privati**: chi compra manti e li brucia o li vende con guadagno ha una plusvalenza tassata (26% in Italia); i manti detenuti vanno dichiarati (quadro RW, 2 per mille).
