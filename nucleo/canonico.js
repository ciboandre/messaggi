// Serializzazione canonica e hash.
//
// Due programmi diversi devono produrre lo stesso hash dallo stesso contenuto
// (ARCHITETTURA.md, sezione 7). Per questo il JSON è canonico: chiavi in
// ordine alfabetico a ogni livello, nessuno spazio, UTF-8, e nessun valore
// che JSON non sappia rappresentare in modo univoco.

import { createHash } from 'node:crypto';

/**
 * Serializza un valore in JSON canonico.
 * @param {unknown} valore
 * @returns {string}
 */
export function canonico(valore) {
  return JSON.stringify(normalizza(valore, ''));
}

/**
 * Riordina le chiavi ricorsivamente e rifiuta ciò che non è rappresentabile.
 * @param {unknown} v
 * @param {string} percorso
 * @returns {unknown}
 */
function normalizza(v, percorso) {
  if (v === null) return null;
  const tipo = typeof v;
  if (tipo === 'string' || tipo === 'boolean') return v;
  if (tipo === 'number') {
    if (!Number.isFinite(v)) throw new TypeError(`numero non finito in ${percorso || 'radice'}`);
    if (!Number.isInteger(v)) throw new TypeError(`numero non intero in ${percorso || 'radice'}: le quantità sono interi`);
    return v;
  }
  if (tipo === 'undefined') throw new TypeError(`undefined in ${percorso || 'radice'}`);
  if (tipo === 'bigint' || tipo === 'function' || tipo === 'symbol') {
    throw new TypeError(`${tipo} non rappresentabile in ${percorso || 'radice'}`);
  }
  if (Array.isArray(v)) return v.map((x, i) => normalizza(x, `${percorso}[${i}]`));
  if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) {
    throw new TypeError(`oggetto non semplice in ${percorso || 'radice'}`);
  }
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const k of Object.keys(v).sort()) {
    out[k] = normalizza(/** @type {Record<string, unknown>} */ (v)[k], percorso ? `${percorso}.${k}` : k);
  }
  return out;
}

/**
 * SHA-256 di una stringa (UTF-8) o di byte, in esadecimale minuscolo.
 * @param {string | Uint8Array} dati
 * @returns {string}
 */
export function sha256(dati) {
  return createHash('sha256').update(dati).digest('hex');
}

/**
 * Hash di un valore qualsiasi tramite la sua forma canonica.
 * @param {unknown} valore
 * @returns {string}
 */
export function hashCanonico(valore) {
  return sha256(canonico(valore));
}
