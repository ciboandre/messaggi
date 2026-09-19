#!/usr/bin/env node
// Il conto di prova dal terminale, prima dell'app. Uso:
//
//   node correntista/cli.js nuovo                  dodici parole in una finestra, coordinate a video
//   node correntista/cli.js coordinate             le tue coordinate, da dare a chi ti paga
//   node correntista/cli.js saldo
//   node correntista/cli.js paga <importo> <coordinate mnt1…> [causale]
//   node correntista/cli.js converti <importo> "<nome e IBAN per la banca>"
//
// Il registro è ledger.jsonl nella cartella corrente (o MANTI_LEDGER), o il
// server con MANTI_SERVER=http://…. La
// frase la chiede a video senza mostrarla, o la legge da MANTI_FRASE.
// Dopo un pagamento o una richiesta: git add ledger.jsonl, commit, push.

import * as c from './comandi.js';
import { chiediFrase, mostraFrase, euro, manti, prezzo, fatto } from '../strumenti/terminale.js';

const [comando, ...args] = process.argv.slice(2);
const percorso = process.env.MANTI_SERVER ? { server: process.env.MANTI_SERVER } : (process.env.MANTI_LEDGER ?? 'ledger.jsonl');

async function main() {
  if (comando === 'nuovo') {
    const { frase, coordinate } = c.nuovo();
    console.log(mostraFrase(frase, 'Le tue dodici parole'));
    console.log('le tue coordinate (pubbliche, dalle a chi ti paga):\n' + coordinate);
    return;
  }
  const frase = await chiediFrase('Le tue dodici parole');
  switch (comando) {
    case 'coordinate': console.log(c.coordinate(frase)); return;
    case 'saldo': {
      const s = await c.saldo(percorso, frase);
      console.log(`saldo ${manti(s.totale)}${s.in_euro === null ? '' : ` ≈ ${euro(s.in_euro)} al valore di oggi (${prezzo(s.valore)})`}`);
      for (const e of s.entrate) console.log(`  riga ${e.seq}: ${manti(e.amount)}${e.tag ? ` [${e.tag}]` : ''}${e.causale ? ` "${e.causale}"` : ''}${e.chiaro ? ' (in chiaro)' : ''}`);
      return;
    }
    case 'paga': {
      const e = await c.paga(percorso, frase, args[0], args[1], args.slice(2).join(' ') || undefined);
      console.log(`resto sul conto: ${manti(e.resto)}`);
      return fatto(e.riga);
    }
    case 'converti': {
      const e = await c.converti(percorso, frase, args[0], args.slice(1).join(' '));
      console.log(`richiesta inviata: ${e.euro_oggi === null ? '' : `oggi varrebbe ${euro(e.euro_oggi)}; `}la banca esegue al prezzo del giorno in cui paga`);
      return fatto(e.riga);
    }
    default:
      console.error('comando sconosciuto; vedi l\'intestazione di correntista/cli.js');
      process.exitCode = 2;
  }
}

main().catch((e) => { console.error('errore: ' + e.message); process.exitCode = 1; });
