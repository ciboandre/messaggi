# Regole del manto autonomo

Il manto è una moneta che, una volta creata, non dipende da nessuno: nessun proprietario, nessun interruttore, nessuna regola modificabile. Vive come contratto immutabile su una blockchain pubblica esistente e gira finché gira quella rete. Queste tre regole sono tutto ciò che il contratto sa fare; ciò che non c'è scritto qui non esiste.

## 1. Emissione: 1.000 manti al giorno, per sempre

- Il giorno di creazione è il giorno 0. Ogni giorno successivo possono nascere al massimo **1.000 manti**.
- La quantità è fissa: non cambia mai, non ha tetto, non si dimezza.
- Un manto si divide in 100 centesimi.

Conseguenza: dopo 1 anno esistono al più 365.000 manti, dopo 10 anni 3.650.000. L'inflazione annua è del 100% il primo anno, del 10% il decimo, e continua a scendere.

## 2. Destinatari: chi li reclama, in parti uguali

- Chiunque, in un dato giorno, chiama il contratto per **reclamare** entra nell'elenco di quel giorno. Il reclamo costa solo la commissione di rete; il contratto non chiede altro.
- Alla fine del giorno i 1.000 manti si dividono **in parti uguali** tra gli indirizzi che hanno reclamato. Un indirizzo conta una volta sola al giorno.
- Se nessuno reclama, quel giorno i manti **non nascono**: non si accumulano e non si recuperano.
- Non c'è mining, non c'è interesse sul saldo, non c'è nessun privilegio.

## 3. Creatore: quota di tre mesi, sbloccata in quattro anni

- Alla creazione il contratto assegna al creatore **91.250 manti** (pari a tre mesi di emissione).
- La quota è **bloccata** e si sblocca in **48 rate mensili uguali** di 1.901,04 manti (l'ultima chiude il resto). Prima di ogni scadenza quei manti non si possono muovere, nemmeno dal creatore.
- Nessuna commissione sui trasferimenti: ogni manto che passa di mano arriva intero.
- Dopo la 48ª rata il contratto non ha più nulla di speciale per il creatore: è un indirizzo come gli altri.

Conseguenza: la parte del creatore è il 20% del totale dopo 1 anno, il 6% dopo 4, il 2,4% dopo 10, e cala sempre.

## Ciò che il contratto non fa

Non ha proprietario, non ha pausa, non blocca conti, non cambia le regole, non stampa fuori regola, non distingue tra indirizzi. Non c'è banca, giudice, polizia, multe, conversione in euro: tutto ciò che è umano resta fuori dal contratto.

## Limiti da tenere presenti

- **Dipende dalla rete che lo ospita.** La scelta della rete (Ethereum o una sua rete economica come Base) è il passo successivo; ogni operazione costa una piccola commissione in ETH.
- **Un errore nel codice resta per sempre.** Il contratto deve essere minimo, basato sullo standard ERC-20, e provato a lungo su una rete di prova prima della vera.
- **Il creatore riceve manti, non euro.** Valgono qualcosa solo se qualcuno li vuole. Emettere e vendere un token in Europa ricade nel regolamento MiCA: da verificare prima di vendere.
