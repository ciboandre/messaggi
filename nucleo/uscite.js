// Uscite ed entrate (ARCHITETTURA.md, sezione 6) e il tipo `transfer`.
//
// Il registro non ha conti: ha uscite ferme su indirizzi usa e getta. Ogni
// uscita è identificata da "hash della riga che l'ha creata:indice". Un
// movimento consuma uscite per intero (le entrate) e ne crea di nuove.
// Un'uscita con addr null è una bruciatura: manti che escono per sempre.
//
// Lo stato tiene:
//   non_spese:         { ref → { addr, amount } }
//   circolazione_cent: somma delle non spese
//   bruciati_cent:     somma delle bruciature
//   emessi_cent:       somma di tutto ciò che è stato creato da chi può crearlo
//
// Chi crea manti dal nulla (la vendita, al passo 8) chiama `creaUscite` con
// `nuovi = true`. Un `transfer` non può: entra tanto quanto esce.

import { ed25519 } from '@noble/curves/ed25519.js';
import { formaCausaleValida } from './causale.js';

const RE_HEX64 = /^[0-9a-f]{64}$/;
const RE_REF = /^[0-9a-f]{64}:\d+$/;
export const REASON_MAX = 64;
export const TAG_MAX = 64;

/**
 * @typedef {object} Uscita
 * @property {string | null} addr   indirizzo usa e getta; null = bruciatura
 * @property {string} [eph]         R, obbligatorio se addr non è null
 * @property {number} amount        centesimi di manto, > 0
 * @property {string} [memo]        causale cifrata, base64
 * @property {string} [tag]         solo per chi crea manti o paga stipendi e premi
 * @property {string} [reason]      solo per le bruciature
 */

/**
 * Controlla la forma di una lista di uscite. Lancia con il motivo.
 * @param {unknown} out
 * @param {{ tagAmmessi?: boolean }} [opz]
 * @returns {Uscita[]}
 */
export function controllaUscite(out, opz = {}) {
  if (!Array.isArray(out) || out.length === 0) throw new Error('nessuna uscita');
  if (out.length > 64) throw new Error('troppe uscite in una riga');
  for (const [i, u] of out.entries()) {
    const dove = `uscita ${i}`;
    if (!u || typeof u !== 'object') throw new Error(`${dove}: malformata`);
    if (!Number.isInteger(u.amount) || u.amount <= 0) throw new Error(`${dove}: importo non valido`);
    const chiavi = new Set(Object.keys(u));
    if (u.addr === null) {
      if (u.eph !== undefined || u.memo !== undefined || u.tag !== undefined) throw new Error(`${dove}: una bruciatura ha solo amount e reason`);
      if (typeof u.reason !== 'string' || !u.reason || u.reason.length > REASON_MAX) throw new Error(`${dove}: bruciatura senza motivo`);
      chiavi.delete('addr'); chiavi.delete('amount'); chiavi.delete('reason');
    } else {
      if (typeof u.addr !== 'string' || !RE_HEX64.test(u.addr) || !puntoValido(u.addr)) throw new Error(`${dove}: indirizzo non valido`);
      if (typeof u.eph !== 'string' || !RE_HEX64.test(u.eph) || !puntoValido(u.eph)) throw new Error(`${dove}: eph non valido`);
      if (u.memo !== undefined && !formaCausaleValida(u.memo)) throw new Error(`${dove}: causale malformata`);
      if (u.reason !== undefined) throw new Error(`${dove}: reason solo sulle bruciature`);
      if (u.tag !== undefined) {
        if (!opz.tagAmmessi) throw new Error(`${dove}: tag non ammesso in questo tipo di riga`);
        if (typeof u.tag !== 'string' || !u.tag || u.tag.length > TAG_MAX) throw new Error(`${dove}: tag non valido`);
      }
      for (const k of ['addr', 'eph', 'amount', 'memo', 'tag']) chiavi.delete(k);
    }
    if (chiavi.size) throw new Error(`${dove}: campi sconosciuti ${[...chiavi].join(', ')}`);
  }
  return /** @type {Uscita[]} */ (out);
}

/**
 * Somma degli importi.
 * @param {Uscita[]} out
 * @returns {number}
 */
export function sommaUscite(out) {
  return out.reduce((s, u) => s + u.amount, 0);
}

/**
 * Registra nello stato le uscite create da una riga. `nuovi` è vero solo
 * quando i manti vengono creati (vendita), mai in un transfer.
 * @param {Record<string, any>} stato
 * @param {string} hashRiga
 * @param {Uscita[]} out
 * @param {{ nuovi?: boolean }} [opz]
 */
export function creaUscite(stato, hashRiga, out, opz = {}) {
  stato.non_spese ??= {};
  stato.circolazione_cent ??= 0;
  stato.bruciati_cent ??= 0;
  stato.emessi_cent ??= 0;
  for (const [i, u] of out.entries()) {
    if (u.addr === null) {
      stato.bruciati_cent += u.amount;
      continue;
    }
    stato.non_spese[`${hashRiga}:${i}`] = { addr: u.addr, amount: u.amount };
    stato.circolazione_cent += u.amount;
  }
  if (opz.nuovi) stato.emessi_cent += sommaUscite(out);
}

/**
 * Consuma le entrate indicate: devono esistere, non essere già spese, non
 * ripetersi. Restituisce importo totale e indirizzi che devono firmare.
 * @param {Record<string, any>} stato
 * @param {unknown} refs
 * @returns {{ totale: number, firmatari: string[] }}
 */
export function consumaEntrate(stato, refs) {
  if (!Array.isArray(refs) || refs.length === 0) throw new Error('nessuna entrata');
  if (refs.length > 64) throw new Error('troppe entrate in una riga');
  const nonSpese = stato.non_spese ?? {};
  const visti = new Set();
  const firmatari = new Set();
  let totale = 0;
  for (const ref of refs) {
    if (typeof ref !== 'string' || !RE_REF.test(ref)) throw new Error(`entrata malformata: ${String(ref).slice(0, 20)}`);
    if (visti.has(ref)) throw new Error(`entrata ripetuta: ${ref.slice(0, 12)}`);
    visti.add(ref);
    const u = nonSpese[ref];
    if (!u) throw new Error(`entrata inesistente o già spesa: ${ref.slice(0, 12)}`);
    totale += u.amount;
    firmatari.add(u.addr);
  }
  for (const ref of visti) {
    stato.circolazione_cent -= nonSpese[ref].amount;
    delete nonSpese[ref];
  }
  return { totale, firmatari: [...firmatari] };
}

/**
 * Regola del tipo `transfer`: entrate consumate = uscite create + bruciature.
 * Firmano le chiavi usa e getta delle entrate. `ref` è per ora solo un
 * campo facoltativo (null o stringa): la regola che lo lega a un verbale
 * arriva con le multe.
 * @type {import('./registro.js').RegolaTipo}
 */
export function regolaTransfer(riga, stato) {
  const b = /** @type {any} */ (riga.body);
  const chiavi = Object.keys(b).filter((k) => !['in', 'out', 'ref'].includes(k));
  if (chiavi.length) throw new Error(`transfer: campi sconosciuti ${chiavi.join(', ')}`);
  if (b.ref !== undefined && b.ref !== null && typeof b.ref !== 'string') throw new Error('transfer: ref non valido');
  const out = controllaUscite(b.out);
  const { totale, firmatari } = consumaEntrate(stato, b.in);
  if (sommaUscite(out) !== totale) throw new Error(`transfer: entrate ${totale} ≠ uscite ${sommaUscite(out)}`);
  creaUscite(stato, riga.hash, out);
  return firmatari;
}

/** @param {string} hex */
function puntoValido(hex) {
  try {
    ed25519.Point.fromHex(hex);
    return true;
  } catch {
    return false;
  }
}
