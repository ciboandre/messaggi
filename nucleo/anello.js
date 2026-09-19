// Firma ad anello CLSAG e immagini di chiave: chi spende non si vede.
//
// ARCHITETTURA.md, sezioni 3 e 6. Un'entrata in anello mette l'uscita vera
// tra n uscite del registro. Per ogni membro i c'è l'indirizzo P_i e
// l'impegno C_i; chi firma conosce, per il solo membro l,
//   p  tale che P_l = p·G                    (chiave dell'indirizzo, s + k)
//   z  tale che C_l − C' = z·G               (differenza di maschera con lo
//                                             pseudo-impegno C', stesso importo)
// e prova le due cose insieme senza dire quale l. È CLSAG (Goodell, Noether,
// RandomRun 2019), con due chiavi per membro aggregate in una.
//
// L'immagine di chiave I = p·Hp(P_l) è la stessa per chiunque spenda P_l:
// il registro la conserva e rifiuta la seconda. Hp è un hash-to-curve con
// etichetta propria, così nessuno conosce il logaritmo di Hp(P) rispetto a
// G o a P. D = z·Hp(P_l) è l'immagine ausiliaria per l'impegno.
//
// Tutti i punti in ingresso — chiavi, impegni, immagini — devono essere
// canonici e senza torsione: con la torsione si forgerebbero immagini di
// chiave diverse per lo stesso segreto, e la doppia spesa passerebbe.
//
// Firma = { c1, s: [s_1 … s_n], D }. L'immagine I sta nella riga, accanto
// all'anello. Il messaggio è l'hash della riga, come per le altre firme.
//
// Chi firma non è a tempo costante (BigInt), ma non ramifica sui segreti:
// l'indice l decide solo l'ordine in cui si percorre l'anello.

import { ed25519, ed25519_hasher } from '@noble/curves/ed25519.js';
import { bytesToHex, bytesToNumberLE, concatBytes, hexToBytes, numberToBytesLE, randomBytes } from '@noble/curves/utils.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { scalareDaBytes } from './chiavi.js';

const Punto = ed25519.Point;
const G = Punto.BASE;
const ORDINE = Punto.Fn.ORDER;
const codifica = new TextEncoder();

export const MEMBRI_MAX = 255;
const RE_HEX64 = /^[0-9a-f]{64}$/;

const mod = (x) => ((x % ORDINE) + ORDINE) % ORDINE;
const mul = (x, y) => mod(x * y);
/** Su scalari pubblici. */
const per = (P, k) => P.multiplyUnsafe(mod(k));
const scalareHex = (k) => bytesToHex(numberToBytesLE(mod(k), 32));
const scalareDaHex = (hex) => {
  if (typeof hex !== 'string' || !RE_HEX64.test(hex)) throw new Error('anello: scalare malformato');
  const k = bytesToNumberLE(hexToBytes(hex));
  if (k >= ORDINE) throw new Error('anello: scalare fuori dall\'ordine');
  return k;
};
const puntoDaHex = (hex, cosa) => {
  if (typeof hex !== 'string' || !RE_HEX64.test(hex)) throw new Error(`anello: ${cosa} malformato`);
  const P = Punto.fromHex(hex, false);
  if (P.toHex() !== hex) throw new Error(`anello: ${cosa} non canonico`);
  if (!P.isTorsionFree()) throw new Error(`anello: ${cosa} con torsione`);
  return P;
};
const controllaSegreto = (k, cosa) => {
  if (typeof k !== 'bigint' || k <= 0n || k >= ORDINE) throw new RangeError(`anello: ${cosa} fuori da (0, ordine)`);
};
const controllaHash = (h) => {
  if (typeof h !== 'string' || !RE_HEX64.test(h)) throw new TypeError('anello: messaggio atteso come hash esadecimale');
};

/**
 * Hp(P): il punto su cui si calcola l'immagine di chiave di P.
 * @param {import('@noble/curves/abstract/edwards.js').EdwardsPoint} P
 */
function puntoImmagine(P) {
  return ed25519_hasher.hashToCurve(P.toBytes(), { DST: 'manti/immagine/v1' });
}

/**
 * Immagine di chiave di un indirizzo: I = p·Hp(p·G). Sempre la stessa per
 * la stessa chiave, qualunque sia l'anello.
 * @param {bigint} p  chiave privata dell'indirizzo
 * @returns {string}
 */
export function immagineChiave(p) {
  controllaSegreto(p, 'chiave');
  return puntoImmagine(G.multiply(p)).multiply(p).toHex();
}

/**
 * Prefisso comune a tutti gli hash della firma: l'anello intero, lo
 * pseudo-impegno, le immagini e il messaggio. Chi verifica lo ricostruisce.
 */
function prefisso(P, C, pseudo, I, D, messaggio) {
  return concatBytes(
    Uint8Array.of(P.length),
    ...P.map((p) => p.toBytes()),
    ...C.map((c) => c.toBytes()),
    pseudo.toBytes(), I.toBytes(), D.toBytes(),
    codifica.encode(messaggio),
  );
}
const hashScalare = (etichetta, ...parti) => scalareDaBytes(sha512(concatBytes(codifica.encode(etichetta), ...parti)));

/**
 * Coefficienti di aggregazione, punti aggregati e immagine aggregata:
 *   W_i = μP·P_i + μC·(C_i − C'),   W̃ = μP·I + μC·D
 */
function aggrega(P, C, pseudo, I, D, messaggio) {
  const base = prefisso(P, C, pseudo, I, D, messaggio);
  const muP = hashScalare('manti/anello/v1/mu-P', base);
  const muC = hashScalare('manti/anello/v1/mu-C', base);
  const W = P.map((Pi, i) => per(Pi, muP).add(per(C[i].subtract(pseudo), muC)));
  const Wtilde = per(I, muP).add(per(D, muC));
  return { base, muP, muC, W, Wtilde };
}
const sfida = (base, L, R) => hashScalare('manti/anello/v1/giro', base, L.toBytes(), R.toBytes());

/**
 * @typedef {object} Membro
 * @property {string} addr    P_i, esadecimale
 * @property {string} commit  C_i, esadecimale (in chiaro: impegnoInChiaro)
 */

/**
 * @typedef {object} FirmaAnello
 * @property {string} c1
 * @property {string[]} s
 * @property {string} D
 */

/**
 * Firma con il membro `indice` dell'anello.
 * @param {object} arg
 * @param {Membro[]} arg.membri
 * @param {number} arg.indice     posizione dell'uscita vera
 * @param {bigint} arg.p          chiave privata di membri[indice].addr
 * @param {bigint} arg.z          maschera vera − maschera dello pseudo-impegno
 * @param {string} arg.pseudo     C', esadecimale
 * @param {string} arg.messaggio  hash della riga
 * @returns {{ img: string, firma: FirmaAnello }}
 */
export function firmaAnello({ membri, indice, p, z, pseudo, messaggio }) {
  if (!Array.isArray(membri) || membri.length < 1 || membri.length > MEMBRI_MAX) throw new RangeError(`anello: da 1 a ${MEMBRI_MAX} membri`);
  if (!Number.isInteger(indice) || indice < 0 || indice >= membri.length) throw new RangeError('anello: indice fuori dall\'anello');
  controllaSegreto(p, 'chiave');
  controllaSegreto(z, 'differenza di maschera');
  controllaHash(messaggio);
  const n = membri.length;
  const P = membri.map((m) => puntoDaHex(m.addr, 'indirizzo'));
  const C = membri.map((m) => puntoDaHex(m.commit, 'impegno'));
  const Cp = puntoDaHex(pseudo, 'pseudo-impegno');
  if (!G.multiply(p).equals(P[indice])) throw new Error('anello: la chiave non apre l\'indirizzo scelto');
  if (!G.multiply(z).equals(C[indice].subtract(Cp))) throw new Error('anello: la differenza di maschera non torna');

  const Hp = P.map(puntoImmagine);
  const I = Hp[indice].multiply(p);
  const D = Hp[indice].multiply(z);
  const { base, muP, muC, W, Wtilde } = aggrega(P, C, Cp, I, D, messaggio);
  const w = mod(mul(muP, p) + mul(muC, z));

  const alpha = scalareDaBytes(randomBytes(64));
  const s = Array(n).fill(0n);
  const c = Array(n).fill(0n);
  // si parte dal membro vero con il nonce, si gira l'anello, si chiude su di lui
  let L = G.multiply(alpha);
  let R = Hp[indice].multiply(alpha);
  c[(indice + 1) % n] = sfida(base, L, R);
  for (let passo = 1; passo < n; passo++) {
    const i = (indice + passo) % n;
    s[i] = scalareDaBytes(randomBytes(64));
    L = per(G, s[i]).add(per(W[i], c[i]));
    R = per(Hp[i], s[i]).add(per(Wtilde, c[i]));
    c[(i + 1) % n] = sfida(base, L, R);
  }
  s[indice] = mod(alpha - mul(c[indice], w));

  return { img: I.toHex(), firma: { c1: scalareHex(c[0]), s: s.map(scalareHex), D: D.toHex() } };
}

/**
 * Verifica una firma ad anello. Non lancia mai: qualsiasi cosa non regga,
 * malformata compresa, è false.
 * @param {object} arg
 * @param {Membro[]} arg.membri
 * @param {string} arg.pseudo
 * @param {string} arg.img
 * @param {string} arg.messaggio
 * @param {FirmaAnello} arg.firma
 * @returns {boolean}
 */
export function verificaAnello(arg) {
  try {
    return verificaAnelloOLancia(arg);
  } catch {
    return false;
  }
}

/**
 * Come verificaAnello, ma lancia sugli input malformati. Per i test.
 * @param {{ membri: Membro[], pseudo: string, img: string, messaggio: string, firma: FirmaAnello }} arg
 * @returns {boolean}
 */
export function verificaAnelloOLancia({ membri, pseudo, img, messaggio, firma }) {
  if (!Array.isArray(membri) || membri.length < 1 || membri.length > MEMBRI_MAX) throw new RangeError(`anello: da 1 a ${MEMBRI_MAX} membri`);
  controllaHash(messaggio);
  if (!firma || typeof firma !== 'object' || !Array.isArray(firma.s) || firma.s.length !== membri.length) throw new Error('anello: firma malformata');
  const n = membri.length;
  const P = membri.map((m) => puntoDaHex(m.addr, 'indirizzo'));
  const C = membri.map((m) => puntoDaHex(m.commit, 'impegno'));
  const Cp = puntoDaHex(pseudo, 'pseudo-impegno');
  const I = puntoDaHex(img, 'immagine di chiave');
  if (I.equals(Punto.ZERO)) throw new Error('anello: immagine di chiave nulla');
  const D = puntoDaHex(firma.D, 'immagine ausiliaria');
  const c1 = scalareDaHex(firma.c1);
  const s = firma.s.map(scalareDaHex);

  const Hp = P.map(puntoImmagine);
  const { base, W, Wtilde } = aggrega(P, C, Cp, I, D, messaggio);
  let c = c1;
  for (let i = 0; i < n; i++) {
    const L = per(G, s[i]).add(per(W[i], c));
    const R = per(Hp[i], s[i]).add(per(Wtilde, c));
    c = sfida(base, L, R);
  }
  return c === c1;
}
