# Regole della moneta aziendale

Versione 1.1 — 19 settembre 2026
Stato: definitivo per la fase di test interna. Si rivede prima di estendere il sistema a una seconda azienda.

## 1. Scopo

Un sistema di moneta interna, convertibile in euro, usato come gioco a premi tra i dipendenti. Lo scopo dichiarato è premiare comportamenti scelti dall'azienda. Lo scopo reale è collaudare in condizioni vere un portafoglio, un registro di transazioni firmate e un'economia tra persone, prima di riusarli in un prodotto pubblico.

Il gioco è volontario. Chi non partecipa non perde nulla.

## 2. Parametri

Tutti i numeri del sistema in un posto solo. Cambiarne uno significa aggiornare questa tabella e la versione del documento.

| Parametro | Valore | Note |
|---|---|---|
| Fatturato medio mensile di riferimento | 50.000 € netto IVA | Base per la riserva |
| Quota del fatturato versata in riserva | 1% | Circa 500 € al mese |
| Emissione del primo mese | 500 gettoni | Pari agli euro versati: 1 gettone = 1 € alla partenza |
| Riduzione mensile dell'emissione | 2% | Composta, ogni mese sul mese precedente |
| Tetto massimo di gettoni | 25.000 | Limite matematico dell'emissione, non raggiungibile |
| Commissione sulla conversione | 2% | Trattenuta in gettoni dalla banca |
| Commissione sugli scambi tra dipendenti | 0% | |
| Frequenza di pubblicazione del valore | Giornaliera | |
| Conversione | Tramite busta paga | Mai bonifico diretto |

## 3. I soggetti

| Chi | Cosa può fare | Cosa non può fare |
|---|---|---|
| La banca | Tiene il registro, custodisce la riserva, emette gettoni secondo il piano, applica le commissioni, pubblica il valore | Creare gettoni fuori dal piano, prelevare da un conto senza la firma del titolare, modificare movimenti passati |
| L'azienda | Versa la quota in riserva, assegna i gettoni del mese ai dipendenti secondo il catalogo premi | Emettere più gettoni di quelli previsti dal piano, togliere gettoni a qualcuno |
| Il dipendente | Riceve premi, scambia gettoni con i colleghi, converte in euro | Nulla di vietato. Il suo unico obbligo è custodire la propria chiave |

Il sistema è progettato per più aziende fin dall'inizio: ogni azienda ha il proprio conto, la propria riserva e il proprio piano di emissione. Nella fase di test ce n'è una sola. Vedi la sezione 10 prima di aggiungerne altre.

## 4. La riserva

- Ogni mese l'azienda versa l'1% del fatturato del mese precedente, netto IVA, su un conto bancario dedicato e separato dai conti operativi.
- Il saldo della riserva è visibile a tutti i partecipanti in ogni momento.
- La riserva serve a una cosa sola: pagare le conversioni. Non si tocca per altro.
- Regola inviolabile: la riserva non può mai scendere sotto il valore complessivo dei gettoni in circolazione.

## 5. L'emissione

L'emissione è il numero di gettoni nuovi che l'azienda può assegnare in un mese. È fissa, decisa in anticipo, e non dipende dal fatturato.

- Primo mese: 500 gettoni.
- Ogni mese successivo: il 2% in meno del mese prima.
- Emissione dei primi dodici mesi: 500, 490, 480, 471, 461, 452, 443, 434, 425, 417, 409, 400.
- Somma di tutte le emissioni possibili, all'infinito: 25.000 gettoni. È il tetto.

I gettoni del mese non assegnati non vengono emessi. Non si accumulano, non si recuperano. Restano fuori dal sistema e rendono più preziosi quelli in circolazione.

## 6. Il valore

Il valore di un gettone è una divisione:

    valore = euro in riserva / gettoni in circolazione

Viene calcolato e pubblicato ogni giorno. Nessuno lo decide: deriva dai due numeri.

Il valore cresce perché la riserva cresce di una quota costante mentre l'emissione cala. A fatturato fermo a 50.000 € al mese, senza nessuna conversione:

| Dopo | Riserva | Gettoni in circolazione | Valore di un gettone |
|---|---|---|---|
| 1 mese | 500 € | 500 | 1,00 € |
| 6 mesi | 3.000 € | 2.854 | 1,05 € |
| 12 mesi | 6.000 € | 5.382 | 1,11 € |
| 24 mesi | 12.000 € | 9.605 | 1,25 € |
| 36 mesi | 18.000 € | 12.920 | 1,39 € |
| 48 mesi | 24.000 € | 15.520 | 1,55 € |
| 60 mesi | 30.000 € | 17.561 | 1,71 € |

Circa l'11% all'anno. Se il fatturato cresce, il gettone cresce di più. Se il fatturato scende, cresce meno o scende. Il gettone è una scommessa sull'andamento dell'azienda, e va spiegato così a chi partecipa.

Le conversioni non alterano il valore: tolgono euro dalla riserva e gettoni dalla circolazione nella stessa proporzione.

## 7. La conversione in euro

1. Il dipendente chiede di convertire un numero di gettoni.
2. La banca trattiene il 2% in gettoni come commissione e calcola gli euro sul resto, al valore del giorno.
3. I gettoni convertiti vengono distrutti. Quelli della commissione passano al conto della banca.
4. La banca comunica all'azienda l'importo da inserire nella busta paga del mese successivo, e sposta lo stesso importo dalla riserva al conto operativo dell'azienda.
5. Il dipendente vede gli euro in busta paga, con le trattenute fiscali e contributive di legge.

Non esiste bonifico diretto dalla banca al dipendente. Questo tiene il sistema dentro il perimetro di un premio aziendale e fuori da quello dei servizi di pagamento.

Non ci sono limiti minimi o massimi alla conversione. Se in futuro serviranno, vanno aggiunti alla tabella dei parametri.

## 8. Il mercato tra dipendenti

- Ogni dipendente può trasferire gettoni a qualsiasi altro, in qualsiasi quantità, senza commissione.
- Cosa si scambia in cambio dei gettoni non riguarda il sistema: un turno, un favore, un oggetto, euro tra privati. Il sistema registra solo il movimento di gettoni.
- Il prezzo in euro che due colleghi si accordano tra loro è libero. La riserva garantisce un valore minimo; il mercato può stare sopra.
- Ogni trasferimento è firmato da chi lo invia ed è definitivo. Non esiste storno. Chi sbaglia destinatario deve chiedere al destinatario di restituire.

## 9. I premi

L'emissione del mese è un budget che l'azienda distribuisce secondo un catalogo pubblico. Il catalogo dice quali comportamenti valgono gettoni e quanti.

**Il catalogo è un dato, non una regola.** Si può cambiare in qualsiasi momento, senza preavviso, aggiungendo, togliendo o rivalutando voci. Ogni modifica è una transazione firmata dall'azienda, con data e ora, registrata nella catena come ogni altro movimento. Il sito mostra il catalogo in vigore e tutta la sua storia. Un premio assegnato vale quello che il catalogo diceva nel momento dell'assegnazione, non quello che dice oggi.

**I valori seguono l'algoritmo.** Ogni voce del catalogo è espressa come quota dell'emissione del mese, non come numero fisso di gettoni. Esempio: "una giornata senza parolacce vale il 2% dell'emissione mensile". Con l'emissione che cala del 2% ogni mese, i premi in gettoni calano da soli con lo stesso ritmo, senza che nessuno debba aggiornarli. Il motore calcola il valore in gettoni di ogni voce ogni giorno e lo pubblica accanto al catalogo.

In futuro il catalogo potrà adattarsi anche al budget residuo del mese (sezione 13). Non nella prima versione.

Regole del catalogo:

- Si guadagnano gettoni per un comportamento tenuto. Non si perdono mai gettoni per un comportamento mancato. Il sistema non ha penalità e non può averle: un prelievo forzato sarebbe una sanzione disciplinare, regolata dalla legge con procedure proprie.
- Chi assegna i premi è l'azienda, con una regola chiara per ogni voce, in modo che due persone nella stessa situazione ricevano lo stesso.
- Il catalogo iniziale è un documento separato, `CATALOGO_PREMI.md`, da scrivere prima del primo mese. Dopo l'avvio, la versione in vigore è quella nel registro, non quella nel file.

## 10. Vincoli di legge

Queste non sono scelte, sono le condizioni che tengono il gioco legale in Italia. Vanno verificate con un commercialista prima di partire e con un avvocato prima di ogni estensione.

- **Gli euro convertiti sono retribuzione.** Passano dalla busta paga con tasse e contributi. Se il piano viene formalizzato come premio di risultato legato al fatturato tramite accordo aziendale, può accedere alla tassazione agevolata prevista dalla legge (nel 2025: 5% fino a 3.000 € l'anno per dipendente). Da verificare col commercialista.
- **Una sola azienda, i propri dipendenti, conversione via busta paga**: è un piano premi aziendale. Nessuna autorizzazione richiesta.
- **Più aziende, o conversione fuori dalla busta paga, o partecipanti non dipendenti**: si entra nei servizi di pagamento o nella moneta elettronica. In Italia serve l'autorizzazione della Banca d'Italia, e in Europa si applica il regolamento MiCA. Non è vietato, richiede una consulenza legale, capitale minimo e una struttura. Questa estensione non parte senza quel passaggio.
- **Nessuna penalità.** Vedi sezione 9.
- **Partecipazione volontaria e dati personali.** Il registro contiene chi ha ricevuto e trasferito cosa. Serve un'informativa privacy per i partecipanti, e il registro non va reso pubblico fuori dall'azienda.

## 11. Il motore: regole scritte nel codice

Il motore è il programma che applica le regole. Gira da solo, ogni giorno, senza intervento umano. Nessun amministratore, nemmeno il titolare, può aggirare le regole che seguono senza modificare il codice, e ogni modifica al codice è pubblica per i partecipanti.

1. I gettoni si creano solo nell'ambito dell'emissione mensile prevista dal piano.
2. Nessun movimento in uscita da un conto senza la firma della chiave del titolare.
3. Nessun movimento passato può essere modificato o cancellato. Ogni movimento è concatenato al precedente tramite hash.
4. La riserva non può scendere sotto il valore dei gettoni in circolazione.
5. La commissione si applica solo alla conversione, mai ai trasferimenti.
6. Il valore giornaliero è calcolato dal registro, non inserito a mano.
7. Il catalogo si cambia solo con una transazione firmata, registrata nella catena.

**Cosa è fisso e cosa è modificabile**

| Fisso (codice) | Modificabile (dati firmati) |
|---|---|
| Piano di emissione | Catalogo premi e valori |
| Formula del valore | Assegnazione dei premi |
| Commissioni | Conti dei partecipanti |
| Regole di firma e catena | Versamenti in riserva |

Cambiare una cosa nella colonna di sinistra significa cambiare il codice, pubblicare la modifica, e aggiornare questo documento. Cambiare una cosa nella colonna di destra è una transazione come le altre.

**Pubblicazione giornaliera**

Ogni giorno, a un'ora fissa, il motore:

1. legge il registro e verifica la catena degli hash dall'inizio;
2. calcola il valore del gettone, i gettoni in circolazione, la riserva, il budget residuo del mese e il valore in gettoni di ogni voce del catalogo;
3. pubblica tutto su un sito accessibile ai partecipanti, insieme al registro completo, così chiunque può rifare i conti.

La pubblicazione non è modificabile a mano: il sito è generato dal motore a partire dal registro, e ogni pubblicazione lascia traccia con data, ora e hash del registro da cui deriva. Se il motore non gira o il registro non torna, il sito lo dice invece di pubblicare numeri.

**Indipendenza**

Il motore, il registro e il sito vivono in un repository con cronologia pubblica per i partecipanti. Ogni versione del motore e ogni pubblicazione giornaliera è un commit. Non è possibile cambiare qualcosa di nascosto: è possibile solo cambiarlo alla luce del sole.

## 12. Cosa succede se

- **Un dipendente perde la chiave.** I gettoni su quel conto sono persi, come contanti persi. La procedura di recupero, se esiste, va decisa nell'architettura tecnica (per esempio: chiave di backup custodita dalla banca in busta chiusa, o recupero con la firma di due colleghi). Va deciso prima di partire, e va spiegato a tutti.
- **Un dipendente lascia l'azienda.** Può convertire tutti i gettoni entro l'ultima busta paga. Dopo, il conto viene chiuso e i gettoni residui distrutti.
- **Il fatturato cala molto.** La riserva cresce meno, l'emissione continua a scendere, il valore può calare. Nessuna regola interviene. È il rischio del gioco ed è dichiarato.
- **L'azienda vuole chiudere il gioco.** Preavviso di un mese, tutti convertono al valore del giorno, la riserva residua torna all'azienda.
- **Un errore nel software.** Il registro è verificabile da tutti. Se un movimento risulta invalido, viene annullato con un movimento correttivo firmato dalla banca e motivato pubblicamente. Non si cancella niente.

## 13. Opzioni per dopo

Non nella prima versione. Segnate per non dimenticarle.

- **Conto deposito.** Il dipendente blocca gettoni per sei mesi e riceve un bonus preso dalle commissioni incassate dalla banca. Costo zero per l'azienda.
- **Premi tra colleghi.** Ogni dipendente riceve un piccolo budget mensile di gettoni che può solo regalare ad altri. Il riconoscimento non arriva solo dall'alto.
- **Catalogo adattivo.** I valori dei premi salgono se a metà mese resta molto budget non assegnato, per spingere a usarlo. Interessante ma difficile da spiegare; da provare solo dopo qualche mese di dati.
- **Seconda azienda.** Solo dopo il passaggio legale della sezione 10.

## 14. Revisione

Questo documento si rivede:

- prima di scrivere il catalogo premi;
- prima del primo mese di gioco, con il commercialista;
- dopo tre mesi di gioco, con i dati reali di conversione e scambio;
- prima di qualsiasi estensione a soggetti esterni all'azienda.
