// Frase di recupero di dodici parole (REGOLE_MONETA.md, sezione 15).
//
// Standard BIP39 con la lista di parole italiana ufficiale: 128 bit di
// casualità più 4 bit di controllo, quindi una frase con una parola sbagliata
// viene rifiutata quasi sempre. Dalla frase esce un seme di 64 byte da cui
// si derivano tutte le chiavi (portafoglio.js). Chi ha la frase ha il conto.

import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/italian.js';

export const PAROLE = 12;

/**
 * Genera una frase nuova di dodici parole italiane.
 * @returns {string}
 */
export function generaFrase() {
  return generateMnemonic(wordlist, 128);
}

/**
 * Normalizza spazi e maiuscole: la frase si può scrivere come viene.
 * @param {string} frase
 * @returns {string}
 */
export function normalizzaFrase(frase) {
  if (typeof frase !== 'string') throw new TypeError('la frase deve essere una stringa');
  return frase.normalize('NFKD').toLowerCase().trim().split(/\s+/).join(' ');
}

/**
 * Vera se la frase è di dodici parole della lista con il controllo giusto.
 * @param {string} frase
 * @returns {boolean}
 */
export function fraseValida(frase) {
  try {
    const f = normalizzaFrase(frase);
    return f.split(' ').length === PAROLE && validateMnemonic(f, wordlist);
  } catch {
    return false;
  }
}

/**
 * Seme di 64 byte dalla frase. Lancia se la frase non è valida.
 * @param {string} frase
 * @returns {Uint8Array}
 */
export function semeDaFrase(frase) {
  const f = normalizzaFrase(frase);
  if (!fraseValida(f)) throw new Error('frase di recupero non valida');
  return mnemonicToSeedSync(f, '');
}

/**
 * Le parole ammesse, per suggerire mentre l'utente scrive.
 * @returns {readonly string[]}
 */
export function parole() {
  return wordlist;
}
