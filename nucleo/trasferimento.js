// Il `transfer` dei correntisti: entrate in anello, uscite riservate.
//
// ARCHITETTURA.md, sezioni 6 e 8. Body:
//   in:    [ { ring: [ref…], img, pseudo } ]   una per entrata
//   out:   [ { addr, eph, commit, amt, memo? } ] riservate
//   proof: prova di intervallo aggregata su riempi(out.commit)
//   ref:   null (le multe, che aggiungono due uscite in chiaro, arrivano dopo)
// e in `sigs` una firma ad anello { img, sig } per ogni entrata.
//
// La regola verifica, in quest'ordine: forma, immagini di chiave nuove,
// anelli fatti di uscite esistenti e non spese in chiaro, in ordine di
// creazione e della dimensione giusta; bilancio degli impegni; prova di
// intervallo; firme ad anello sull'hash della riga. Poi segna le immagini
// come spese e registra le uscite, con importo ignoto.
//
// Dimensione dell'anello: 16, o tutte le uscite disponibili se sono meno
// (REGOLE_MONETA.md, sezione 2). Disponibile = mai spesa in chiaro. Le
// uscite spese in anello restano disponibili: nessuno sa quali sono.

import { ed25519 } from '@noble/curves/ed25519.js';
import { formaCausaleValida } from './causale.js';
import { bilancio } from './impegni.js';
import { verificaIntervalli, riempi, USCITE_MAX } from './intervallo.js';
import { verificaAnello } from './anello.js';
import { preparaStato, registraUscita } from './uscite.js';

export const ANELLO = 16;
export const ENTRATE_MAX = 16;
const RE_HEX64 = /^[0-9a-f]{64}$/;
const RE_HEX16 = /^[0-9a-f]{16}$/;
const RE_REF = /^[0-9a-f]{64}:\d+$/;

/** @param {string} hex */
function puntoBuono(hex) {
  if (typeof hex !== 'string' || !RE_HEX64.test(hex)) return false;
  try {
    const P = ed25519.Point.fromHex(hex, false);
    return P.toHex() === hex && P.isTorsionFree();
  } catch {
    return false;
  }
}

/**
 * @typedef {object} UscitaRiservata
 * @property {string} addr
 * @property {string} eph
 * @property {string} commit
 * @property {string} amt     importo cifrato, 16 esadecimali
 * @property {string} [memo]
 */

/**
 * Controlla la forma delle uscite riservate. Lancia con il motivo.
 * @param {unknown} out
 * @returns {UscitaRiservata[]}
 */
export function controllaUsciteRiservate(out) {
  if (!Array.isArray(out) || out.length === 0) throw new Error('nessuna uscita');
  if (out.length > USCITE_MAX) throw new Error(`al massimo ${USCITE_MAX} uscite riservate in una riga`);
  for (const [i, u] of out.entries()) {
    const dove = `uscita ${i}`;
    if (!u || typeof u !== 'object') throw new Error(`${dove}: malformata`);
    if (!puntoBuono(u.addr)) throw new Error(`${dove}: indirizzo non valido`);
    if (!puntoBuono(u.eph)) throw new Error(`${dove}: eph non valido`);
    if (!puntoBuono(u.commit)) throw new Error(`${dove}: impegno non valido`);
    if (typeof u.amt !== 'string' || !RE_HEX16.test(u.amt)) throw new Error(`${dove}: importo cifrato malformato`);
    if (u.memo !== undefined && !formaCausaleValida(u.memo)) throw new Error(`${dove}: causale malformata`);
    const extra = Object.keys(u).filter((k) => !['addr', 'eph', 'commit', 'amt', 'memo'].includes(k));
    if (extra.length) throw new Error(`${dove}: campi sconosciuti ${extra.join(', ')}`);
  }
  return /** @type {UscitaRiservata[]} */ (out);
}

/**
 * Quante uscite possono stare in un anello, e quanto dev'essere grande.
 * @param {Record<string, any>} stato
 */
export function dimensioneAnello(stato) {
  preparaStato(stato);
  return Math.min(ANELLO, stato.disponibili ?? 0);
}

/**
 * Controlla un anello: riferimenti ben formati, distinti, esistenti, non
 * spesi in chiaro, in ordine di creazione, della dimensione giusta.
 * Restituisce i membri per la firma.
 * @param {Record<string, any>} stato
 * @param {unknown} ring
 * @param {string} dove
 * @returns {Array<{ addr: string, commit: string }>}
 */
export function controllaAnello(stato, ring, dove) {
  if (!Array.isArray(ring) || ring.length === 0) throw new Error(`${dove}: anello vuoto`);
  const attesa = dimensioneAnello(stato);
  if (ring.length !== attesa) throw new Error(`${dove}: anello di ${ring.length}, atteso ${attesa}`);
  let ultimoOrdine = -1;
  const membri = [];
  for (const ref of ring) {
    if (typeof ref !== 'string' || !RE_REF.test(ref)) throw new Error(`${dove}: riferimento malformato`);
    const u = stato.uscite[ref];
    if (!u) throw new Error(`${dove}: uscita inesistente ${ref.slice(0, 12)}`);
    if (u.spesa) throw new Error(`${dove}: uscita spesa in chiaro ${ref.slice(0, 12)}`);
    if (u.ordine <= ultimoOrdine) throw new Error(`${dove}: anello non in ordine di creazione, o con ripetizioni`);
    ultimoOrdine = u.ordine;
    membri.push({ addr: u.addr, commit: u.commit });
  }
  return membri;
}

/**
 * Regola del tipo `transfer` riservato.
 * @type {import('./registro.js').RegolaTipo}
 */
export function regolaTransfer(riga, stato) {
  const b = /** @type {any} */ (riga.body);
  const extra = Object.keys(b).filter((k) => !['in', 'out', 'proof', 'ref'].includes(k));
  if (extra.length) throw new Error(`transfer: campi sconosciuti ${extra.join(', ')}`);
  if (b.ref !== null) throw new Error('transfer: ref deve essere null');
  preparaStato(stato);
  const out = controllaUsciteRiservate(b.out);

  if (!Array.isArray(b.in) || b.in.length === 0) throw new Error('transfer: nessuna entrata');
  if (b.in.length > ENTRATE_MAX) throw new Error(`transfer: al massimo ${ENTRATE_MAX} entrate`);
  const immagini = new Set();
  const entrate = [];
  for (const [i, e] of b.in.entries()) {
    const dove = `entrata ${i}`;
    if (!e || typeof e !== 'object') throw new Error(`${dove}: malformata`);
    const extraE = Object.keys(e).filter((k) => !['ring', 'img', 'pseudo'].includes(k));
    if (extraE.length) throw new Error(`${dove}: campi sconosciuti ${extraE.join(', ')}`);
    if (!puntoBuono(e.img)) throw new Error(`${dove}: immagine di chiave non valida`);
    if (immagini.has(e.img)) throw new Error(`${dove}: immagine di chiave ripetuta nella riga`);
    if (stato.immagini[e.img]) throw new Error(`${dove}: immagine di chiave già spesa`);
    immagini.add(e.img);
    if (!puntoBuono(e.pseudo)) throw new Error(`${dove}: pseudo-impegno non valido`);
    const membri = controllaAnello(stato, e.ring, dove);
    entrate.push({ img: e.img, pseudo: e.pseudo, membri });
  }

  if (!bilancio({ pseudo: entrate.map((e) => e.pseudo), uscite: out.map((u) => u.commit) })) {
    throw new Error('transfer: il bilancio degli impegni non torna');
  }
  if (!verificaIntervalli(riempi(out.map((u) => u.commit)), b.proof)) {
    throw new Error('transfer: prova di intervallo non valida');
  }
  for (const [i, e] of entrate.entries()) {
    const firma = riga.sigs.find((s) => s.img === e.img);
    if (!firma) throw new Error(`entrata ${i}: manca la firma ad anello`);
    if (!verificaAnello({ membri: e.membri, pseudo: e.pseudo, img: e.img, messaggio: riga.hash, firma: firma.sig })) {
      throw new Error(`entrata ${i}: firma ad anello non valida`);
    }
  }

  for (const e of entrate) stato.immagini[e.img] = riga.hash;
  for (const [i, u] of out.entries()) {
    registraUscita(stato, `${riga.hash}:${i}`, { addr: u.addr, commit: u.commit, amount: null });
  }
  return { by: [], img: entrate.map((e) => e.img) };
}
