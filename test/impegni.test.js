import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519.js';
import {
  H, IMPORTO_MAX, impegno, impegnoInChiaro, controllaImporto,
  mascheraDaSegreto, mascheraCasuale, cifraImporto, decifraImporto, apriUscita,
  sommaMaschere, mascherePseudo, bilancio,
} from '../nucleo/impegni.js';
import { portafoglioDaFrase, creaIndirizzo, riconosci } from '../nucleo/portafoglio.js';
import { generaFrase } from '../nucleo/frase.js';

const Punto = ed25519.Point;
const ORDINE = Punto.Fn.ORDER;

test('H è un punto fisso della curva, diverso da G e di ordine primo', () => {
  assert.equal(H.toHex(), '25f23c49b9a2e84fe46ebf03eeb7e8be14211e01cf57451083459c23f83a740b');
  assert.ok(!H.equals(Punto.BASE));
  H.assertValidity();
  assert.ok(H.multiply(ORDINE - 1n).add(H).equals(Punto.ZERO));
});

test('impegno: omomorfo, nascosto, in chiaro con maschera zero', () => {
  const b1 = mascheraCasuale();
  const b2 = mascheraCasuale();
  const somma = Punto.fromHex(impegno(300, b1)).add(Punto.fromHex(impegno(500, b2)));
  assert.equal(somma.toHex(), impegno(800, (b1 + b2) % ORDINE));
  assert.notEqual(impegno(5, b1), impegno(5, b2));
  assert.notEqual(impegno(5, b1), impegno(6, b1));
  assert.equal(impegnoInChiaro(1500), impegno(1500n, 0n));
  assert.equal(impegno(0, 0n), Punto.ZERO.toHex());
  assert.equal(impegno(IMPORTO_MAX, 0n), H.multiply(IMPORTO_MAX).toHex());
});

test('importi fuori intervallo o non interi vengono rifiutati', () => {
  assert.throws(() => controllaImporto(-1), RangeError);
  assert.throws(() => controllaImporto(IMPORTO_MAX + 1n), RangeError);
  assert.throws(() => controllaImporto(1.5), TypeError);
  assert.throws(() => controllaImporto('12'), TypeError);
  assert.throws(() => impegno(1, ORDINE), RangeError);
  assert.throws(() => impegno(1, -1n), RangeError);
  assert.equal(controllaImporto(7), 7n);
});

test('maschera dal segreto: deterministica, nell\'intervallo, diversa per k diversi', () => {
  const b = mascheraDaSegreto(12345n);
  assert.equal(b, mascheraDaSegreto(12345n));
  assert.ok(b > 0n && b < ORDINE);
  assert.notEqual(b, mascheraDaSegreto(12346n));
});

test('importo cifrato: 16 esadecimali, torna con lo stesso k, non con un altro', () => {
  const c = cifraImporto(99n, 123456789n);
  assert.match(c, /^[0-9a-f]{16}$/);
  assert.equal(decifraImporto(99n, c), 123456789n);
  assert.notEqual(decifraImporto(98n, c), 123456789n);
  assert.equal(decifraImporto(99n, 'zz'), null);
  assert.equal(decifraImporto(99n, cifraImporto(99n, 0)), 0n);
  assert.equal(decifraImporto(99n, cifraImporto(99n, IMPORTO_MAX)), IMPORTO_MAX);
});

test('chi paga e chi riceve ricavano la stessa maschera e lo stesso importo', () => {
  const p = portafoglioDaFrase(generaFrase());
  const ind = creaIndirizzo(p.coordinate);
  const uscita = { addr: ind.addr, eph: ind.eph, commit: impegno(2500, mascheraDaSegreto(ind.k)), amt: cifraImporto(ind.k, 2500) };
  const mia = riconosci(uscita, p);
  assert.ok(mia);
  assert.deepEqual(apriUscita(uscita, mia.k), { a: 2500n, b: mascheraDaSegreto(ind.k) });
  // importo cifrato manomesso: l'impegno non torna
  assert.equal(apriUscita({ ...uscita, amt: cifraImporto(ind.k, 2600) }, mia.k), null);
  // portafoglio sbagliato: non riconosce nemmeno l'indirizzo
  assert.equal(riconosci(uscita, portafoglioDaFrase(generaFrase())), null);
});

test('bilancio: torna con gli pseudo-impegni giusti, non con un importo alterato', () => {
  const entrate = [{ a: 1000n, b: mascheraCasuale() }, { a: 700n, b: mascheraCasuale() }];
  const uscite = [{ a: 1500n, b: mascheraCasuale() }, { a: 200n, b: mascheraCasuale() }];
  const pseudoB = mascherePseudo(uscite.map((u) => u.b), entrate.length);
  assert.equal(sommaMaschere(pseudoB), sommaMaschere(uscite.map((u) => u.b)));
  const pseudo = entrate.map((e, i) => impegno(e.a, pseudoB[i]));
  const commit = uscite.map((u) => impegno(u.a, u.b));
  assert.ok(bilancio({ pseudo, uscite: commit }));
  // un'uscita in più dal nulla
  assert.ok(!bilancio({ pseudo, uscite: [...commit, impegno(1, mascheraCasuale())] }));
  // pseudo che dichiara un importo diverso dal vero
  assert.ok(!bilancio({ pseudo: [impegno(1001n, pseudoB[0]), pseudo[1]], uscite: commit }));
});

test('bilancio con parti in chiaro: multa pagata da un correntista, incasso in chiaro di un\'azienda', () => {
  // correntista: entrata riservata da 1000, bruciatura 50, alla polizia 50 in chiaro, resto riservato 900
  const bIn = mascheraCasuale();
  const bResto = mascheraCasuale();
  const [pseudoB] = mascherePseudo([bResto], 1);
  assert.ok(bilancio({ pseudo: [impegno(1000, pseudoB)], uscite: [impegno(900, bResto)], usciteChiare: [50, 50] }));
  assert.ok(!bilancio({ pseudo: [impegno(1000, pseudoB)], uscite: [impegno(900, bResto)], usciteChiare: [50, 40] }));
  // azienda: spende in chiaro un'uscita riservata da 1000 (rivela importo e maschera, il motore
  // ricalcola l'impegno e da lì in poi è un importo in chiaro) più una vendita da 500
  const incasso = { commit: impegno(1000, bIn), a: 1000, b: bIn };
  assert.equal(impegno(incasso.a, incasso.b), incasso.commit);
  assert.ok(bilancio({ entrateChiare: [incasso.a, 500], usciteChiare: [1500] }));
  // banca: vendita, tutto in chiaro
  assert.ok(bilancio({ usciteChiare: [] }));
  assert.ok(bilancio({ entrateChiare: [300, 200], usciteChiare: [500] }));
  assert.ok(!bilancio({ entrateChiare: [300, 200], usciteChiare: [501] }));
});

test('bilancio: somme in chiaro oltre 2^64 non girano attorno', () => {
  assert.ok(!bilancio({ entrateChiare: [IMPORTO_MAX, 1n], usciteChiare: [0] }));
  assert.ok(bilancio({ entrateChiare: [IMPORTO_MAX, 1n], usciteChiare: [IMPORTO_MAX, 1n] }));
  assert.throws(() => bilancio({ pseudo: ['00'] }));
});
