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
//   node banca/cli.js giudice <chiave> <coordinate> <versione>
//   node banca/cli.js conversioni            richieste in attesa, con i dati
//   node banca/cli.js esegui <hash>
//   node banca/cli.js pagata <hash> [data]
//   node banca/cli.js stato
//
// Il registro è ledger.jsonl nella cartella corrente (o MANTI_LEDGER); con
// MANTI_SERVER=http://… le righe vanno al server della banca (fase C).
// La frase la chiede a video senza mostrarla, oppure la legge da
// MANTI_FRASE; mai da un argomento, che finirebbe nella cronologia della
// shell. Dopo ogni riga: git add ledger.jsonl, commit, push. Il sito lo
// rifà l'Action.

import * as c from './comandi.js';
import { chiediFrase, mostraFrase, euro, manti, prezzo, fatto as fattoRiga } from '../strumenti/terminale.js';

const [comando, ...args] = process.argv.slice(2);
const percorso = process.env.MANTI_SERVER ? { server: process.env.MANTI_SERVER } : (process.env.MANTI_LEDGER ?? 'ledger.jsonl');
const fatto = (esito) => fattoRiga(esito.riga);

async function main() {
  switch (comando) {
    case 'nuova-frase': {
      const { frase, pubblica, coordinate } = c.nuovaFrase();
      console.log(mostraFrase(frase, 'Frase della banca'));
      console.log('chiave pubblica della banca: ' + pubblica);
      console.log('coordinate della banca:      ' + coordinate);
      return;
    }
    case 'stato': {
      const s = await c.stato(percorso);
      console.log(`${s.righe} righe, giorno ${s.giorno ?? '—'}`);
      console.log(`valore ${prezzo(s.valore)} · compri a ${prezzo(s.prezzo_acquisto)} · converti a ${prezzo(s.prezzo_conversione)}`);
      console.log(`riserva ${euro(s.riserva_cent)} · tetto ${euro(s.tetto_cent)} · spazio ${euro(s.spazio_cent)} · in circolazione ${manti(s.circolazione_cent)}`);
      if (s.in_attesa) console.log(`${s.in_attesa} richieste di conversione in attesa: node banca/cli.js conversioni`);
      return;
    }
  }
  const frase = await chiediFrase('Frase della banca');
  switch (comando) {
    case 'genesi': {
      const t = args.indexOf('--tetto');
      fatto(await c.genesi(percorso, frase, t >= 0 ? { tetto_cent: c.centesimiDa(args[t + 1]) } : {}));
      return;
    }
    case 'giorno': return fatto(await c.giorno(percorso, frase, args[0]));
    case 'vendita': {
      const e = await c.vendita(percorso, frase, args[0], args[1], args[2]);
      console.log(`venduti ${manti(e.manti)} a ${prezzo(e.prezzo)}`);
      return fatto(e);
    }
    case 'tetto': return fatto(await c.tetto(percorso, frase, args[0]));
    case 'interessi': return fatto(await c.interessi(percorso, frase, args[0], args[1], args[2]));
    case 'estratto': return fatto(await c.estratto(percorso, frase, args[0], args[1], args[2], args[3]));
    case 'correzione': return fatto(await c.correzione(percorso, frase, args[0], args[1] === '-' ? null : args[1], args.slice(2).join(' ')));
    case 'azienda': return fatto(await c.azienda(percorso, frase, args[0], args[1], args.slice(2).join(' ')));
    case 'giudice': return fatto(await c.giudice(percorso, frase, args[0], args[1], args[2]));
    case 'conversioni': {
      const lista = await c.conversioniInAttesa(percorso, frase);
      if (!lista.length) { console.log('nessuna richiesta in attesa'); return; }
      for (const r of lista) console.log(`${r.hash}\n  riga ${r.seq} · ${manti(r.amount)} → ${r.euro === null ? '—' : euro(r.euro)} oggi\n  dati: ${r.dati ?? '(non leggibili con questa frase)'}`);
      return;
    }
    case 'esegui': {
      const e = await c.esegui(percorso, frase, args[0]);
      console.log(`da pagare: ${euro(e.euro)} a ${prezzo(e.prezzo)}`);
      return fatto(e);
    }
    case 'pagata': return fatto(await c.pagata(percorso, frase, args[0], args[1]));
    default:
      console.error('comando sconosciuto; vedi l\'intestazione di banca/cli.js');
      process.exitCode = 2;
  }
}

main().catch((e) => { console.error('errore: ' + e.message); process.exitCode = 1; });
