import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519.js';
import { provaIntervallo, verificaIntervallo, provaIntervalli, verificaIntervalli, verificaOLancia, riempi, Gi, Hi, BIT, USCITE_MAX } from '../nucleo/intervallo.js';

const GIRI = 6;
import { H, impegno, mascheraCasuale, IMPORTO_MAX } from '../nucleo/impegni.js';

const Punto = ed25519.Point;
const G = Punto.BASE;
const ORDINE = Punto.Fn.ORDER;
/** Impegno senza il controllo dell'intervallo, per costruire i casi che devono cadere. */
const impegnoGrezzo = (a, b) => G.multiplyUnsafe(b).add(H.multiplyUnsafe(((a % ORDINE) + ORDINE) % ORDINE)).toHex();

test('generatori: distinti tra loro e da G e H, nel sottogruppo, fissi', () => {
  const tutti = [G, H, ...Gi, ...Hi].map((P) => P.toHex());
  assert.ok(Gi.length >= BIT);
  assert.equal(new Set(tutti).size, 2 + Gi.length + Hi.length);
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
    // la versione che lancia: una prova onesta non deve passare dal catch
    assert.equal(verificaOLancia([impegno(a, b)], prova), true, `importo ${a}`);
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
  assert.throws(() => provaIntervallo(5, ORDINE), RangeError);
  assert.throws(() => provaIntervallo(5, -1n), RangeError);
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
  assert.throws(() => verificaOLancia([C], null), TypeError);
  assert.throws(() => verificaOLancia([C], { ...prova, L: prova.L.slice(1) }), /6 L e 6 R/);
  assert.throws(() => verificaOLancia([C], { ...prova, A: prova.A.toUpperCase() }), /malformato/);
  assert.throws(() => verificaOLancia([C], { ...prova, r: 'ff'.repeat(32) }), /ordine/);
});

test('un impegno con torsione viene rifiutato', () => {
  const b = mascheraCasuale();
  const prova = provaIntervallo(1500, b);
  const torsione = Punto.fromHex('c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a'); // ordine 8
  assert.ok(!torsione.isTorsionFree());
  const conTorsione = Punto.fromHex(impegno(1500, b)).add(torsione).toHex();
  assert.ok(!verificaIntervallo(conTorsione, prova));
  assert.throws(() => verificaOLancia([conTorsione], prova), /sottogruppo/);
});

test('un impegno all\'identità (importo 0, maschera 0) è legittimo', () => {
  const prova = provaIntervallo(0, 0n);
  assert.equal(impegno(0, 0n), Punto.ZERO.toHex());
  assert.equal(verificaOLancia([impegno(0, 0n)], prova), true);
});

test('dimensione: 15 punti e 3 scalari, sotto 1,3 KB in JSON', () => {
  const prova = provaIntervallo(1500, mascheraCasuale());
  assert.equal(1 + prova.L.length + prova.R.length + 2, 15);
  assert.equal(Object.keys(prova).length, 8);
  assert.ok(JSON.stringify(prova).length < 1300);
});

test('aggregata: m = 2 con (0, massimo), m = 3 riempito a 4, m = 8', () => {
  const b = Array.from({ length: 8 }, mascheraCasuale);
  const due = provaIntervalli([{ a: 0n, b: b[0] }, { a: IMPORTO_MAX, b: b[1] }]);
  assert.equal(due.L.length, GIRI + 1);
  assert.equal(verificaOLancia([impegno(0, b[0]), impegno(IMPORTO_MAX, b[1])], due), true);

  const tre = provaIntervalli([{ a: 1, b: b[0] }, { a: 2, b: b[1] }, { a: 3, b: b[2] }]);
  const commits = riempi([impegno(1, b[0]), impegno(2, b[1]), impegno(3, b[2])]);
  assert.equal(commits.length, 4);
  assert.equal(commits[3], Punto.ZERO.toHex());
  assert.equal(tre.L.length, GIRI + 2);
  assert.equal(verificaOLancia(commits, tre), true);

  const otto = b.map((bj, j) => ({ a: BigInt(j) * 1000n, b: bj }));
  const provaOtto = provaIntervalli(otto);
  assert.equal(provaOtto.L.length, GIRI + 3);
  assert.equal(verificaOLancia(otto.map(({ a, b: bj }) => impegno(a, bj)), provaOtto), true);
});

test('aggregata: ordine, riempimento e numero di impegni sono legati alla prova', () => {
  const b = [mascheraCasuale(), mascheraCasuale(), mascheraCasuale()];
  const V = [impegno(10, b[0]), impegno(20, b[1])];
  const prova = provaIntervalli([{ a: 10, b: b[0] }, { a: 20, b: b[1] }]);
  assert.ok(verificaIntervalli(V, prova));
  assert.ok(!verificaIntervalli([V[1], V[0]], prova), 'scambiati');
  assert.ok(!verificaIntervalli([...V, Punto.ZERO.toHex(), Punto.ZERO.toHex()], prova), 'stessa prova, m diverso');
  // riempimento manomesso: al posto di uno zero, un impegno vero
  const tre = provaIntervalli([{ a: 1, b: b[0] }, { a: 2, b: b[1] }, { a: 3, b: b[2] }]);
  const commits = riempi([impegno(1, b[0]), impegno(2, b[1]), impegno(3, b[2])]);
  assert.ok(verificaIntervalli(commits, tre));
  assert.ok(!verificaIntervalli([...commits.slice(0, 3), impegno(4, b[0])], tre), 'riempimento sostituito');
  assert.ok(!verificaIntervalli([...commits.slice(0, 3), impegnoGrezzo(-1n, 0n)], tre), 'riempimento negativo');
});

test('aggregata: un importo fuori intervallo tra tanti onesti fa cadere tutto', () => {
  const b = [mascheraCasuale(), mascheraCasuale(), mascheraCasuale(), mascheraCasuale()];
  const prova = provaIntervalli([{ a: 5, b: b[0] }, { a: 7, b: b[1] }, { a: 9, b: b[2] }, { a: 11, b: b[3] }]);
  const onesti = [impegno(5, b[0]), impegno(7, b[1]), impegno(9, b[2]), impegno(11, b[3])];
  assert.ok(verificaIntervalli(onesti, prova));
  for (let j = 0; j < 4; j++) {
    const conNegativo = onesti.map((c, i) => (i === j ? impegnoGrezzo(-1n, b[j]) : c));
    assert.ok(!verificaIntervalli(conNegativo, prova), `−1 in posizione ${j}`);
    const conGrande = onesti.map((c, i) => (i === j ? impegnoGrezzo((1n << 64n) + 5n, b[j]) : c));
    assert.ok(!verificaIntervalli(conGrande, prova), `2^64+5 in posizione ${j}`);
  }
});

test('aggregata: m non potenza di 2, oltre il massimo, o vuoto', () => {
  const prova = provaIntervallo(1, 1n);
  assert.throws(() => verificaOLancia([impegno(1, 1n), impegno(1, 1n), impegno(1, 1n)], prova), /potenza di 2/);
  assert.throws(() => verificaOLancia([], prova), /potenza di 2/);
  assert.throws(() => verificaOLancia(Array(32).fill(impegno(1, 1n)), prova), /potenza di 2/);
  assert.throws(() => riempi(Array(USCITE_MAX + 1).fill(impegno(1, 1n))), /al massimo/);
  assert.throws(() => riempi([]), /almeno/);
  assert.throws(() => provaIntervalli([]), /almeno/);
  assert.throws(() => provaIntervalli(Array(USCITE_MAX + 1).fill({ a: 1, b: 1n })), /al massimo/);
  assert.deepEqual(riempi([impegno(1, 1n)]), [impegno(1, 1n)]);
});
