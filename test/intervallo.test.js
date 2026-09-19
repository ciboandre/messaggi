import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519.js';
import { provaIntervallo, verificaIntervallo, Gi, Hi, BIT, GIRI } from '../nucleo/intervallo.js';
import { H, impegno, mascheraCasuale, IMPORTO_MAX } from '../nucleo/impegni.js';

const Punto = ed25519.Point;
const G = Punto.BASE;
const ORDINE = Punto.Fn.ORDER;
/** Impegno senza il controllo dell'intervallo, per costruire i casi che devono cadere. */
const impegnoGrezzo = (a, b) => G.multiply(b).add(H.multiply(((a % ORDINE) + ORDINE) % ORDINE)).toHex();

test('generatori: 64 + 64, tutti distinti, distinti da G e H, nel sottogruppo', () => {
  const tutti = [G, H, ...Gi, ...Hi].map((P) => P.toHex());
  assert.equal(new Set(tutti).size, 2 + 2 * BIT);
  for (const P of [...Gi, ...Hi]) assert.ok(P.isTorsionFree());
  // fissi: se cambiano, nessuna prova nel registro verifica più
  assert.equal(Gi[0].toHex(), '24732cba147c95758243dd29ac14cbff796c7357b045016b98b1eb60b0d235c1');
  assert.equal(Hi[63].toHex(), '87314428899d2068f89890263a05716ed345dcfcdad000091bd9082c55ee7b24');
});

test('una prova onesta passa, per 0, 1, un importo normale e il massimo', () => {
  for (const a of [0n, 1n, 1500n, 123456789012n, IMPORTO_MAX]) {
    const b = mascheraCasuale();
    const prova = provaIntervallo(a, b);
    assert.equal(prova.L.length, GIRI);
    assert.ok(verificaIntervallo(impegno(a, b), prova), `importo ${a}`);
  }
});

test('la prova è legata all\'impegno: altro importo o altra maschera non passano', () => {
  const b = mascheraCasuale();
  const prova = provaIntervallo(1500, b);
  assert.ok(!verificaIntervallo(impegno(1501, b), prova));
  assert.ok(!verificaIntervallo(impegno(1500, mascheraCasuale()), prova));
  assert.ok(!verificaIntervallo(impegno(1500, 0n), prova));
});

test('un importo fuori intervallo non ha prova: 2^64 + 5 con i bit di 5, e −1', () => {
  const b = mascheraCasuale();
  const provaDi5 = provaIntervallo(5, b);
  assert.ok(verificaIntervallo(impegno(5, b), provaDi5));
  assert.ok(!verificaIntervallo(impegnoGrezzo((1n << 64n) + 5n, b), provaDi5));
  assert.ok(!verificaIntervallo(impegnoGrezzo(-1n, b), provaDi5));
  assert.ok(!verificaIntervallo(impegnoGrezzo(-1n, b), provaIntervallo(IMPORTO_MAX, b)));
  assert.throws(() => provaIntervallo(-1n, b), RangeError);
  assert.throws(() => provaIntervallo(IMPORTO_MAX + 1n, b), RangeError);
});

test('ogni campo manomesso fa cadere la prova; una prova malformata non lancia', () => {
  const b = mascheraCasuale();
  const C = impegno(1500, b);
  const prova = provaIntervallo(1500, b);
  const altro = provaIntervallo(1500, b);
  assert.notEqual(prova.A, altro.A, 'due prove dello stesso impegno sono diverse');
  assert.ok(verificaIntervallo(C, altro));
  for (const campo of ['A', 'A1', 'B', 'r', 's', 'd']) {
    assert.ok(!verificaIntervallo(C, { ...prova, [campo]: altro[campo] }), campo);
  }
  for (let i = 0; i < GIRI; i++) {
    assert.ok(!verificaIntervallo(C, { ...prova, L: prova.L.map((x, j) => (j === i ? altro.L[i] : x)) }), `L${i}`);
    assert.ok(!verificaIntervallo(C, { ...prova, R: prova.R.map((x, j) => (j === i ? altro.R[i] : x)) }), `R${i}`);
  }
  assert.ok(!verificaIntervallo(C, { ...prova, L: prova.L.slice(1) }));
  assert.ok(!verificaIntervallo(C, { ...prova, r: 'zz' }));
  assert.ok(!verificaIntervallo(C, { ...prova, A: '00' }));
  assert.ok(!verificaIntervallo(C, { ...prova, r: 'ff'.repeat(32) }), 'scalare oltre l\'ordine');
  assert.ok(!verificaIntervallo('00', prova));
  assert.ok(!verificaIntervallo(C, null));
  assert.ok(!verificaIntervallo(C, 'prova'));
});

test('un impegno con torsione viene rifiutato', () => {
  const b = mascheraCasuale();
  const prova = provaIntervallo(1500, b);
  const torsione = Punto.fromHex('c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a'); // ordine 8
  assert.ok(!torsione.isTorsionFree());
  assert.ok(!verificaIntervallo(Punto.fromHex(impegno(1500, b)).add(torsione).toHex(), prova));
});

test('dimensione: 15 punti e 3 scalari, sotto 1,3 KB in JSON', () => {
  const prova = provaIntervallo(1500, mascheraCasuale());
  assert.equal(1 + prova.L.length + prova.R.length + 2, 15);
  assert.equal(Object.keys(prova).length, 8);
  assert.ok(JSON.stringify(prova).length < 1300);
});
