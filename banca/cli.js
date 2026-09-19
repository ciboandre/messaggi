#!/usr/bin/env node
// Il pannello banca della fase di test, dal terminale. Uso:
//
//   node banca/cli.js nuova-frase          le parole in una finestra, mai nel terminale
//   node banca/cli.js genesi [--tetto 4000]
//   node banca/cli.js giorno [AAAA-MM-GG]
//   node banca/cli.js vendita <euro> <coordinate mnt1…> <riferimento pagamento>
//   node banca/cli.js tetto <euro>
//   node banca/cli.js interessi <euro> <da> <a>
//   node banca/cli.js estratto <AAAA-MM> <saldo euro> <hash documento> [nota]
//   node banca/cli.js correzione <hash riga> <euro|-> <motivazione>
//   node banca/cli.js azienda <chiave> <coordinate> <nome>
//   node banca/cli.js giudice <chiave> <versione>
//   node banca/cli.js conversioni            richieste in attesa, con i dati
//   node banca/cli.js esegui <hash>
//   node banca/cli.js pagata <hash> [data]
//   node banca/cli.js stato
//
// Il registro è ledger.jsonl nella cartella corrente (o MANTI_LEDGER).
// La frase la chiede a video senza mostrarla, oppure la legge da
// MANTI_FRASE; mai da un argomento, che finirebbe nella cronologia della
// shell. Dopo ogni riga: git add ledger.jsonl, commit, push. Il sito lo
// rifà l'Action.

import { createInterface } from 'node:readline';
import * as c from './comandi.js';

const [comando, ...args] = process.argv.slice(2);
const percorso = process.env.MANTI_LEDGER ?? 'ledger.jsonl';
const euro = (cent) => (Number(cent) / 100).toFixed(2).replace('.', ',') + ' €';
const manti = (cent) => (Number(cent) / 100).toFixed(2).replace('.', ',') + ' manti';
const prezzo = (dm) => (dm === null ? '—' : (Number(dm) / 10000).toFixed(4).replace('.', ',') + ' €');

function chiediFrase() {
  if (process.env.MANTI_FRASE) return Promise.resolve(process.env.MANTI_FRASE);
  return new Promise((risolvi) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const scrivi = rl._writeToOutput;
    rl.question('Frase della banca (non viene mostrata): ', (r) => { rl._writeToOutput = scrivi; rl.close(); process.stdout.write('\n'); risolvi(r.trim()); });
    rl._writeToOutput = () => {};
  });
}

function fatto(esito) {
  console.log(`riga ${esito.riga.seq} accodata, tipo ${esito.riga.type}, hash ${esito.riga.hash}`);
  console.log('ora: git add ledger.jsonl && git commit -m "Registro: ' + esito.riga.type + ' seq ' + esito.riga.seq + '" && git push');
}

async function main() {
  switch (comando) {
    case 'nuova-frase': {
      // Le parole non passano dal terminale: un terminale può essere
      // registrato, condiviso, o dentro un'app che ne inoltra l'uscita.
      // Su Mac compaiono in una finestra di sistema; altrove in un file
      // leggibile solo dall'utente, da cancellare dopo averle copiate.
      const { frase, pubblica, coordinate } = c.nuovaFrase();
      const testo = 'Scrivi queste dodici parole su carta, nell\'ordine, e controlla di averle copiate giuste. Poi chiudi.\n\n' + frase;
      if (process.platform === 'darwin') {
        const { spawnSync } = await import('node:child_process');
        const esito = spawnSync('osascript', ['-e', 'display dialog (item 1 of argv) with title "Frase della banca" buttons {"Ho copiato le parole"} default button 1', frase.length ? testo : ''], { stdio: ['ignore', 'ignore', 'ignore'] });
        if (esito.status !== 0) { console.error('la finestra non si è aperta; riprova, o usa MANTI_FRASE_FILE=percorso per scriverla in un file'); process.exitCode = 1; return; }
        console.log('Le parole sono comparse in una finestra a parte e non sono state stampate qui.');
      } else {
        const { writeFileSync } = await import('node:fs');
        const percorsoFrase = process.env.MANTI_FRASE_FILE ?? 'frase-banca.txt';
        writeFileSync(percorsoFrase, testo + '\n', { mode: 0o600 });
        console.log(`Le parole sono in ${percorsoFrase} (leggibile solo da te). Copiale su carta e poi cancellalo: rm ${percorsoFrase}`);
      }
      console.log('chiave pubblica della banca: ' + pubblica);
      console.log('coordinate della banca:      ' + coordinate);
      return;
    }
    case 'stato': {
      const s = c.stato(percorso);
      console.log(`${s.righe} righe, giorno ${s.giorno ?? '—'}`);
      console.log(`valore ${prezzo(s.valore)} · compri a ${prezzo(s.prezzo_acquisto)} · converti a ${prezzo(s.prezzo_conversione)}`);
      console.log(`riserva ${euro(s.riserva_cent)} · tetto ${euro(s.tetto_cent)} · spazio ${euro(s.spazio_cent)} · in circolazione ${manti(s.circolazione_cent)}`);
      if (s.in_attesa) console.log(`${s.in_attesa} richieste di conversione in attesa: node banca/cli.js conversioni`);
      return;
    }
  }
  const frase = await chiediFrase();
  switch (comando) {
    case 'genesi': {
      const t = args.indexOf('--tetto');
      fatto(c.genesi(percorso, frase, t >= 0 ? { tetto_cent: c.centesimiDa(args[t + 1]) } : {}));
      return;
    }
    case 'giorno': return fatto(c.giorno(percorso, frase, args[0]));
    case 'vendita': {
      const e = c.vendita(percorso, frase, args[0], args[1], args[2]);
      console.log(`venduti ${manti(e.manti)} a ${prezzo(e.prezzo)}`);
      return fatto(e);
    }
    case 'tetto': return fatto(c.tetto(percorso, frase, args[0]));
    case 'interessi': return fatto(c.interessi(percorso, frase, args[0], args[1], args[2]));
    case 'estratto': return fatto(c.estratto(percorso, frase, args[0], args[1], args[2], args[3]));
    case 'correzione': return fatto(c.correzione(percorso, frase, args[0], args[1] === '-' ? null : args[1], args.slice(2).join(' ')));
    case 'azienda': return fatto(c.azienda(percorso, frase, args[0], args[1], args.slice(2).join(' ')));
    case 'giudice': return fatto(c.giudice(percorso, frase, args[0], args[1]));
    case 'conversioni': {
      const lista = c.conversioniInAttesa(percorso, frase);
      if (!lista.length) { console.log('nessuna richiesta in attesa'); return; }
      for (const r of lista) console.log(`${r.hash}\n  riga ${r.seq} · ${manti(r.amount)} → ${r.euro === null ? '—' : euro(r.euro)} oggi\n  dati: ${r.dati ?? '(non leggibili con questa frase)'}`);
      return;
    }
    case 'esegui': {
      const e = c.esegui(percorso, frase, args[0]);
      console.log(`da pagare: ${euro(e.euro)} a ${prezzo(e.prezzo)}`);
      return fatto(e);
    }
    case 'pagata': return fatto(c.pagata(percorso, frase, args[0], args[1]));
    default:
      console.error('comando sconosciuto; vedi l\'intestazione di banca/cli.js');
      process.exitCode = 2;
  }
}

main().catch((e) => { console.error('errore: ' + e.message); process.exitCode = 1; });
