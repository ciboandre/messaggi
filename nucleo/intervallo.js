// Prova di intervallo: gli importi dietro m impegni stanno in [0, 2^64),
// senza dire quali. È Bulletproofs+ (Chung, Han, Ju, Kim, Seo 2020),
// aggregato, scritto per esteso. ARCHITETTURA.md, sezioni 3 e 6.
//
// L'idea in tre righe. Ogni importo a_j si scrive in 64 bit; i bit di tutte
// le uscite si mettono in fila in un vettore aL di N = 64·m elementi,
// aR = aL − 1. Che ogni bit sia 0 o 1 e che i bit sommino agli importi
// equivale a uguaglianze su vettori che, con due sfide y e z, si fondono in
// un solo prodotto scalare pesato
//   <aL', aR'>_y = y^{N+1}·Σ_j z^{2+j}·a_j + δ(y, z)
// dove δ lo calcola anche chi verifica. L'argomento del prodotto scalare
// pesato (WIP) prova quell'uguaglianza dimezzando i vettori log₂(N) volte,
// fino a 1. Ogni dimezzamento costa due punti L, R; il passo finale tre
// scalari. Il ripiegamento non sa quante uscite ci sono sotto.
//
// Potenze di z: l'uscita j (da 0) pesa z^{2+j}, come nei Bulletproofs
// originali. Serve solo che bit, coerenza aL − aR = 1 e i vincoli di valore
// stiano a potenze diverse: z⁰, z¹, z², z³, …
//
// m deve essere una potenza di 2. Chi ha meno uscite riempie con impegni
// all'identità (importo 0, maschera 0): riempi() lo fa. Il riempimento fa
// parte della dichiarazione ed entra nella trascrizione come tutto il resto.
//
// Basi: G maschera, H importo (impegni.js), più Gi e Hi ricavati per
// hash-to-curve da etichette fisse, generati quando servono. Nessuno ne
// conosce le relazioni.
//
// Le sfide vengono da una trascrizione Fiat–Shamir: uno stato di 64 byte che
// assorbe gli impegni e ogni punto mandato, in ordine. Chi verifica la
// ricostruisce; se un punto è diverso, le sfide cambiano e la prova cade.
//
// Chi prova non è a tempo costante: sotto ci sono i BigInt di JavaScript.
// Però nessuna istruzione ramifica sul segreto: i bit degli importi entrano
// in A come scalari 1 o 2, mai come "salta se zero". Chi verifica lavora
// solo su dati pubblici: non ripiega i generatori punto per punto, ma
// calcola per ogni base uno scalare solo (prodotto delle sfide e^{±1} e
// delle potenze di y lungo il suo cammino) e fa un'unica combinazione
// lineare, che deve dare l'identità.

import { ed25519, ed25519_hasher } from '@noble/curves/ed25519.js';
import { pippenger } from '@noble/curves/abstract/curve.js';
import { concatBytes, numberToBytesLE, randomBytes } from '@noble/curves/utils.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { scalareDaBytes } from './chiavi.js';
import { H, controllaImporto, controllaMaschera } from './impegni.js';

const Punto = ed25519.Point;
const G = Punto.BASE;
const ORDINE = Punto.Fn.ORDER;
const codifica = new TextEncoder();

export const BIT = 64;
export const USCITE_MAX = 16; // N = 1024, 10 giri
const RE_HEX64 = /^[0-9a-f]{64}$/;
const IDENTITA = Punto.ZERO.toHex();

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

/** Moltiplicazione su scalari pubblici: accetta lo zero, non è a tempo costante. */
const per = (P, k) => P.multiplyUnsafe(mod(k));
/** Σ k_i·P_i, scalari pubblici. */
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
const potenzaDiDue = (m) => Number.isInteger(m) && m >= 1 && (m & (m - 1)) === 0;

// ── generatori ───────────────────────────────────────────────────────────

const generatore = (etichetta) => ed25519_hasher.hashToCurve(codifica.encode(etichetta), { DST: 'manti/intervallo/v1' });
/** @type {import('@noble/curves/abstract/edwards.js').EdwardsPoint[]} */
export const Gi = [];
/** @type {import('@noble/curves/abstract/edwards.js').EdwardsPoint[]} */
export const Hi = [];
const Qi = []; // Gi + Hi
const sommeGi = [Punto.ZERO]; // sommeGi[n] = Σ_{i<n} Gi
const sommeHi = [Punto.ZERO];
const sommeQi = [Punto.ZERO];

/** Estende i generatori fino a N. Costano un hash-to-curve l'uno, una volta. */
function generatori(N) {
  for (let i = Gi.length; i < N; i++) {
    Gi.push(generatore(`manti/Gi/v1/${i}`));
    Hi.push(generatore(`manti/Hi/v1/${i}`));
    Qi.push(Gi[i].add(Hi[i]));
    sommeGi.push(sommeGi[i].add(Gi[i]));
    sommeHi.push(sommeHi[i].add(Hi[i]));
    sommeQi.push(sommeQi[i].add(Qi[i]));
  }
}
generatori(BIT);

// ── trascrizione ─────────────────────────────────────────────────────────
//
// stato₀ = SHA-512("manti/intervallo/v1")
// statoₖ = SHA-512(len(etichetta) ‖ etichetta ‖ statoₖ₋₁ ‖ n ‖ punto₁ ‖ … ‖ puntoₙ)
// con len e n su un byte ciascuno, e ogni punto nei suoi 32 byte canonici.
// I prefissi di lunghezza evitano che due sequenze diverse producano gli
// stessi byte da hashare. Gli impegni entrano tutti insieme, riempimento
// compreso: n è il loro numero.

class Trascrizione {
  constructor() {
    this.stato = sha512(codifica.encode('manti/intervallo/v1'));
  }
  /** @param {string} etichetta @param {...import('@noble/curves/abstract/edwards.js').EdwardsPoint} punti */
  assorbi(etichetta, ...punti) {
    const nome = codifica.encode(etichetta);
    if (nome.length > 255 || punti.length > 255) throw new RangeError('trascrizione: etichetta o punti oltre 255');
    this.stato = sha512(concatBytes(
      Uint8Array.of(nome.length), nome, this.stato,
      Uint8Array.of(punti.length), ...punti.map((p) => p.toBytes()),
    ));
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
 * @property {string[]} L   un punto per giro, log₂(64·m) giri
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
  const P = Punto.fromHex(hex, false);
  // una sola codifica per punto: altrimenti la stessa prova avrebbe più forme
  if (P.toHex() !== hex) throw new Error('prova: codifica non canonica');
  if (!P.isTorsionFree()) throw new Error('prova: punto fuori dal sottogruppo');
  return P;
};

/**
 * Riempie una lista di impegni fino alla potenza di 2 successiva con
 * l'impegno all'identità. Chi verifica riceve la lista riempita.
 * @param {string[]} commits
 * @returns {string[]}
 */
export function riempi(commits) {
  if (!Array.isArray(commits) || commits.length < 1) throw new RangeError('serve almeno un impegno');
  let m = 1;
  while (m < commits.length) m *= 2;
  if (m > USCITE_MAX) throw new RangeError(`al massimo ${USCITE_MAX} impegni per prova`);
  return [...commits, ...Array(m - commits.length).fill(IDENTITA)];
}

/**
 * I coefficienti pubblici, per m uscite (N = 64·m):
 *   c_i   = z + z^{2+j}·2^k·y^{N−i}        per i = 64·j + k, da 0
 *   δ     = (z − z²)·Σ_{i=1..N} y^i − y^{N+1}·(2^64 − 1)·Σ_j z^{3+j}
 *   Â     = A − z·ΣGi + Σ c_i·Hi + δ·H + y^{N+1}·Σ_j z^{2+j}·V_j
 * @param {bigint} y @param {bigint} z @param {number} m
 */
function coefficienti(y, z, m) {
  const N = BIT * m;
  // potenze di y da 0 a N+1
  const yPot = [1n];
  for (let i = 1; i <= N + 1; i++) yPot.push(mul(yPot[i - 1], y));
  const yN1 = yPot[N + 1];
  let sommaY = 0n;
  for (let i = 1; i <= N; i++) sommaY = mod(sommaY + yPot[i]);
  // z^{2+j} per ogni uscita
  const zV = [];
  let zj = mul(z, z);
  for (let j = 0; j < m; j++) { zV.push(zj); zj = mul(zj, z); }
  const sommaZ3 = zV.reduce((acc, x) => mod(acc + mul(x, z)), 0n);
  const suHi = Array.from({ length: N }, (_, i) => {
    const j = Math.floor(i / BIT);
    const k = i % BIT;
    return mod(z + mul(mul(zV[j], 1n << BigInt(k)), yPot[N - i]));
  });
  const delta = mod(mul(mod(z - mul(z, z)), sommaY) - mul(mul(yN1, (1n << BigInt(BIT)) - 1n), sommaZ3));
  return { N, suHi, delta, suV: zV.map((x) => mul(x, yN1)) };
}

/**
 * Prova che gli impegni b_j·G + a_j·H nascondono a_j ∈ [0, 2^64).
 * Le uscite vengono riempite fino alla potenza di 2 successiva con
 * (0, 0); la prova si verifica contro riempi(impegni).
 * @param {Array<{ a: number | bigint, b: bigint }>} uscite
 * @returns {Prova}
 */
export function provaIntervalli(uscite) {
  if (!Array.isArray(uscite) || uscite.length < 1) throw new RangeError('serve almeno un\'uscita');
  const valori = uscite.map(({ a, b }) => { controllaMaschera(b); return { a: controllaImporto(a), b }; });
  const m = riempi(uscite.map(() => IDENTITA)).length;
  while (valori.length < m) valori.push({ a: 0n, b: 0n });
  const N = BIT * m;
  generatori(N);
  const V = valori.map(({ a, b }) => per(G, b).add(per(H, a)));

  // bit degli importi in fila, e aR = aL − 1. A = <aL,Gi> + <aR,Hi> + α·G si riscrive
  //   A = α·G − ΣHi − ΣQi + Σ (aL_i + 1)·Qi      con Qi = Gi + Hi
  // così ogni bit costa una moltiplicazione vera per 1 o per 2, senza rami.
  const aL = valori.flatMap(({ a }) => Array.from({ length: BIT }, (_, k) => (a >> BigInt(k)) & 1n));
  const aR = aL.map((bit) => mod(bit - 1n));
  const alpha = scalareCasuale();
  const A = aL.reduce((acc, bit, i) => acc.add(Qi[i].multiply(bit + 1n)), G.multiply(alpha))
    .subtract(sommeHi[N]).subtract(sommeQi[N]);

  const tr = new Trascrizione();
  tr.assorbi('V', ...V);
  tr.assorbi('A', A);
  const y = tr.sfida();
  const z = tr.sfidaDerivata('z');

  // vettori spostati e maschera aggiornata: da qui in poi è un WIP
  const { suHi, suV } = coefficienti(y, z, m);
  let a1 = aL.map((x) => mod(x - z));
  let b1 = aR.map((x, i) => mod(x + suHi[i]));
  let alphaCappello = valori.reduce((acc, { b }, j) => mod(acc + mul(suV[j], b)), alpha);
  let gi = Gi.slice(0, N);
  let hi = Hi.slice(0, N);

  const L = [];
  const R = [];
  let n = N;
  while (n > 1) {
    const mezzo = n / 2;
    const ym = pow(y, mezzo);
    const yInvM = inv(ym);
    const aSx = a1.slice(0, mezzo); const aDx = a1.slice(mezzo);
    const bSx = b1.slice(0, mezzo); const bDx = b1.slice(mezzo);
    const gSx = gi.slice(0, mezzo); const gDx = gi.slice(mezzo);
    const hSx = hi.slice(0, mezzo); const hDx = hi.slice(mezzo);

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
    n = mezzo;
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
 * Prova per un solo impegno.
 * @param {number | bigint} a @param {bigint} b
 * @returns {Prova}
 */
export function provaIntervallo(a, b) {
  return provaIntervalli([{ a, b }]);
}

/**
 * Verifica una prova contro una lista di impegni esadecimali, già riempita
 * a una potenza di 2. Restituisce false per qualsiasi prova che non regge,
 * malformata compresa: non lancia mai.
 * @param {string[]} commits
 * @param {Prova} prova
 * @returns {boolean}
 */
export function verificaIntervalli(commits, prova) {
  try {
    return verificaOLancia(commits, prova);
  } catch {
    return false;
  }
}

/**
 * Verifica per un solo impegno.
 * @param {string} commit @param {Prova} prova
 * @returns {boolean}
 */
export function verificaIntervallo(commit, prova) {
  return verificaIntervalli([commit], prova);
}

/**
 * Come verificaIntervalli, ma lancia sugli input malformati invece di
 * rispondere false. Serve ai test per distinguere "prova che non regge" da
 * "errore nel codice".
 * @param {string[]} commits
 * @param {Prova} prova
 * @returns {boolean}
 */
export function verificaOLancia(commits, prova) {
  if (!Array.isArray(commits) || !potenzaDiDue(commits.length) || commits.length > USCITE_MAX) {
    throw new RangeError(`impegni: serve una potenza di 2 fino a ${USCITE_MAX}`);
  }
  const m = commits.length;
  const N = BIT * m;
  const giri = Math.log2(N);
  if (!prova || typeof prova !== 'object') throw new TypeError('prova: atteso un oggetto');
  if (!Array.isArray(prova.L) || !Array.isArray(prova.R) || prova.L.length !== giri || prova.R.length !== giri) {
    throw new Error(`prova: servono ${giri} L e ${giri} R`);
  }
  const V = commits.map(puntoDaHex);
  const A = puntoDaHex(prova.A);
  const L = prova.L.map(puntoDaHex);
  const R = prova.R.map(puntoDaHex);
  const A1 = puntoDaHex(prova.A1);
  const B = puntoDaHex(prova.B);
  const r = scalareDaHex(prova.r);
  const s = scalareDaHex(prova.s);
  const d = scalareDaHex(prova.d);
  generatori(N);

  const tr = new Trascrizione();
  tr.assorbi('V', ...V);
  tr.assorbi('A', A);
  const y = tr.sfida();
  const z = tr.sfidaDerivata('z');
  const sfide = L.map((Lg, g) => { tr.assorbi('LR', Lg, R[g]); return tr.sfida(); });
  tr.assorbi('AB', A1, B);
  const e = tr.sfida();

  // Il controllo finale è
  //   e²·P + e·A1 + B  ==  (e·r)·g + (e·s)·h + y·r·s·H + d·G
  // con P = Â + Σ_g (e_g²·L_g + e_g⁻²·R_g), g = Σ_i σ_i·Gi, h = Σ_i τ_i·Hi,
  // dove σ_i e τ_i sono i prodotti dei fattori di ripiegamento lungo il
  // cammino dell'indice i: al giro g l'indice sta nella metà bassa
  // (fattore e_g⁻¹ per Gi, e_g per Hi) o alta (e_g·y^{−mezzo}, e_g⁻¹).
  // Portato tutto a sinistra, ogni base ha uno scalare e la somma è zero.
  const { suHi, delta, suV } = coefficienti(y, z, m);
  const e2 = mul(e, e);
  const eInvG = sfide.map(inv);
  const yInv = inv(y);
  const sigma = Array(N).fill(1n);
  const tau = Array(N).fill(1n);
  for (let g = 0; g < giri; g++) {
    const mezzo = N >> (g + 1);
    const altoG = mul(sfide[g], pow(yInv, mezzo));
    for (let i = 0; i < N; i++) {
      const alto = ((i >> (giri - 1 - g)) & 1) === 1;
      sigma[i] = mul(sigma[i], alto ? altoG : eInvG[g]);
      tau[i] = mul(tau[i], alto ? eInvG[g] : sfide[g]);
    }
  }
  const punti = [];
  const scalari = [];
  const aggiungi = (P, k) => { punti.push(P); scalari.push(mod(k)); };
  for (let i = 0; i < N; i++) {
    aggiungi(Gi[i], mul(e2, -z) - mul(mul(e, r), sigma[i]));
    aggiungi(Hi[i], mul(e2, suHi[i]) - mul(mul(e, s), tau[i]));
  }
  aggiungi(A, e2);
  for (let g = 0; g < giri; g++) {
    aggiungi(L[g], mul(e2, mul(sfide[g], sfide[g])));
    aggiungi(R[g], mul(e2, mul(eInvG[g], eInvG[g])));
  }
  V.forEach((Vj, j) => aggiungi(Vj, mul(e2, suV[j])));
  aggiungi(H, mul(e2, delta) - mul(y, mul(r, s)));
  aggiungi(G, -d);
  aggiungi(A1, e);
  aggiungi(B, 1n);
  return pippenger(Punto, punti, scalari).equals(Punto.ZERO);
}
