// Lettura e scrittura del registro su file JSONL: una riga per transazione.
// Solo Node. Il resto del nucleo non tocca il disco.

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { canonico } from './canonico.js';
import { Registro } from './registro.js';
import { righeDaJsonl } from './registro-file-browser.js';

export { righeDaJsonl };

/**
 * Serializza una riga come una linea JSON canonica.
 * @param {import('./registro.js').Riga} riga
 * @returns {string}
 */
export function rigaAJsonl(riga) {
  return canonico(riga) + '\n';
}

/**
 * Apre (o crea vuoto) un registro da file, verificandolo da capo.
 * @param {string} percorso
 * @param {import('./registro.js').Opzioni} opzioni
 * @returns {Registro}
 */
export function apriRegistro(percorso, opzioni) {
  if (!existsSync(percorso)) writeFileSync(percorso, '');
  return Registro.daRighe(righeDaJsonl(readFileSync(percorso, 'utf8')), opzioni);
}

/**
 * Accoda una riga al registro in memoria e, solo se valida, al file.
 * @param {Registro} registro
 * @param {string} percorso
 * @param {import('./registro.js').Riga} riga
 */
export function accodaSuFile(registro, percorso, riga) {
  registro.accoda(riga);
  appendFileSync(percorso, rigaAJsonl(riga));
}
