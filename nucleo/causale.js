// Causali cifrate: le legge solo il destinatario (REGOLE_MONETA.md, sezione 12).
//
// La chiave è quella derivata dal segreto condiviso dell'uscita
// (portafoglio.js, chiaveCausale): chi paga la conosce perché ha scelto r,
// chi riceve la ricava con la chiave di vista. Nessun altro. Il cifrario è
// XChaCha20-Poly1305: nonce casuale di 24 byte, autenticato, così una causale
// manomessa non si decifra affatto invece di decifrarsi in spazzatura.

import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { concatBytes, randomBytes } from '@noble/ciphers/utils.js';
import { base64 } from '@scure/base';

export const NONCE_BYTES = 24;
export const CAUSALE_MAX_CARATTERI = 140;

/**
 * Cifra una causale con la chiave di 32 byte. Restituisce base64 di nonce ‖ cifrato.
 * @param {Uint8Array} chiave
 * @param {string} testo
 * @returns {string}
 */
export function cifraCausale(chiave, testo) {
  if (typeof testo !== 'string') throw new TypeError('la causale deve essere una stringa');
  if ([...testo].length > CAUSALE_MAX_CARATTERI) throw new RangeError(`causale oltre ${CAUSALE_MAX_CARATTERI} caratteri`);
  const nonce = randomBytes(NONCE_BYTES);
  const cifrato = xchacha20poly1305(chiave, nonce).encrypt(new TextEncoder().encode(testo));
  return base64.encode(concatBytes(nonce, cifrato));
}

/**
 * Decifra una causale. Restituisce null se la chiave è sbagliata o il dato è
 * manomesso o malformato: non lancia mai.
 * @param {Uint8Array} chiave
 * @param {string} memo
 * @returns {string | null}
 */
export function decifraCausale(chiave, memo) {
  try {
    const bytes = base64.decode(memo);
    if (bytes.length < NONCE_BYTES + 16) return null;
    const chiaro = xchacha20poly1305(chiave, bytes.subarray(0, NONCE_BYTES)).decrypt(bytes.subarray(NONCE_BYTES));
    return new TextDecoder('utf-8', { fatal: true }).decode(chiaro);
  } catch {
    return null;
  }
}

/**
 * Vero se una stringa ha la forma di una causale cifrata (per la validazione
 * del registro, che non può decifrarla).
 * @param {unknown} memo
 * @returns {boolean}
 */
export function formaCausaleValida(memo) {
  if (typeof memo !== 'string') return false;
  try {
    const n = base64.decode(memo).length;
    return n >= NONCE_BYTES + 16 && n <= NONCE_BYTES + 16 + CAUSALE_MAX_CARATTERI * 4;
  } catch {
    return false;
  }
}
