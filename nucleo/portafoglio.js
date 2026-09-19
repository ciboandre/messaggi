// Portafoglio: chiavi di spesa e di vista, coordinate, indirizzi usa e getta.
//
// È la parte che rende i saldi segreti su un registro pubblico
// (ARCHITETTURA.md, sezione 5). Tecnica degli indirizzi stealth su Ed25519:
//
//   il correntista ha  s (spesa) e v (vista), con S = s·G e V = v·G;
//   le coordinate sono (S, V), codificate in bech32m con prefisso "mnt";
//   chi paga sceglie r casuale, calcola R = r·G, k = H(r·V), P = S + k·G,
//   e scrive nel registro l'uscita { addr: P, eph: R };
//   il destinatario, per ogni uscita, calcola k' = H(v·R) e controlla
//   S + k'·G = P; se torna, l'uscita è sua e la spende con p = s + k'.
//
// Nessuno che non abbia v può collegare due uscite alla stessa persona.

import { ed25519 } from '@noble/curves/ed25519.js';
import { concatBytes, hexToBytes, numberToBytesLE, randomBytes } from '@noble/curves/utils.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { bech32m } from '@scure/base';
import { semeDaFrase } from './frase.js';
import { scalareDaBytes } from './chiavi.js';

const Punto = ed25519.Point;
const G = Punto.BASE;
const ORDINE = Punto.Fn.ORDER;
const codifica = new TextEncoder();

export const PREFISSO = 'mnt';
const LIMITE_BECH32 = 200;
const BYTES_COORDINATE = 64;

/**
 * @typedef {object} Portafoglio
 * @property {bigint} s            chiave di spesa, privata
 * @property {bigint} v            chiave di vista, privata
 * @property {string} S            chiave pubblica di spesa, esadecimale
 * @property {string} V            chiave pubblica di vista, esadecimale
 * @property {string} coordinate   "mnt1…", da condividere
 */

/**
 * Deriva il portafoglio da un seme di 64 byte (quello della frase).
 * @param {Uint8Array} seme64
 * @returns {Portafoglio}
 */
export function portafoglioDaSeme(seme64) {
  if (!(seme64 instanceof Uint8Array) || seme64.length !== 64) {
    throw new TypeError('il seme del portafoglio deve essere di 64 byte');
  }
  const s = scalareDaBytes(sha512(concatBytes(codifica.encode('manti/spesa/v1'), seme64)));
  const v = scalareDaBytes(sha512(concatBytes(codifica.encode('manti/vista/v1'), seme64)));
  const S = G.multiply(s).toHex();
  const V = G.multiply(v).toHex();
  return { s, v, S, V, coordinate: codificaCoordinate(S, V) };
}

/**
 * Deriva il portafoglio dalla frase di dodici parole.
 * @param {string} frase
 * @returns {Portafoglio}
 */
export function portafoglioDaFrase(frase) {
  return portafoglioDaSeme(semeDaFrase(frase));
}

/**
 * Coordinate "mnt1…" da due chiavi pubbliche esadecimali.
 * @param {string} S
 * @param {string} V
 * @returns {string}
 */
export function codificaCoordinate(S, V) {
  const bytes = concatBytes(hexToBytes(S), hexToBytes(V));
  return bech32m.encode(PREFISSO, bech32m.toWords(bytes), LIMITE_BECH32);
}

/**
 * Chiavi pubbliche da coordinate. Lancia se prefisso, lunghezza o checksum
 * non tornano, o se i punti non stanno sulla curva.
 * @param {string} coordinate
 * @returns {{ S: string, V: string }}
 */
export function decodificaCoordinate(coordinate) {
  if (typeof coordinate !== 'string') throw new TypeError('coordinate: attesa una stringa');
  const pulite = coordinate.replace(/\s+/g, '').toLowerCase();
  const { prefix, words } = bech32m.decode(/** @type {`${string}1${string}`} */ (pulite), LIMITE_BECH32);
  if (prefix !== PREFISSO) throw new Error(`coordinate: prefisso "${prefix}", atteso "${PREFISSO}"`);
  const bytes = bech32m.fromWords(words);
  if (bytes.length !== BYTES_COORDINATE) throw new Error('coordinate: lunghezza sbagliata');
  const S = Punto.fromBytes(bytes.subarray(0, 32)).toHex();
  const V = Punto.fromBytes(bytes.subarray(32, 64)).toHex();
  return { S, V };
}

/**
 * Coordinate scritte a gruppi di quattro, per leggerle a voce o su carta.
 * @param {string} coordinate
 * @returns {string}
 */
export function coordinateLeggibili(coordinate) {
  return coordinate.match(/.{1,4}/g)?.join(' ') ?? coordinate;
}

/**
 * @typedef {object} IndirizzoUsaEGetta
 * @property {string} addr  P, esadecimale: dove vanno i manti
 * @property {string} eph   R, esadecimale: serve al destinatario per riconoscere l'uscita
 * @property {bigint} k     segreto condiviso; serve a chi paga per cifrare la causale
 */

/**
 * Chi paga: crea un indirizzo nuovo per delle coordinate. Mai lo stesso due volte.
 * @param {string} coordinate
 * @param {Uint8Array} [rBytes]  solo per i test: rende l'indirizzo riproducibile
 * @returns {IndirizzoUsaEGetta}
 */
export function creaIndirizzo(coordinate, rBytes) {
  const { S, V } = decodificaCoordinate(coordinate);
  const r = scalareDaBytes(rBytes ?? randomBytes(64));
  const R = G.multiply(r);
  const k = segretoCondiviso(Punto.fromHex(V).multiply(r));
  const P = Punto.fromHex(S).add(G.multiply(k));
  return { addr: P.toHex(), eph: R.toHex(), k };
}

/**
 * Il destinatario: riconosce se un'uscita è sua. Restituisce null se non lo è,
 * altrimenti il segreto k e la chiave privata p con cui spenderla.
 * @param {{ addr: string, eph: string }} uscita
 * @param {Portafoglio} portafoglio
 * @returns {{ k: bigint, p: bigint } | null}
 */
export function riconosci(uscita, portafoglio) {
  let R;
  try {
    R = Punto.fromHex(uscita.eph);
  } catch {
    return null;
  }
  const k = segretoCondiviso(R.multiply(portafoglio.v));
  const P = Punto.fromHex(portafoglio.S).add(G.multiply(k));
  if (P.toHex() !== uscita.addr) return null;
  const p = (portafoglio.s + k) % ORDINE;
  return { k, p };
}

/**
 * Chiave simmetrica per la causale, derivata dal segreto condiviso.
 * La stessa da entrambe le parti; diversa per ogni uscita.
 * @param {bigint} k
 * @returns {Uint8Array} 32 byte
 */
export function chiaveCausale(k) {
  return sha512(concatBytes(codifica.encode('manti/causale/v1'), numberToBytesLE(k, 32))).subarray(0, 32);
}

/**
 * k = H(punto condiviso), ridotto a scalare.
 * @param {import('@noble/curves/abstract/edwards.js').EdwardsPoint} punto
 * @returns {bigint}
 */
function segretoCondiviso(punto) {
  return scalareDaBytes(sha512(concatBytes(codifica.encode('manti/condiviso/v1'), punto.toBytes())));
}
