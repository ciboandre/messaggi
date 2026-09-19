// Chiavi Ed25519, firma e verifica.
//
// Ogni ruolo (banca, azienda, polizia, giudice) e ogni indirizzo usa e getta
// firma con Ed25519 (ARCHITETTURA.md, sezioni 5 e 7). Le librerie noble
// girano identiche in Node e nel browser, così il nucleo è lo stesso sul
// server e nell'app.
//
// Due modi di firmare, una sola verifica:
// - `firma` usa un seme di 32 byte, come Ed25519 standard (RFC 8032). È per
//   le chiavi dei ruoli.
// - `firmaScalare` usa direttamente uno scalare della curva. Serve agli
//   indirizzi usa e getta, la cui chiave privata è `s + k` e non ha un seme.
//   Produce una firma Ed25519 normale (R ‖ z), che `verifica` controlla con
//   la stessa funzione standard: z·G = R + H(R ‖ A ‖ m)·A.

import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToHex, bytesToNumberLE, concatBytes, hexToBytes, numberToBytesLE, randomBytes } from '@noble/curves/utils.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { base64 } from '@scure/base';

const Punto = ed25519.Point;
const G = Punto.BASE;
const ORDINE = Punto.Fn.ORDER;
const codifica = new TextEncoder();

/**
 * Genera un seme casuale di 32 byte.
 * @returns {Uint8Array}
 */
export function generaSeme() {
  return randomBytes(32);
}

/**
 * @typedef {object} Coppia
 * @property {Uint8Array} privata  il seme di 32 byte; non lascia mai il dispositivo
 * @property {string} pubblica     chiave pubblica, 32 byte, esadecimale minuscolo
 */

/**
 * Deriva la coppia di chiavi da un seme di 32 byte. Stesso seme, stesse chiavi.
 * @param {Uint8Array} seme
 * @returns {Coppia}
 */
export function coppiaDaSeme(seme) {
  if (!(seme instanceof Uint8Array) || seme.length !== 32) {
    throw new TypeError('il seme deve essere di 32 byte');
  }
  return { privata: seme, pubblica: bytesToHex(ed25519.getPublicKey(seme)) };
}

/**
 * Firma un hash (64 caratteri esadecimali) con un seme. Restituisce base64.
 * Si firma l'hash come stringa UTF-8: chi verifica lo ricalcola allo stesso modo.
 * @param {Uint8Array} privata
 * @param {string} hashHex
 * @returns {string}
 */
export function firma(privata, hashHex) {
  controllaHash(hashHex);
  if (!(privata instanceof Uint8Array) || privata.length !== 32) {
    throw new TypeError('la chiave privata deve essere un seme di 32 byte');
  }
  return toBase64(ed25519.sign(codifica.encode(hashHex), privata));
}

/**
 * Riduce 64 byte di hash a uno scalare della curva, in [1, ordine).
 * @param {Uint8Array} bytes64
 * @returns {bigint}
 */
export function scalareDaBytes(bytes64) {
  const n = bytesToNumberLE(bytes64) % ORDINE;
  return n === 0n ? 1n : n;
}

/**
 * Chiave pubblica (esadecimale) di uno scalare.
 * @param {bigint} scalare
 * @returns {string}
 */
export function pubblicaDaScalare(scalare) {
  controllaScalare(scalare);
  return G.multiply(scalare).toHex();
}

/**
 * Firma un hash con uno scalare della curva. Firma Ed25519 standard, nonce
 * deterministico derivato da scalare e messaggio.
 * @param {bigint} scalare
 * @param {string} hashHex
 * @returns {string}
 */
export function firmaScalare(scalare, hashHex) {
  controllaHash(hashHex);
  controllaScalare(scalare);
  const m = codifica.encode(hashHex);
  const A = G.multiply(scalare);
  const r = scalareDaBytes(sha512(concatBytes(codifica.encode('manti/nonce/v1'), numberToBytesLE(scalare, 32), m)));
  const R = G.multiply(r);
  const c = scalareDaBytes(sha512(concatBytes(R.toBytes(), A.toBytes(), m)));
  const z = (r + c * scalare) % ORDINE;
  return toBase64(concatBytes(R.toBytes(), numberToBytesLE(z, 32)));
}

/**
 * Verifica una firma. Non lancia mai: una firma malformata è semplicemente falsa.
 * @param {string} pubblicaHex
 * @param {string} hashHex
 * @param {string} firmaBase64
 * @returns {boolean}
 */
export function verifica(pubblicaHex, hashHex, firmaBase64) {
  try {
    controllaHash(hashHex);
    if (typeof pubblicaHex !== 'string' || !/^[0-9a-f]{64}$/.test(pubblicaHex)) return false;
    const sig = fromBase64(firmaBase64);
    if (sig.length !== 64) return false;
    return ed25519.verify(sig, codifica.encode(hashHex), hexToBytes(pubblicaHex));
  } catch {
    return false;
  }
}

/** @param {string} h */
function controllaHash(h) {
  if (typeof h !== 'string' || !/^[0-9a-f]{64}$/.test(h)) {
    throw new TypeError('hash: attesi 64 caratteri esadecimali minuscoli');
  }
}

/** @param {bigint} s */
function controllaScalare(s) {
  if (typeof s !== 'bigint' || s <= 0n || s >= ORDINE) {
    throw new TypeError('scalare fuori dalla curva');
  }
}

/** @param {Uint8Array} b */
function toBase64(b) {
  return base64.encode(b);
}

/** @param {string} s */
function fromBase64(s) {
  if (typeof s !== 'string') throw new TypeError('base64');
  return base64.decode(s);
}
