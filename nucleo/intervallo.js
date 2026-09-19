// Prova di intervallo: l'importo dietro un impegno sta in [0, 2^64),
// senza dire quale. È Bulletproofs+ (Chung, Han, Ju, Kim, Seo 2020) per un
// solo impegno, scritto per esteso. ARCHITETTURA.md, sezioni 3 e 6.
//
// L'idea in tre righe. L'importo a si scrive in 64 bit aL; aR = aL − 1.
// Che ogni bit sia 0 o 1 equivale a tre uguaglianze su vettori, che con due
// sfide y e z si fondono in un solo prodotto scalare pesato
//   <aL', aR'>_y = a·z²·y^65 + δ(y, z)
// dove δ lo calcola anche chi verifica. L'argomento del prodotto scalare
// pesato (WIP) prova quell'uguaglianza dimezzando i vettori sei volte: da 64
// a 1. Ogni dimezzamento costa due punti L, R; il passo finale tre scalari.
//
// Basi: G maschera, H importo (impegni.js), più Gi e Hi, 64 e 64, ricavati
// per hash-to-curve da etichette fisse. Nessuno ne conosce le relazioni.
//
// Le sfide vengono da una trascrizione Fiat–Shamir: uno stato di 64 byte che
// assorbe l'impegno e ogni punto mandato, in ordine. Chi verifica la
// ricostruisce; se un punto è diverso, le sfide cambiano e la prova cade.
//
// Solo un impegno per prova, per ora: aggregare più uscite in una prova
// sola (m·64 bit) è il passo 9b.

import { ed25519, ed25519_hasher } from '@noble/curves/ed25519.js';
import { concatBytes, numberToBytesLE, randomBytes } from '@noble/curves/utils.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { scalareDaBytes } from './chiavi.js';
import { H, controllaImporto } from './impegni.js';

const Punto = ed25519.Point;
const G = Punto.BASE;
const ORDINE = Punto.Fn.ORDER;
const codifica = new TextEncoder();

export const BIT = 64;
export const GIRI = Math.log2(BIT); // 6
const RE_HEX64 = /^[0-9a-f]{64}$/;

// ── aritmetica sugli scalari ─────────────────────────────────────────────

const mod = (x) => ((x % ORDINE) + ORDINE) % ORDINE;
const mul = (x, y) => mod(x * y);
const inv = (x) => Punto.Fn.inv(mod(x));
const pow = (x, n) => {
  let r = 1n;
  for (let i = 0; i < n; i++) r = mul(r, x);
  return r;
};
const scalareCasuale = () => scalareDaBytes(randomBytes(64));

/** Moltiplicazione che accetta lo zero. */
const per = (P, k) => (mod(k) === 0n ? Punto.ZERO : P.multiply(mod(k)));
/** Σ k_i·P_i */
const combina = (scalari, punti) => scalari.reduce((acc, k, i) => acc.add(per(punti[i], k)), Punto.ZERO);
/** Σ a_i b_i y^i, con i da 1 */
const prodottoPesato = (a, b, y) => {
  let somma = 0n;
  let yi = 1n;
  for (let i = 0; i < a.length; i++) {
    yi = mul(yi, y);
    somma = mod(somma + mul(mul(a[i], b[i]), yi));
  }
  return somma;
};

// ── generatori ───────────────────────────────────────────────────────────

const generatore = (etichetta) => ed25519_hasher.hashToCurve(codifica.encode(etichetta), { DST: 'manti/intervallo/v1' });
export const Gi = Array.from({ length: BIT }, (_, i) => generatore(`manti/Gi/v1/${i}`));
export const Hi = Array.from({ length: BIT }, (_, i) => generatore(`manti/Hi/v1/${i}`));

// ── trascrizione ─────────────────────────────────────────────────────────

class Trascrizione {
  constructor() {
    this.stato = sha512(codifica.encode('manti/intervallo/v1'));
  }
  /** @param {string} etichetta @param {...import('@noble/curves/abstract/edwards.js').EdwardsPoint} punti */
  assorbi(etichetta, ...punti) {
    this.stato = sha512(concatBytes(codifica.encode(etichetta), this.stato, ...punti.map((p) => p.toBytes())));
  }
  sfida() {
    return scalareDaBytes(this.stato);
  }
  /** Sfida dal solo stato, per z dopo y. */
  sfidaDerivata(etichetta) {
    this.assorbi(etichetta);
    return this.sfida();
  }
}

// ── la prova ─────────────────────────────────────────────────────────────

/**
 * @typedef {object} Prova
 * @property {string} A     impegno ai bit
 * @property {string[]} L   un punto per giro
 * @property {string[]} R   un punto per giro
 * @property {string} A1    passo finale
 * @property {string} B     passo finale
 * @property {string} r     scalare esadecimale, 32 byte little-endian
 * @property {string} s
 * @property {string} d
 */

const scalareHex = (k) => Buffer.from(numberToBytesLE(mod(k), 32)).toString('hex');
const scalareDaHex = (hex) => {
  if (typeof hex !== 'string' || !RE_HEX64.test(hex)) throw new Error('prova: scalare malformato');
  const k = BigInt('0x' + Buffer.from(hex, 'hex').reverse().toString('hex'));
  if (k >= ORDINE) throw new Error('prova: scalare fuori dall\'ordine');
  return k;
};
const puntoDaHex = (hex) => {
  if (typeof hex !== 'string' || !RE_HEX64.test(hex)) throw new Error('prova: punto malformato');
  const P = Punto.fromHex(hex);
  if (!P.isTorsionFree()) throw new Error('prova: punto fuori dal sottogruppo');
  return P;
};

/**
 * Il termine che chi verifica calcola da solo:
 *   δ = (z − z²)·Σ_{i=1..n} y^i − z³·y^{n+1}·(2^n − 1)
 * @param {bigint} y @param {bigint} z
 */
function delta(y, z) {
  let sommaY = 0n;
  let yi = 1n;
  for (let i = 0; i < BIT; i++) {
    yi = mul(yi, y);
    sommaY = mod(sommaY + yi);
  }
  const yn1 = mul(yi, y);
  const z2 = mul(z, z);
  return mod(mul(mod(z - z2), sommaY) - mul(mul(z2, z), mul(yn1, mod((1n << BigInt(BIT)) - 1n))));
}

/**
 * I coefficienti pubblici con cui Â si ottiene da A e V:
 *   Â = A − z·ΣGi + Σ(z + 2^i z² y^{n−i})·Hi + δ·H + z²·y^{n+1}·V
 * @param {bigint} y @param {bigint} z
 */
function coefficientiAcappello(y, z) {
  const z2 = mul(z, z);
  const yn1 = pow(y, BIT + 1);
  const suHi = Array.from({ length: BIT }, (_, i) => mod(z + mul(mul(z2, 1n << BigInt(i)), pow(y, BIT - i))));
  return { suHi, sulValore: delta(y, z), suV: mul(z2, yn1), z2yn1: mul(z2, yn1) };
}

/**
 * Prova che l'impegno b·G + a·H nasconde a ∈ [0, 2^64).
 * @param {number | bigint} a  importo
 * @param {bigint} b           maschera
 * @returns {Prova}
 */
export function provaIntervallo(a, b) {
  const importo = controllaImporto(a);
  const V = per(G, b).add(per(H, importo));

  // bit dell'importo, e aR = aL − 1
  const aL = Array.from({ length: BIT }, (_, i) => (importo >> BigInt(i)) & 1n);
  const aR = aL.map((bit) => mod(bit - 1n));
  const alpha = scalareCasuale();
  const A = combina(aL, Gi).add(combina(aR, Hi)).add(per(G, alpha));

  const tr = new Trascrizione();
  tr.assorbi('V', V);
  tr.assorbi('A', A);
  const y = tr.sfida();
  const z = tr.sfidaDerivata('z');

  // vettori spostati e maschera aggiornata: da qui in poi è un WIP
  const { suHi, z2yn1 } = coefficientiAcappello(y, z);
  let a1 = aL.map((x) => mod(x - z));
  let b1 = aR.map((x, i) => mod(x + suHi[i]));
  let alphaCappello = mod(alpha + mul(z2yn1, b));
  let gi = Gi.slice();
  let hi = Hi.slice();

  const L = [];
  const R = [];
  let n = BIT;
  while (n > 1) {
    const m = n / 2;
    const ym = pow(y, m);
    const yInvM = inv(ym);
    const aSx = a1.slice(0, m); const aDx = a1.slice(m);
    const bSx = b1.slice(0, m); const bDx = b1.slice(m);
    const gSx = gi.slice(0, m); const gDx = gi.slice(m);
    const hSx = hi.slice(0, m); const hDx = hi.slice(m);

    const cL = prodottoPesato(aSx, bDx, y);
    const cR = mul(ym, prodottoPesato(aDx, bSx, y));
    const dL = scalareCasuale();
    const dR = scalareCasuale();
    const Lp = combina(aSx.map((x) => mul(x, yInvM)), gDx).add(combina(bDx, hSx)).add(per(H, cL)).add(per(G, dL));
    const Rp = combina(aDx.map((x) => mul(x, ym)), gSx).add(combina(bSx, hDx)).add(per(H, cR)).add(per(G, dR));
    L.push(Lp); R.push(Rp);

    tr.assorbi('LR', Lp, Rp);
    const e = tr.sfida();
    const eInv = inv(e);
    const e2 = mul(e, e);

    a1 = aSx.map((x, i) => mod(mul(e, x) + mul(mul(eInv, ym), aDx[i])));
    b1 = bSx.map((x, i) => mod(mul(eInv, x) + mul(e, bDx[i])));
    gi = gSx.map((P, i) => per(P, eInv).add(per(gDx[i], mul(e, yInvM))));
    hi = hSx.map((P, i) => per(P, e).add(per(hDx[i], eInv)));
    alphaCappello = mod(alphaCappello + mul(e2, dL) + mul(mul(eInv, eInv), dR));
    n = m;
  }

  // passo finale su un solo elemento
  const [av] = a1; const [bv] = b1; const [g1] = gi; const [h1] = hi;
  const r = scalareCasuale(); const s = scalareCasuale();
  const dlt = scalareCasuale(); const eta = scalareCasuale();
  const A1 = per(g1, r).add(per(h1, s)).add(per(H, mul(y, mod(mul(r, bv) + mul(s, av))))).add(per(G, dlt));
  const B = per(H, mul(y, mul(r, s))).add(per(G, eta));
  tr.assorbi('AB', A1, B);
  const e = tr.sfida();

  return {
    A: A.toHex(),
    L: L.map((P) => P.toHex()),
    R: R.map((P) => P.toHex()),
    A1: A1.toHex(),
    B: B.toHex(),
    r: scalareHex(r + mul(av, e)),
    s: scalareHex(s + mul(bv, e)),
    d: scalareHex(eta + mul(dlt, e) + mul(alphaCappello, mul(e, e))),
  };
}

/**
 * Verifica una prova contro un impegno esadecimale. Restituisce false per
 * qualsiasi prova che non regge, malformata compresa: non lancia mai.
 * @param {string} commit
 * @param {Prova} prova
 * @returns {boolean}
 */
export function verificaIntervallo(commit, prova) {
  try {
    if (!prova || typeof prova !== 'object') return false;
    if (!Array.isArray(prova.L) || !Array.isArray(prova.R) || prova.L.length !== GIRI || prova.R.length !== GIRI) return false;
    const V = puntoDaHex(commit);
    const A = puntoDaHex(prova.A);
    const L = prova.L.map(puntoDaHex);
    const R = prova.R.map(puntoDaHex);
    const A1 = puntoDaHex(prova.A1);
    const B = puntoDaHex(prova.B);
    const r = scalareDaHex(prova.r);
    const s = scalareDaHex(prova.s);
    const d = scalareDaHex(prova.d);

    const tr = new Trascrizione();
    tr.assorbi('V', V);
    tr.assorbi('A', A);
    const y = tr.sfida();
    const z = tr.sfidaDerivata('z');

    const { suHi, sulValore, suV } = coefficientiAcappello(y, z);
    let P = A.add(per(combina(Array(BIT).fill(1n), Gi), mod(-z)))
      .add(combina(suHi, Hi))
      .add(per(H, sulValore))
      .add(per(V, suV));
    let gi = Gi.slice();
    let hi = Hi.slice();

    let n = BIT;
    for (let giro = 0; giro < GIRI; giro++) {
      const m = n / 2;
      const ym = pow(y, m);
      const yInvM = inv(ym);
      tr.assorbi('LR', L[giro], R[giro]);
      const e = tr.sfida();
      const eInv = inv(e);
      P = P.add(per(L[giro], mul(e, e))).add(per(R[giro], mul(eInv, eInv)));
      gi = gi.slice(0, m).map((Pg, i) => per(Pg, eInv).add(per(gi[m + i], mul(e, yInvM))));
      hi = hi.slice(0, m).map((Ph, i) => per(Ph, e).add(per(hi[m + i], eInv)));
      n = m;
    }

    tr.assorbi('AB', A1, B);
    const e = tr.sfida();
    const sinistra = per(P, mul(e, e)).add(per(A1, e)).add(B);
    const destra = per(gi[0], mul(e, r)).add(per(hi[0], mul(e, s))).add(per(H, mul(y, mul(r, s)))).add(per(G, d));
    return sinistra.equals(destra);
  } catch {
    return false;
  }
}
