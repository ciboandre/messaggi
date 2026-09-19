// Uscite ed entrate in chiaro (ARCHITETTURA.md, sezione 6).
//
// Il registro non ha conti: ha uscite ferme su indirizzi usa e getta. Ogni
// uscita è identificata da "hash della riga che l'ha creata:indice". Un
// movimento consuma uscite per intero (le entrate) e ne crea di nuove.
// Un'uscita con addr null è una bruciatura: manti che escono per sempre.
//
// Qui c'è la parte in chiaro: importi visibili, entrate dichiarate. È il
// modo di spendere dei ruoli. Le uscite riservate e le entrate in anello
// dei correntisti sono in trasferimento.js, sopra questo stato.
//
// Lo stato tiene:
//   uscite:            { ref → { ordine, addr, commit, amount, spesa } }
//                      tutte, mai cancellate: servono da esche. `amount` è
//                      null per le riservate; `spesa` è vero solo per quelle
//                      spese in chiaro, che escono dagli anelli futuri
//   immagini:          { immagine di chiave → ref della riga che l'ha spesa }
//   circolazione_cent: emessi − bruciati. Non è la somma delle uscite,
//                      perché gli importi riservati non si leggono
//   bruciati_cent:     somma delle bruciature
//   emessi_cent:       somma di tutto ciò che è stato creato da chi può crearlo
// Le somme nello stato sono BigInt; gli importi nelle righe sono interi JSON.
//
// Chi crea manti dal nulla (la vendita) chiama `creaUscite` con
// `nuovi = true`. Una spesa non può: entra tanto quanto esce.

import { ed25519 } from '@noble/curves/ed25519.js';
import { formaCausaleValida } from './causale.js';
import { impegnoInChiaro } from './impegni.js';

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
  preparaStato(stato);
  for (const [i, u] of out.entries()) {
    if (u.addr === null) {
      stato.bruciati_cent += BigInt(u.amount);
      stato.circolazione_cent -= BigInt(u.amount);
      continue;
    }
    registraUscita(stato, `${hashRiga}:${i}`, { addr: u.addr, commit: impegnoInChiaro(u.amount), amount: u.amount });
  }
  if (opz.nuovi) {
    stato.emessi_cent += BigInt(sommaUscite(out));
    stato.circolazione_cent += BigInt(sommaUscite(out));
  }
}

/**
 * Lo stato delle uscite, con i campi al loro posto.
 * @param {Record<string, any>} stato
 */
export function preparaStato(stato) {
  stato.uscite ??= {};
  stato.immagini ??= {};
  stato.ordine_uscite ??= 0;
  stato.disponibili ??= 0; // uscite mai spese in chiaro: le esche possibili
  stato.circolazione_cent ??= 0n;
  stato.bruciati_cent ??= 0n;
  stato.emessi_cent ??= 0n;
}

/**
 * Registra un'uscita, in chiaro (amount) o riservata (amount null).
 * @param {Record<string, any>} stato
 * @param {string} ref
 * @param {{ addr: string, commit: string, amount: number | null }} u
 */
export function registraUscita(stato, ref, u) {
  stato.uscite[ref] = { ordine: stato.ordine_uscite++, addr: u.addr, commit: u.commit, amount: u.amount, spesa: false };
  stato.disponibili++;
}

/**
 * Consuma in chiaro le entrate indicate: devono esistere, essere in chiaro,
 * non essere già spese, non ripetersi. Restituisce importo totale e
 * indirizzi che devono firmare. Le uscite restano nello stato, segnate
 * spese: da qui in poi non valgono come esche.
 * @param {Record<string, any>} stato
 * @param {unknown} refs
 * @returns {{ totale: number, firmatari: string[] }}
 */
export function consumaEntrate(stato, refs) {
  if (!Array.isArray(refs) || refs.length === 0) throw new Error('nessuna entrata');
  if (refs.length > 64) throw new Error('troppe entrate in una riga');
  preparaStato(stato);
  const visti = new Set();
  const firmatari = new Set();
  let totale = 0;
  for (const ref of refs) {
    if (typeof ref !== 'string' || !RE_REF.test(ref)) throw new Error(`entrata malformata: ${String(ref).slice(0, 20)}`);
    if (visti.has(ref)) throw new Error(`entrata ripetuta: ${ref.slice(0, 12)}`);
    visti.add(ref);
    const u = stato.uscite[ref];
    if (!u || u.spesa) throw new Error(`entrata inesistente o già spesa: ${ref.slice(0, 12)}`);
    if (u.amount === null) throw new Error(`entrata riservata, non si spende in chiaro: ${ref.slice(0, 12)}`);
    totale += u.amount;
    firmatari.add(u.addr);
  }
  for (const ref of visti) {
    stato.uscite[ref].spesa = true;
    stato.disponibili--;
  }
  return { totale, firmatari: [...firmatari] };
}

/**
 * Regola di una spesa in chiaro: entrate consumate = uscite create +
 * bruciature. Firmano le chiavi usa e getta delle entrate. È il modo di
 * spendere dei ruoli (`payout`); il `transfer` dei correntisti è in
 * trasferimento.js. `ref` è per ora solo un campo facoltativo (null o
 * stringa): la regola che lo lega a un verbale arriva con le multe.
 * @type {import('./registro.js').RegolaTipo}
 */
export function regolaSpesaInChiaro(riga, stato) {
  const b = /** @type {any} */ (riga.body);
  const chiavi = Object.keys(b).filter((k) => !['in', 'out', 'ref'].includes(k));
  if (chiavi.length) throw new Error(`spesa: campi sconosciuti ${chiavi.join(', ')}`);
  if (b.ref !== undefined && b.ref !== null && typeof b.ref !== 'string') throw new Error('spesa: ref non valido');
  const out = controllaUscite(b.out);
  const { totale, firmatari } = consumaEntrate(stato, b.in);
  if (sommaUscite(out) !== totale) throw new Error(`spesa: entrate ${totale} ≠ uscite ${sommaUscite(out)}`);
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
