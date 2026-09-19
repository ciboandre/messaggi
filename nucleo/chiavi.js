// Chiavi Ed25519, firma e verifica.
//
// Ogni ruolo (banca, azienda, polizia, giudice) e ogni indirizzo usa e getta
// firma con Ed25519 (ARCHITETTURA.md, sezioni 5 e 7). Qui c'è solo la
// primitiva: da un seme di 32 byte si ottiene la coppia di chiavi, si firma
// un hash, si verifica una firma. Gli indirizzi usa e getta arrivano al
// passo successivo.
//
// Solo node:crypto. Le chiavi grezze vengono avvolte nei prefissi DER che
// Node si aspetta; i prefissi sono fissi per Ed25519.

import { createPrivateKey, createPublicKey, randomBytes, sign, verify } from 'node:crypto';

const PREFISSO_PKCS8 = Buffer.from('302e020100300506032b657004220420', 'hex');
const PREFISSO_SPKI = Buffer.from('302a300506032b6570032100', 'hex');

/**
 * Genera un seme casuale di 32 byte.
 * @returns {Buffer}
 */
export function generaSeme() {
  return randomBytes(32);
}

/**
 * @typedef {object} Coppia
 * @property {import('node:crypto').KeyObject} privata
 * @property {string} pubblica  chiave pubblica grezza, 32 byte, esadecimale
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
  const privata = createPrivateKey({
    key: Buffer.concat([PREFISSO_PKCS8, Buffer.from(seme)]),
    format: 'der',
    type: 'pkcs8',
  });
  const spki = createPublicKey(privata).export({ format: 'der', type: 'spki' });
  const pubblica = Buffer.from(spki.subarray(PREFISSO_SPKI.length)).toString('hex');
  return { privata, pubblica };
}

/**
 * Ricostruisce l'oggetto chiave pubblica da 32 byte esadecimali.
 * @param {string} pubblicaHex
 * @returns {import('node:crypto').KeyObject}
 */
function chiavePubblica(pubblicaHex) {
  if (typeof pubblicaHex !== 'string' || !/^[0-9a-f]{64}$/.test(pubblicaHex)) {
    throw new TypeError('chiave pubblica: attesi 64 caratteri esadecimali minuscoli');
  }
  return createPublicKey({
    key: Buffer.concat([PREFISSO_SPKI, Buffer.from(pubblicaHex, 'hex')]),
    format: 'der',
    type: 'spki',
  });
}

/**
 * Firma un hash (64 caratteri esadecimali). Restituisce la firma in base64.
 * Si firma l'hash come stringa: chi verifica deve ricalcolarlo allo stesso modo.
 * @param {import('node:crypto').KeyObject} privata
 * @param {string} hashHex
 * @returns {string}
 */
export function firma(privata, hashHex) {
  controllaHash(hashHex);
  return sign(null, Buffer.from(hashHex, 'utf8'), privata).toString('base64');
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
    const sig = Buffer.from(firmaBase64, 'base64');
    if (sig.length !== 64) return false;
    return verify(null, Buffer.from(hashHex, 'utf8'), chiavePubblica(pubblicaHex), sig);
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
