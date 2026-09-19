// Lato portafoglio: trovare le proprie entrate nel registro e costruire un
// pagamento. È il codice che girerà nell'app; il registro non lo usa.

import { firmaScalare } from './chiavi.js';
import { chiaveCausale, creaIndirizzo, riconosci } from './portafoglio.js';
import { cifraCausale, decifraCausale } from './causale.js';

/**
 * @typedef {object} EntrataMia
 * @property {string} ref       "hash:indice"
 * @property {string} addr
 * @property {number} amount
 * @property {bigint} p         chiave privata dell'indirizzo
 * @property {bigint} k         segreto condiviso (per la causale)
 * @property {string | null} causale
 * @property {string} [tag]
 * @property {number} seq       riga che l'ha creata
 */

/**
 * Scorre il registro e restituisce le uscite non spese che appartengono al
 * portafoglio, con la chiave per spenderle e la causale decifrata.
 * @param {import('./registro.js').Registro} registro
 * @param {import('./portafoglio.js').Portafoglio} portafoglio
 * @returns {EntrataMia[]}
 */
export function mieEntrate(registro, portafoglio) {
  const nonSpese = /** @type {Record<string, any>} */ (registro.stato.non_spese ?? {});
  /** @type {EntrataMia[]} */
  const mie = [];
  for (const riga of registro.righe) {
    const out = /** @type {any} */ (riga.body).out;
    if (!Array.isArray(out)) continue;
    for (const [i, u] of out.entries()) {
      if (u.addr === null) continue;
      const ref = `${riga.hash}:${i}`;
      if (!nonSpese[ref]) continue;
      const r = riconosci(u, portafoglio);
      if (!r) continue;
      mie.push({
        ref, addr: u.addr, amount: u.amount, p: r.p, k: r.k, seq: riga.seq,
        causale: u.memo ? decifraCausale(chiaveCausale(r.k), u.memo) : null,
        ...(u.tag ? { tag: u.tag } : {}),
      });
    }
  }
  return mie;
}

/**
 * Saldo: somma delle proprie entrate non spese.
 * @param {EntrataMia[]} entrate
 * @returns {number}
 */
export function saldo(entrate) {
  return entrate.reduce((s, e) => s + e.amount, 0);
}

/**
 * Sceglie le entrate da spendere per coprire un totale: prima le più grandi.
 * @param {EntrataMia[]} entrate
 * @param {number} totale
 * @returns {EntrataMia[]}
 */
export function scegliEntrate(entrate, totale) {
  const ordinate = [...entrate].sort((a, b) => b.amount - a.amount);
  const scelte = [];
  let somma = 0;
  for (const e of ordinate) {
    if (somma >= totale) break;
    scelte.push(e);
    somma += e.amount;
  }
  if (somma < totale) throw new Error(`saldo insufficiente: ${somma} < ${totale}`);
  return scelte;
}

/**
 * @typedef {object} Destinazione
 * @property {string} coordinate
 * @property {number} amount
 * @property {string} [causale]
 * @property {string} [tag]
 */

/**
 * Costruisce il body di un `transfer` e i firmatari. Le entrate vengono
 * scelte tra quelle disponibili; il resto torna al portafoglio su un
 * indirizzo nuovo. Le causali sono cifrate per ciascun destinatario.
 * @param {object} p
 * @param {import('./portafoglio.js').Portafoglio} p.portafoglio
 * @param {EntrataMia[]} p.disponibili
 * @param {Destinazione[]} p.destinazioni
 * @param {Array<{ amount: number, reason: string }>} [p.bruciature]
 * @param {string | null} [p.ref]
 * @returns {{ body: Record<string, unknown>, firmatari: Array<{ by: string, firma: (h: string) => string }> }}
 */
export function costruisciPagamento({ portafoglio, disponibili, destinazioni, bruciature = [], ref = null }) {
  if (!destinazioni.length && !bruciature.length) throw new Error('niente da pagare');
  const totale = destinazioni.reduce((s, d) => s + d.amount, 0) + bruciature.reduce((s, b) => s + b.amount, 0);
  const entrate = scegliEntrate(disponibili, totale);
  const somma = saldo(entrate);

  const out = [];
  for (const d of destinazioni) {
    if (!Number.isInteger(d.amount) || d.amount <= 0) throw new Error('importo non valido');
    const ind = creaIndirizzo(d.coordinate);
    out.push({
      addr: ind.addr, eph: ind.eph, amount: d.amount,
      ...(d.causale ? { memo: cifraCausale(chiaveCausale(ind.k), d.causale) } : {}),
      ...(d.tag ? { tag: d.tag } : {}),
    });
  }
  for (const b of bruciature) out.push({ addr: null, amount: b.amount, reason: b.reason });
  const resto = somma - totale;
  if (resto > 0) {
    const mio = creaIndirizzo(portafoglio.coordinate);
    out.push({ addr: mio.addr, eph: mio.eph, amount: resto });
  }

  const body = { in: entrate.map((e) => e.ref), out, ref };
  const firmatari = [];
  const visti = new Set();
  for (const e of entrate) {
    if (visti.has(e.addr)) continue;
    visti.add(e.addr);
    firmatari.push({ by: e.addr, firma: (/** @type {string} */ h) => firmaScalare(e.p, h) });
  }
  return { body, firmatari };
}
