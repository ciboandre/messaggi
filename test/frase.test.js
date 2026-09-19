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

test('una parola cambiata passa il controllo circa 1 volta su 16, mai più di 1 su 8: il checksum fa il suo lavoro', () => {
  // BIP39 ha 4 bit di controllo su 12 parole: una sostituzione a caso passa con probabilità 1/16.
  // Si enumerano tutte le 2047 sostituzioni dell'ultima parola di una frase fissa.
  const frase = 'abaco abaco abaco abaco abaco abaco abaco abaco abaco abaco abaco abaco'.split(' ');
  const lista = parole();
  const originale = lista.find((w) => fraseValida([...frase.slice(0, 11), w].join(' ')));
  assert.ok(originale, 'esiste una dodicesima parola che rende valida la frase');
  let passano = 0;
  for (const w of lista) {
    if (w === originale) continue;
    if (fraseValida([...frase.slice(0, 11), w].join(' '))) passano++;
  }
  const frazione = passano / (lista.length - 1);
  assert.ok(frazione > 1 / 32 && frazione < 1 / 8, `passano ${passano} su ${lista.length - 1}: ${frazione}`);
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
