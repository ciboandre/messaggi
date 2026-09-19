# Modello di minaccia

Versione 1.0 — 19 settembre 2026
Stato: definitivo per la fase di progettazione. Si rivede a ogni cambio di architettura e prima di ogni release pubblica.

## 1. Scopo

Questo documento dice da chi proteggiamo gli utenti, da cosa non li proteggiamo, e quali scelte tecniche ne derivano. Ogni decisione di progetto deve poter essere ricondotta a una riga di questo documento. Se non ci si riesce, o la decisione è sbagliata o il documento va aggiornato.

## 2. Decisioni di fondo

Queste due scelte determinano tutto il resto. Sono prese ora e si cambiano solo con una revisione esplicita di questo documento.

| Decisione | Scelta | Conseguenza |
|---|---|---|
| I governi e le autorità legali sono avversari nel modello | **Sì** | Il progetto deve poter dire "non abbiamo dati da consegnare" ed essere sincero. Infrastruttura distribuita, nessun server obbligatorio nostro, piano anti-censura. |
| Il numero di telefono è l'identità dell'utente | **No** | L'identità è una coppia di chiavi generata sul dispositivo. Nessun dato anagrafico richiesto. La scoperta dei contatti è opzionale e privata. |

## 3. Cosa proteggiamo

In ordine di priorità.

1. **Contenuto dei messaggi** (testo, media, file, chiamate): solo i partecipanti alla conversazione possono leggerlo.
2. **Metadati di conversazione**: chi parla con chi, quando, quanto. Nessun singolo nodo della rete deve poterlo ricostruire.
3. **Identità**: chi è una persona nel mondo reale. L'uso dell'app non deve richiedere né rivelare nome, numero, email, posizione.
4. **Appartenenza ai gruppi**: chi è membro di quale gruppo.
5. **Rubrica**: l'elenco dei contatti di un utente non deve lasciare il dispositivo in chiaro.
6. **Disponibilità**: l'app deve continuare a funzionare se una parte della rete viene sequestrata, spenta o bloccata.

## 4. Avversari

Per ciascuno: cosa può fare, cosa vogliamo impedirgli, e cosa gli concediamo.

### A1. La nostra stessa infrastruttura

Il nodo più pericoloso è quello che gestiamo noi. Viene trattato come compromesso per definizione: bucato da un attaccante esterno, letto da un dipendente infedele, o sequestrato con un ordine legale.

- **Impediamo:** leggere contenuti, ricostruire chi parla con chi, ottenere rubriche, aggiungere membri a un gruppo, impersonare un utente, sostituire chiavi senza che l'utente lo veda.
- **Concediamo:** sapere che un certo identificatore ha depositato o ritirato buste in un certo momento. Questo è il residuo di metadati che accettiamo, e lo riduciamo con instradamento a più salti e riempimento del traffico.

### A2. Un qualsiasi nodo della rete

I nodi sono gestiti da terzi che non conosciamo e non controlliamo. Un nodo può essere malevolo, colluso con altri, o gestito da un avversario.

- **Impediamo:** a un singolo nodo, o a una minoranza di nodi collusi, di vedere insieme mittente e destinatario di un messaggio. Impediamo di alterare, duplicare o cancellare selettivamente messaggi senza che il destinatario se ne accorga.
- **Concediamo:** che un avversario che controlla la maggioranza dei nodi sul percorso di un messaggio possa correlare i due estremi. La difesa è rendere costoso controllare molti nodi, non renderlo impossibile.

### A3. Attaccante passivo sulla rete

Chi osserva il traffico: provider, operatore mobile, gestore del Wi-Fi, nodo intermedio di Internet, agenzia con accesso alle dorsali.

- **Impediamo:** leggere contenuti, identificare l'app in uso dal traffico, capire con chi si comunica.
- **Concediamo:** sapere che il dispositivo comunica con nodi della rete. Un avversario che osserva contemporaneamente il traffico di entrambi gli estremi può correlare i tempi (attacco di correlazione globale). Non lo contrastiamo pienamente nella prima versione.

### A4. Attaccante attivo sulla rete

Come A3, ma può modificare, bloccare, iniettare o ritardare traffico. Include gli ordini di blocco a livello nazionale.

- **Impediamo:** modificare o iniettare messaggi, forzare un downgrade della cifratura, fare man-in-the-middle sull'identità.
- **Contrastiamo:** il blocco dell'app, con trasporti alternativi (proxy, offuscamento del protocollo, domain fronting dove disponibile). Il blocco totale è sempre possibile per un avversario che controlla l'intera rete di un paese; puntiamo a renderlo costoso e visibile.

### A5. Governi e autorità legali

Possono sequestrare hardware, emettere ordini a noi e ai gestori dei nodi, obbligare gli store a rimuovere l'app, e in alcuni paesi obbligare i cittadini a consegnare i dispositivi.

- **Impediamo:** che esista un punto dove un ordine legale produca contenuti o metadati utili. Nessun database centrale, nessun log di chi parla con chi, nessuna chiave in nostro possesso.
- **Concediamo:** che possano chiudere l'organizzazione, rimuovere l'app dagli store, o bloccarla. Il protocollo e il codice sono aperti e la rete di nodi non dipende da noi, così il servizio sopravvive all'organizzazione.

### A6. Chi ha compromesso un dispositivo in passato

Un dispositivo infettato per un periodo e poi ripulito, sostituito o aggiornato. L'attaccante ha avuto le chiavi di quel periodo.

- **Impediamo:** leggere le conversazioni precedenti alla compromissione (forward secrecy) e quelle successive alla bonifica (post-compromise security). Le chiavi ruotano a ogni messaggio.
- **Concediamo:** tutto ciò che è stato scambiato durante la compromissione.

### A7. Chi entra o esce da un gruppo

Ex membri, nuovi membri, nodi che tentano di aggiungere membri fantasma.

- **Impediamo:** a un ex membro di leggere dopo l'uscita, a un nuovo membro di leggere prima dell'ingresso, a chiunque non sia un amministratore del gruppo di modificarne la composizione. La lista dei membri è verificabile da ogni membro.
- **Concediamo:** che un membro legittimo possa esportare o inoltrare ciò che vede.

### A8. Chi impersona

Chi tenta di farsi passare per un contatto, di sostituire la chiave di qualcuno, o di intercettare il primo contatto tra due persone.

- **Impediamo:** il cambio silenzioso di chiave. Ogni variazione è segnalata in modo visibile e blocca l'invio finché l'utente non conferma. Esiste una verifica fuori banda (codice di sicurezza, QR).
- **Concediamo:** che il primo contatto tra due sconosciuti, senza verifica fuori banda, sia vulnerabile a un avversario che controlla il canale di scoperta. Lo mitighiamo con la trasparenza delle chiavi ma non lo eliminiamo.

### A9. Avversario con capacità quantistica futura

Chi registra oggi il traffico cifrato per decifrarlo quando i computer quantistici lo permetteranno.

- **Impediamo:** che la sola rottura della crittografia a curve ellittiche renda leggibile il traffico registrato. Lo scambio di chiavi è ibrido: classico più post-quantistico.
- **Concediamo:** che le firme d'identità restino classiche nella prima versione. La rottura permetterebbe impersonazione futura, non lettura del passato.

### A10. Spyware sul dispositivo attivo (Pegasus e simili)

Malware con controllo completo del dispositivo mentre l'utente lo usa.

- **Non impediamo** la lettura di ciò che l'utente vede. È fuori dal perimetro di qualsiasi applicazione.
- **Riduciamo la superficie:** nessuna elaborazione automatica di media, link o file da mittenti non verificati; parsing dei contenuti in un processo isolato; modalità blindata che disattiva anteprime, download automatici e chiamate da sconosciuti.
- **Riduciamo il danno:** messaggi a scadenza attivi per default, nessun backup in cloud, chiavi legate all'hardware, revoca di un dispositivo dagli altri, forward secrecy che impedisce di ricostruire il passato.
- **Diciamo la verità:** la documentazione pubblica dichiara questo limite e indica cosa fare (dispositivo dedicato, sistema rinforzato come GrapheneOS, poche app).

## 5. Cosa non proteggiamo

Dichiarato pubblicamente, senza ambiguità.

- **Il dispositivo compromesso durante l'uso.** Vedi A10.
- **L'interlocutore.** Chi riceve un messaggio può fotografarlo, copiarlo, inoltrarlo. I messaggi a scadenza sono una cortesia, non una garanzia.
- **La coercizione fisica.** Se l'utente è costretto a sbloccare il dispositivo, siamo fuori dal modello. Offriamo un blocco rapido e la cancellazione remota da un altro dispositivo, ma non garantiamo nulla.
- **La negazione dell'esistenza dell'account.** La rete sa che un identificatore esiste ed è attivo. Chi ha bisogno di negare anche questo deve usare Tor e un dispositivo dedicato.
- **Le vulnerabilità del sistema operativo e dell'hardware.** Ci fidiamo di iOS, Android, dei chip di sicurezza e delle librerie crittografiche scelte. Se sono rotti lo siamo anche noi.
- **La correlazione globale del traffico.** Un avversario che vede l'intera Internet può correlare i tempi. Non lo contrastiamo nella prima versione.
- **Gli errori dell'utente.** Codice di sicurezza non verificato, dispositivo senza blocco, chiavi condivise. L'interfaccia deve rendere l'errore difficile, non impossibile.

## 6. Ipotesi di fiducia

Ciò di cui ci fidiamo, esplicitamente.

1. Le primitive crittografiche standard (X25519, Ed25519, AES-GCM, ChaCha20-Poly1305, ML-KEM, SHA-256, HKDF) e le librerie che le implementano, scelte tra quelle con audit pubblici.
2. I protocolli Signal (Double Ratchet, X3DH/PQXDH) e MLS (RFC 9420) come base per la cifratura 1 a 1 e di gruppo. Non scriviamo protocolli crittografici propri.
3. Il sistema operativo del dispositivo e il suo archivio sicuro delle chiavi.
4. Il generatore di numeri casuali del sistema.
5. La maggioranza dei nodi sul percorso di un messaggio non è collusa.
6. L'utente verifica i codici di sicurezza dei contatti importanti.

Ogni ipotesi di fiducia è un punto di rottura. Vanno riviste quando cambia il contesto.

## 7. Scelte tecniche che derivano dal modello

| Scelta | Deriva da |
|---|---|
| Cifratura end-to-end su tutto, per default, non disattivabile | A1, A2, A5 |
| Cifratura di gruppo con MLS, lista membri verificabile | A7 |
| Identità basata su chiavi, nessun numero di telefono | Decisione 2, A5, protezione 3 |
| Rete di nodi indipendenti, instradamento a più salti, mittente nascosto ai nodi | A1, A2, A5, protezione 2 |
| Nessun nodo obbligatorio gestito da noi; protocollo aperto | A5, protezione 6 |
| Scambio di chiavi ibrido post-quantistico | A9 |
| Rotazione delle chiavi a ogni messaggio | A6 |
| Cambio di chiave bloccante e visibile; verifica fuori banda | A8 |
| Scoperta contatti privata, opzionale | Protezione 5, Decisione 2 |
| Trasporti alternativi e offuscamento | A4, A5 |
| Messaggi a scadenza per default, nessun backup in cloud | A10, A6 |
| Chiavi legate all'hardware, revoca dispositivi | A10, A6 |
| Modalità blindata, parsing isolato dei media | A10 |
| Codice client e nodo pubblico, build riproducibili | A1, A5 |
| Audit esterno prima di ogni dichiarazione pubblica sulla sicurezza | Tutti |

## 8. Cosa questo modello vieta

Per evitare che rientrino dalla finestra.

- Nessuna "chat normale" non cifrata, nessuna opzione per disattivare la cifratura.
- Nessun backup dei messaggi su server, nemmeno cifrato con password dell'utente.
- Nessun log lato nodo che associ identificatori tra loro.
- Nessuna dipendenza obbligatoria da servizi Google o Apple per il funzionamento base. Le notifiche push sono un'ottimizzazione, non un requisito.
- Nessuna dichiarazione pubblica di sicurezza non coperta da audit esterno.
- Nessuna implementazione propria di primitive o protocolli crittografici.

## 9. Revisione

Questo documento si rivede:

- prima di iniziare l'implementazione del nucleo crittografico;
- prima della prima release pubblica;
- dopo ogni audit esterno;
- ogni volta che un'ipotesi di fiducia della sezione 6 viene messa in discussione da un fatto nuovo.
