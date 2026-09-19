// Impegni di Pedersen: l'importo nel registro senza il numero.
//
// ARCHITETTURA.md, sezioni 3 e 6. Un'uscita riservata porta
//   C = b·G + a·H
// dove a è l'importo in centesimi di manto, b la maschera, G il generatore di
// Ed25519 e H un secondo generatore di cui nessuno conosce il logaritmo:
// H = hash_to_curve("manti/H/v1"). Un importo in chiaro è l'impegno con b = 0.
//
// Gli impegni si sommano come i numeri che nascondono: per questo il motore
// può verificare che una riga conserva la somma (bilancio) senza leggerla.
// Maschera e chiave dell'importo cifrato si derivano dal segreto condiviso k
// dell'uscita (portafoglio.js), così il destinatario ricava tutto da R e v.
//
// Qui non c'è la prova che a stia in [0, 2^64): è il passo 9. Senza quella,
// un impegno può nascondere un importo "negativo" e il bilancio tornare lo
// stesso. Questo modulo da solo non basta a validare una riga.

import { ed25519, ed25519_hasher } from '@noble/curves/ed25519.js';
import { bytesToNumberLE, concatBytes, numberToBytesLE, randomBytes } from '@noble/curves/utils.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { scalareDaBytes } from './chiavi.js';

const Punto = ed25519.Point;
const G = Punto.BASE;
const ORDINE = Punto.Fn.ORDER;
const codifica = new TextEncoder();

export const IMPORTO_MAX = (1n << 64n) - 1n;
const BYTES_IMPORTO = 8;

/** Il secondo generatore. Pubblico, fisso, senza logaritmo noto rispetto a G. */
export const H = ed25519_hasher.hashToCurve(codifica.encode('manti/H/v1'), { DST: 'manti/H/v1' });

/**
 * Importo come bigint in [0, 2^64), o errore.
 * @param {number | bigint} a
 * @returns {bigint}
 */
export function controllaImporto(a) {
  if (typeof a === 'number') {
    if (!Number.isSafeInteger(a)) throw new TypeError('importo: atteso un intero');
    a = BigInt(a);
  }
  if (typeof a !== 'bigint') throw new TypeError('importo: atteso un intero');
  if (a < 0n || a > IMPORTO_MAX) throw new RangeError('importo fuori da [0, 2^64)');
  return a;
}

/**
 * Maschera in [0, ordine), o errore.
 * @param {bigint} b
 */
export function controllaMaschera(b) {
  if (typeof b !== 'bigint' || b < 0n || b >= ORDINE) throw new RangeError('maschera fuori da [0, ordine)');
}

/**
 * C = b·G + a·H come punto.
 * @param {number | bigint} a  importo
 * @param {bigint} b           maschera
 */
function puntoImpegno(a, b) {
  const importo = controllaImporto(a);
  controllaMaschera(b);
  let C = Punto.ZERO;
  if (b !== 0n) C = C.add(G.multiply(b));
  if (importo !== 0n) C = C.add(H.multiply(importo));
  return C;
}

/**
 * Impegno esadecimale di un importo con la sua maschera.
 * @param {number | bigint} a
 * @param {bigint} b
 * @returns {string}
 */
export function impegno(a, b) {
  return puntoImpegno(a, b).toHex();
}

/**
 * Impegno implicito di un importo in chiaro: a·H, maschera zero.
 * @param {number | bigint} a
 * @returns {string}
 */
export function impegnoInChiaro(a) {
  return impegno(a, 0n);
}

/**
 * Maschera derivata dal segreto condiviso dell'uscita. Chi paga e chi riceve
 * ottengono la stessa; nessun altro la conosce.
 * @param {bigint} k
 * @returns {bigint}
 */
export function mascheraDaSegreto(k) {
  return scalareDaBytes(sha512(concatBytes(codifica.encode('manti/maschera/v1'), numberToBytesLE(k, 32))));
}

/**
 * Maschera casuale, per gli pseudo-impegni e per i test.
 * @returns {bigint}
 */
export function mascheraCasuale() {
  return scalareDaBytes(randomBytes(64));
}

/**
 * @param {bigint} k
 */
function chiaveImporto(k) {
  return sha512(concatBytes(codifica.encode('manti/importo/v1'), numberToBytesLE(k, 32))).subarray(0, BYTES_IMPORTO);
}

/**
 * Importo cifrato per il destinatario: 8 byte in XOR con una chiave da k.
 * Non è autenticato: un importo manomesso si scopre perché non torna con
 * l'impegno, che è la vera prova.
 * @param {bigint} k
 * @param {number | bigint} a
 * @returns {string} 16 caratteri esadecimali
 */
export function cifraImporto(k, a) {
  const chiaro = numberToBytesLE(controllaImporto(a), BYTES_IMPORTO);
  const chiave = chiaveImporto(k);
  return bytesToHex(chiaro.map((byte, i) => byte ^ chiave[i]));
}

/**
 * Importo in chiaro dal cifrato. Restituisce null se il campo è malformato.
 * Un k sbagliato dà un numero qualsiasi: va controllato contro l'impegno.
 * @param {bigint} k
 * @param {string} cifrato
 * @returns {bigint | null}
 */
export function decifraImporto(k, cifrato) {
  if (typeof cifrato !== 'string' || !/^[0-9a-f]{16}$/.test(cifrato)) return null;
  const chiave = chiaveImporto(k);
  return bytesToNumberLE(hexToBytes(cifrato).map((byte, i) => byte ^ chiave[i]));
}

/**
 * Il destinatario apre un'uscita riservata con il suo k: importo e maschera,
 * o null se l'importo cifrato non torna con l'impegno.
 * @param {{ commit: string, amt: string }} uscita
 * @param {bigint} k
 * @returns {{ a: bigint, b: bigint } | null}
 */
export function apriUscita(uscita, k) {
  const a = decifraImporto(k, uscita.amt);
  if (a === null) return null;
  const b = mascheraDaSegreto(k);
  return impegno(a, b) === uscita.commit ? { a, b } : null;
}

/**
 * Somma di scalari modulo l'ordine.
 * @param {bigint[]} scalari
 * @returns {bigint}
 */
export function sommaMaschere(scalari) {
  return scalari.reduce((acc, x) => (acc + x) % ORDINE, 0n);
}

/**
 * Maschere per gli pseudo-impegni di n entrate, scelte in modo che il
 * bilancio torni: la loro somma è uguale alla somma delle maschere delle
 * uscite riservate. Le prime n−1 sono casuali, l'ultima fa quadrare.
 * @param {bigint[]} maschereUscite
 * @param {number} n  numero di entrate in anello, almeno 1
 * @returns {bigint[]}
 */
export function mascherePseudo(maschereUscite, n) {
  if (!Number.isInteger(n) || n < 1) throw new RangeError('servono almeno un\'entrata');
  const libere = Array.from({ length: n - 1 }, mascheraCasuale);
  const ultima = (sommaMaschere(maschereUscite) - sommaMaschere(libere) + ORDINE) % ORDINE;
  return [...libere, ultima];
}

/**
 * @param {string[]} hex
 */
function sommaPunti(hex) {
  return hex.reduce((acc, h) => acc.add(Punto.fromHex(h)), Punto.ZERO);
}

/**
 * Il bilancio di una riga, senza leggere gli importi riservati:
 *   Σ pseudo + (Σ entrate in chiaro)·H  ==  Σ impegni uscite + (Σ uscite in chiaro)·H
 * Le uscite in chiaro comprendono le bruciature. Lancia se un impegno non è
 * un punto valido; restituisce false se i conti non tornano.
 * @param {{ pseudo?: string[], entrateChiare?: Array<number | bigint>, uscite?: string[], usciteChiare?: Array<number | bigint> }} riga
 * @returns {boolean}
 */
export function bilancio({ pseudo = [], entrateChiare = [], uscite = [], usciteChiare = [] }) {
  const inChiaro = (importi) => {
    const somma = importi.reduce((acc, a) => acc + controllaImporto(a), 0n);
    return somma === 0n ? Punto.ZERO : H.multiply(somma);
  };
  const sinistra = sommaPunti(pseudo).add(inChiaro(entrateChiare));
  const destra = sommaPunti(uscite).add(inChiaro(usciteChiare));
  return sinistra.equals(destra);
}
