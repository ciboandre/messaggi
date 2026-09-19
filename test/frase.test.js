import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generaFrase, fraseValida, semeDaFrase, normalizzaFrase, parole, PAROLE } from '../nucleo/frase.js';

test('la frase ha dodici parole della lista italiana', () => {
  const f = generaFrase();
  const p = f.split(' ');
  assert.equal(p.length, PAROLE);
  for (const w of p) assert.ok(parole().includes(w), `parola fuori lista: ${w}`);
  assert.equal(fraseValida(f), true);
});

test('due frasi generate sono diverse', () => {
  assert.notEqual(generaFrase(), generaFrase());
});

test('spazi e maiuscole non contano', () => {
  const f = generaFrase();
  const sporca = '  ' + f.toUpperCase().split(' ').join('   ') + '\n';
  assert.equal(normalizzaFrase(sporca), f);
  assert.equal(fraseValida(sporca), true);
  assert.deepEqual(semeDaFrase(sporca), semeDaFrase(f));
});

test('una parola cambiata rende la frase non valida', () => {
  const p = generaFrase().split(' ');
  const altra = parole().find((w) => w !== p[3]);
  p[3] = altra;
  // con 4 bit di controllo, una sostituzione passa 1 volta su 16: proviamo più parole
  let rifiutate = 0;
  for (let i = 0; i < 12; i++) {
    const q = generaFrase().split(' ');
    q[i] = parole().find((w) => w !== q[i]);
    if (!fraseValida(q.join(' '))) rifiutate++;
  }
  assert.ok(rifiutate >= 8, `attese quasi tutte rifiutate, rifiutate ${rifiutate} su 12`);
});

test('undici o tredici parole non valgono', () => {
  const p = generaFrase().split(' ');
  assert.equal(fraseValida(p.slice(0, 11).join(' ')), false);
  assert.equal(fraseValida([...p, p[0]].join(' ')), false);
  assert.equal(fraseValida(''), false);
  assert.equal(fraseValida(/** @type {any} */ (null)), false);
});

test('il seme è di 64 byte e deterministico', () => {
  const f = generaFrase();
  const a = semeDaFrase(f);
  assert.equal(a.length, 64);
  assert.deepEqual(a, semeDaFrase(f));
  assert.notDeepEqual(a, semeDaFrase(generaFrase()));
});

test('semeDaFrase lancia su frase non valida', () => {
  assert.throws(() => semeDaFrase('uno due tre'), /non valida/);
});
