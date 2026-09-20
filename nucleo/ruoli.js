// Le identità dei ruoli (banca, azienda, polizia, giudice) da una frase di
// dodici parole: una chiave Ed25519 per firmare le righe del ruolo e un
// portafoglio per ricevere e per leggere i testi cifrati.
//
//   seme          = BIP39 dalla frase (64 byte)
//   chiave firma  = SHA-512("manti/<ruolo>/firma/v1" ‖ seme)[0..32]
//   portafoglio   = portafoglioDaSeme(seme), come per i correntisti
//
// Stessa frase, ruolo diverso, chiave di firma diversa; il portafoglio
// invece è lo stesso: la frase di una polizia aperta nell'app del
// correntista mostra il conto della polizia.

import { sha512 } from '@noble/hashes/sha2.js';
import { concatBytes } from '@noble/curves/utils.js';
import { coppiaDaSeme, firma } from './chiavi.js';
import { fraseValida, semeDaFrase } from './frase.js';
import { portafoglioDaSeme } from './portafoglio.js';

const codifica = new TextEncoder();
export const RUOLI = ['banca', 'azienda', 'polizia', 'giudice'];

/**
 * @param {string} frase
 * @param {'banca' | 'azienda' | 'polizia' | 'giudice'} ruolo
 */
export function identitaRuolo(frase, ruolo) {
  if (!RUOLI.includes(ruolo)) throw new Error(`ruolo sconosciuto: ${ruolo}`);
  if (!fraseValida(frase)) throw new Error('frase non valida');
  const seme = semeDaFrase(frase);
  const chiave = coppiaDaSeme(sha512(concatBytes(codifica.encode(`manti/${ruolo}/firma/v1`), seme)).subarray(0, 32));
  const portafoglio = portafoglioDaSeme(seme);
  return { chiave, portafoglio, firmatario: { by: chiave.pubblica, firma: (/** @type {string} */ h) => firma(chiave.privata, h) } };
}
