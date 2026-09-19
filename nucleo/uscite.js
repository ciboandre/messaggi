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
// Un ruolo può spendere in chiaro anche un'uscita riservata che ha
// ricevuto (un'azienda che incassa): la **rivela**. L'entrata diventa
// { ref, amount, mask, img } e la riga porta una firma ad anello di uno su
// quell'uscita. Il registro ricalcola l'impegno dall'uscita che ha in
// stato, non da niente che porti la riga; controlla l'immagine di chiave
// nei due versi (non già spesa in anello; e da qui in poi spesa, così
// nessun anello futuro la può spendere); verifica la firma. L'anello di
// uno è degenere — il registro sa già importo e maschera — ma con
// pseudo-impegno a·H prova che chi firma conosce la chiave dell'indirizzo
// e la maschera, con lo stesso codice del transfer. Rivelare la maschera
// lega quell'uscita per sempre al conto in chiaro: l'app deve dirlo.
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
import { impegno, impegnoInChiaro } from './impegni.js';
import { verificaAnello } from './anello.js';

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
 * @property {string} [voce]        codice del catalogo, solo sui premi
 * @property {string} [reason]      solo per le bruciature
 */

/**
 * Controlla la forma di una lista di uscite. Lancia con il motivo.
 * @param {unknown} out
 * @param {{ tagAmmessi?: boolean, voceAmmessa?: boolean }} [opz]
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
      if (u.voce !== undefined) {
        if (!opz.voceAmmessa) throw new Error(`${dove}: voce non ammessa in questo tipo di riga`);
        if (typeof u.voce !== 'string' || !u.voce) throw new Error(`${dove}: voce non valida`);
      }
      for (const k of ['addr', 'eph', 'amount', 'memo', 'tag', 'voce']) chiavi.delete(k);
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
 * @typedef {object} Rivelazione
 * @property {string} ref
 * @property {number} amount   importo rivelato
 * @property {string} mask     maschera rivelata, 32 byte little-endian esadecimali
 * @property {string} img      immagine di chiave dell'indirizzo
 */

const RE_HEX = /^[0-9a-f]{64}$/;
const ORDINE = ed25519.Point.Fn.ORDER;

/**
 * Consuma in chiaro le entrate indicate: riferimenti a uscite in chiaro, o
 * rivelazioni di uscite riservate. Devono esistere, non essere già spese,
 * non ripetersi. Restituisce importo totale, indirizzi che devono firmare
 * (Ed25519, per le uscite in chiaro) e immagini che devono firmare (anello
 * di uno, per le rivelate). Le uscite restano nello stato, segnate spese:
 * da qui in poi non valgono come esche.
 * @param {Record<string, any>} stato
 * @param {unknown} entrate
 * @param {import('./registro.js').Riga} riga   per verificare le firme ad anello delle rivelazioni
 * @returns {{ totale: number, firmatari: string[], immagini: string[] }}
 */
export function consumaEntrate(stato, entrate, riga) {
  if (!Array.isArray(entrate) || entrate.length === 0) throw new Error('nessuna entrata');
  if (entrate.length > 64) throw new Error('troppe entrate in una riga');
  preparaStato(stato);
  const visti = new Set();
  const firmatari = new Set();
  const immagini = [];
  let totale = 0;
  for (const e of entrate) {
    const ref = typeof e === 'string' ? e : e?.ref;
    if (typeof ref !== 'string' || !RE_REF.test(ref)) throw new Error(`entrata malformata: ${String(ref).slice(0, 20)}`);
    if (visti.has(ref)) throw new Error(`entrata ripetuta: ${ref.slice(0, 12)}`);
    visti.add(ref);
    const u = stato.uscite[ref];
    if (!u || u.spesa) throw new Error(`entrata inesistente o già spesa: ${ref.slice(0, 12)}`);
    if (typeof e === 'string') {
      if (u.amount === null) throw new Error(`entrata riservata, va rivelata per spenderla in chiaro: ${ref.slice(0, 12)}`);
      totale += u.amount;
      firmatari.add(u.addr);
      continue;
    }
    // rivelazione
    const extra = Object.keys(e).filter((k) => !['ref', 'amount', 'mask', 'img'].includes(k));
    if (extra.length) throw new Error(`rivelazione: campi sconosciuti ${extra.join(', ')}`);
    if (u.amount !== null) throw new Error(`rivelazione di un'uscita già in chiaro: ${ref.slice(0, 12)}`);
    if (!Number.isInteger(e.amount) || e.amount <= 0) throw new Error('rivelazione: importo non valido');
    if (typeof e.mask !== 'string' || !RE_HEX.test(e.mask)) throw new Error('rivelazione: maschera malformata');
    const mask = BigInt('0x' + Buffer.from(e.mask, 'hex').reverse().toString('hex'));
    if (mask === 0n || mask >= ORDINE) throw new Error('rivelazione: maschera fuori dall\'ordine');
    if (impegno(e.amount, mask) !== u.commit) throw new Error(`rivelazione: importo e maschera non aprono l'uscita ${ref.slice(0, 12)}`);
    if (typeof e.img !== 'string' || !RE_HEX.test(e.img)) throw new Error('rivelazione: immagine di chiave malformata');
    if (immagini.includes(e.img)) throw new Error('rivelazione: immagine di chiave ripetuta nella riga');
    if (stato.immagini[e.img]) throw new Error(`rivelazione: uscita già spesa in anello ${ref.slice(0, 12)}`);
    const firma = riga?.sigs?.find((s) => s.img === e.img);
    if (!firma) throw new Error(`rivelazione: manca la firma ad anello per ${ref.slice(0, 12)}`);
    const ok = verificaAnello({
      membri: [{ addr: u.addr, commit: u.commit }], pseudo: impegnoInChiaro(e.amount), img: e.img, messaggio: riga.hash, firma: firma.sig,
    });
    if (!ok) throw new Error(`rivelazione: firma ad anello non valida per ${ref.slice(0, 12)}`);
    totale += e.amount;
    immagini.push(e.img);
  }
  for (const ref of visti) {
    stato.uscite[ref].spesa = true;
    stato.disponibili--;
  }
  for (const img of immagini) stato.immagini[img] = riga.hash;
  return { totale, firmatari: [...firmatari], immagini };
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
  const { totale, firmatari, immagini } = consumaEntrate(stato, b.in, riga);
  if (sommaUscite(out) !== totale) throw new Error(`spesa: entrate ${totale} ≠ uscite ${sommaUscite(out)}`);
  creaUscite(stato, riga.hash, out);
  return { by: firmatari, img: immagini };
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
