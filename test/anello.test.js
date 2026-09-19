import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519.js';
import { firmaAnello, verificaAnello, verificaAnelloOLancia, immagineChiave, MEMBRI_MAX } from '../nucleo/anello.js';
import { impegno, impegnoInChiaro, mascheraCasuale, mascheraDaSegreto, sommaMaschere } from '../nucleo/impegni.js';
import { portafoglioDaFrase, creaIndirizzo, riconosci } from '../nucleo/portafoglio.js';
import { generaFrase } from '../nucleo/frase.js';
import { scalareDaBytes } from '../nucleo/chiavi.js';
import { randomBytes } from '@noble/curves/utils.js';

const Punto = ed25519.Point;
const G = Punto.BASE;
const ORDINE = Punto.Fn.ORDER;
const MSG = 'a'.repeat(64);
const MSG2 = 'b'.repeat(64);

/** Un'uscita riservata di cui conosciamo tutto, o un'esca di cui non sappiamo nulla. */
function uscita(a = 1000n) {
  const p = scalareDaBytes(randomBytes(64));
  const b = mascheraCasuale();
  return { p, b, a, addr: G.multiply(p).toHex(), commit: impegno(a, b) };
}
function esca() {
  const { addr, commit } = uscita(BigInt(Math.floor(Math.random() * 1e6)));
  return { addr, commit };
}
/** Anello di n con la vera in posizione l; pseudo con maschera nuova. */
function anello(n, l, vera = uscita()) {
  const membri = Array.from({ length: n }, (_, i) => (i === l ? { addr: vera.addr, commit: vera.commit } : esca()));
  const bPseudo = mascheraCasuale();
  const pseudo = impegno(vera.a, bPseudo);
  const z = ((vera.b - bPseudo) % ORDINE + ORDINE) % ORDINE;
  const { img, firma } = firmaAnello({ membri, indice: l, p: vera.p, z, pseudo, messaggio: MSG });
  return { membri, pseudo, img, firma, vera, z };
}

test('firma onesta: anelli da 1, 2, 16, con la vera in ogni posizione di un anello da 4', () => {
  for (const n of [1, 2, 16]) {
    const { membri, pseudo, img, firma } = anello(n, n - 1);
    assert.equal(firma.s.length, n);
    assert.equal(verificaAnelloOLancia({ membri, pseudo, img, messaggio: MSG, firma }), true, `n = ${n}`);
  }
  for (let l = 0; l < 4; l++) {
    const { membri, pseudo, img, firma } = anello(4, l);
    assert.equal(verificaAnelloOLancia({ membri, pseudo, img, messaggio: MSG, firma }), true, `l = ${l}`);
  }
});

test('l\'immagine di chiave dipende solo dalla chiave: stessa uscita, anelli diversi, stessa immagine', () => {
  const vera = uscita();
  const uno = anello(8, 2, vera);
  const due = anello(8, 5, vera);
  assert.equal(uno.img, due.img);
  assert.equal(uno.img, immagineChiave(vera.p));
  assert.notEqual(uno.firma.D, due.firma.D, 'D cambia con lo pseudo-impegno');
  assert.notEqual(uno.img, anello(8, 2).img, 'uscita diversa, immagine diversa');
});

test('messaggio, pseudo-impegno, immagine, membri e ogni scalare sono legati alla firma', () => {
  const { membri, pseudo, img, firma } = anello(4, 1);
  const ok = (m) => verificaAnello({ membri, pseudo, img, messaggio: MSG, firma, ...m });
  assert.ok(ok({}));
  assert.ok(!ok({ messaggio: MSG2 }), 'messaggio');
  assert.ok(!ok({ pseudo: impegno(1000n, mascheraCasuale()) }), 'pseudo');
  assert.ok(!ok({ img: immagineChiave(3n) }), 'immagine');
  assert.ok(!ok({ membri: [membri[1], membri[0], membri[2], membri[3]] }), 'ordine dei membri');
  assert.ok(!ok({ membri: membri.map((m, i) => (i === 3 ? esca() : m)) }), 'esca sostituita');
  assert.ok(!ok({ membri: membri.slice(0, 3), firma: { ...firma, s: firma.s.slice(0, 3) } }), 'anello accorciato');
  const altra = anello(4, 1).firma;
  assert.ok(!ok({ firma: { ...firma, c1: altra.c1 } }), 'c1');
  assert.ok(!ok({ firma: { ...firma, D: altra.D } }), 'D');
  for (let i = 0; i < 4; i++) {
    assert.ok(!ok({ firma: { ...firma, s: firma.s.map((x, j) => (j === i ? altra.s[i] : x)) } }), `s[${i}]`);
  }
});

test('torsione e codifiche: immagini, D, indirizzi e impegni con torsione vengono rifiutati', () => {
  const { membri, pseudo, img, firma } = anello(3, 0);
  const torsione = Punto.fromHex('c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a');
  const conTorsione = (hex) => Punto.fromHex(hex).add(torsione).toHex();
  const lancia = (m, re) => assert.throws(() => verificaAnelloOLancia({ membri, pseudo, img, messaggio: MSG, firma, ...m }), re);
  // un'immagine con un componente di torsione sarebbe una seconda immagine per lo stesso segreto
  lancia({ img: conTorsione(img) }, /immagine di chiave con torsione/);
  lancia({ firma: { ...firma, D: conTorsione(firma.D) } }, /ausiliaria con torsione/);
  lancia({ membri: membri.map((m, i) => (i === 1 ? { ...m, addr: conTorsione(m.addr) } : m)) }, /indirizzo con torsione/);
  lancia({ membri: membri.map((m, i) => (i === 1 ? { ...m, commit: conTorsione(m.commit) } : m)) }, /impegno con torsione/);
  lancia({ pseudo: conTorsione(pseudo) }, /pseudo-impegno con torsione/);
  lancia({ img: Punto.ZERO.toHex() }, /immagine di chiave nulla/);
  lancia({ img: img.toUpperCase() }, /malformato/);
  lancia({ firma: { ...firma, c1: 'ff'.repeat(32) } }, /ordine/);
  lancia({ firma: { ...firma, s: firma.s.slice(1) } }, /malformata/);
  lancia({ messaggio: 'x' }, /messaggio/);
  assert.ok(!verificaAnello({ membri, pseudo, img, messaggio: MSG, firma: null }));
});

test('chi non ha la chiave, o sbaglia la maschera, non firma', () => {
  const vera = uscita();
  const membri = [esca(), { addr: vera.addr, commit: vera.commit }, esca()];
  const bPseudo = mascheraCasuale();
  const pseudo = impegno(vera.a, bPseudo);
  const z = ((vera.b - bPseudo) % ORDINE + ORDINE) % ORDINE;
  assert.throws(() => firmaAnello({ membri, indice: 1, p: vera.p + 1n, z, pseudo, messaggio: MSG }), /non apre/);
  assert.throws(() => firmaAnello({ membri, indice: 0, p: vera.p, z, pseudo, messaggio: MSG }), /non apre/);
  assert.throws(() => firmaAnello({ membri, indice: 1, p: vera.p, z: z + 1n, pseudo, messaggio: MSG }), /maschera non torna/);
  // pseudo con importo diverso: la differenza non è un multiplo di G, nessuno z funziona
  assert.throws(() => firmaAnello({ membri, indice: 1, p: vera.p, z, pseudo: impegno(vera.a + 1n, bPseudo), messaggio: MSG }), /maschera non torna/);
  assert.throws(() => firmaAnello({ membri, indice: 1, p: 0n, z, pseudo, messaggio: MSG }), RangeError);
  assert.throws(() => firmaAnello({ membri, indice: 1, p: vera.p, z: 0n, pseudo, messaggio: MSG }), RangeError);
  assert.throws(() => firmaAnello({ membri, indice: 3, p: vera.p, z, pseudo, messaggio: MSG }), RangeError);
  assert.throws(() => firmaAnello({ membri: Array(MEMBRI_MAX + 1).fill(esca()), indice: 1, p: vera.p, z, pseudo, messaggio: MSG }), RangeError);
});

test('dal portafoglio al registro: riconosci, pseudo-impegno, anello con esche in chiaro e riservate', () => {
  const io = portafoglioDaFrase(generaFrase());
  const ind = creaIndirizzo(io.coordinate);
  const b = mascheraDaSegreto(ind.k);
  const mia = { addr: ind.addr, eph: ind.eph, commit: impegno(2500, b) };
  const { p } = riconosci(mia, io);
  // esche: una vendita in chiaro, due riservate
  const membri = [{ addr: esca().addr, commit: impegnoInChiaro(150000) }, esca(), { addr: mia.addr, commit: mia.commit }, esca()];
  const bPseudo = mascheraCasuale();
  const pseudo = impegno(2500, bPseudo);
  const z = sommaMaschere([b, ORDINE - bPseudo]);
  const { img, firma } = firmaAnello({ membri, indice: 2, p, z, pseudo, messaggio: MSG });
  assert.equal(verificaAnelloOLancia({ membri, pseudo, img, messaggio: MSG, firma }), true);
  assert.equal(img, immagineChiave(p));
  // la stessa uscita spesa una seconda volta, con altre esche: stessa immagine, il registro la vedrà
  const seconda = firmaAnello({ membri: [esca(), { addr: mia.addr, commit: mia.commit }], indice: 1, p, z, pseudo, messaggio: MSG2 });
  assert.equal(seconda.img, img);
});
