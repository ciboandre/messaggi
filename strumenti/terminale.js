// Cose comuni ai programmi da terminale: chiedere una frase senza
// mostrarla, mostrarne una nuova senza stamparla, formattare i numeri.

import { createInterface } from 'node:readline';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

/**
 * La frase da MANTI_FRASE, o chiesta a video senza eco. Mai da argomento.
 * @param {string} chi
 * @returns {Promise<string>}
 */
export function chiediFrase(chi = 'Frase') {
  if (process.env.MANTI_FRASE) return Promise.resolve(process.env.MANTI_FRASE);
  return new Promise((risolvi) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const scrivi = rl._writeToOutput;
    rl.question(`${chi} (non viene mostrata): `, (r) => { rl._writeToOutput = scrivi; rl.close(); process.stdout.write('\n'); risolvi(r.trim()); });
    rl._writeToOutput = () => {};
  });
}

/**
 * Mostra una frase nuova senza stamparla nel terminale: un terminale può
 * essere registrato, condiviso, o dentro un'app che ne inoltra l'uscita.
 * Su Mac una finestra di sistema; altrove un file 0600 da cancellare.
 * @param {string} frase
 * @param {string} titolo
 * @returns {string} cosa dire a video
 */
export function mostraFrase(frase, titolo) {
  const testo = 'Scrivi queste dodici parole su carta, nell\'ordine, e controlla di averle copiate giuste. Poi chiudi.\n\n' + frase;
  if (process.platform === 'darwin') {
    const script = `on run argv\n display dialog (item 1 of argv) with title "${titolo}" buttons {"Ho copiato le parole"} default button 1\nend run`;
    const esito = spawnSync('osascript', ['-e', script, testo], { stdio: ['ignore', 'ignore', 'ignore'] });
    if (esito.status !== 0) throw new Error('la finestra non si è aperta; riprova, o usa MANTI_FRASE_FILE=percorso per scriverla in un file');
    return 'Le parole sono comparse in una finestra a parte e non sono state stampate qui.';
  }
  const percorso = process.env.MANTI_FRASE_FILE ?? 'frase.txt';
  writeFileSync(percorso, testo + '\n', { mode: 0o600 });
  return `Le parole sono in ${percorso} (leggibile solo da te). Copiale su carta e poi cancellalo: rm ${percorso}`;
}

export const euro = (cent) => (Number(cent) / 100).toFixed(2).replace('.', ',') + ' €';
export const manti = (cent) => (Number(cent) / 100).toFixed(2).replace('.', ',') + ' manti';
export const prezzo = (dm) => (dm === null || dm === undefined ? '—' : (Number(dm) / 10000).toFixed(4).replace('.', ',') + ' €');

/** Dopo una riga accodata: cosa fare. */
export function fatto(riga) {
  console.log(`riga ${riga.seq} accodata, tipo ${riga.type}, hash ${riga.hash}`);
  console.log(`ora: git add ledger.jsonl && git commit -m "Registro: ${riga.type} seq ${riga.seq}" && git push`);
}
