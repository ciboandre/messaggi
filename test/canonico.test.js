import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonico, sha256, hashCanonico } from '../nucleo/canonico.js';

test('ordina le chiavi a ogni livello e non mette spazi', () => {
  const a = canonico({ z: 1, a: { y: [3, { k: 'v', b: 2 }], b: null }, m: 'x' });
  assert.equal(a, '{"a":{"b":null,"y":[3,{"b":2,"k":"v"}]},"m":"x","z":1}');
});

test('lo stesso contenuto con chiavi in ordine diverso dà la stessa stringa', () => {
  const uno = canonico({ seq: 1, body: { to: 'a', amount: 5 }, type: 't' });
  const due = canonico({ type: 't', body: { amount: 5, to: 'a' }, seq: 1 });
  assert.equal(uno, due);
});

test('gli array conservano l\'ordine', () => {
  assert.equal(canonico([3, 1, 2]), '[3,1,2]');
});

test('le stringhe unicode restano intatte', () => {
  assert.equal(canonico({ causale: 'caffè · grazie' }), '{"causale":"caffè · grazie"}');
});

test('rifiuta undefined, numeri non interi e non finiti', () => {
  assert.throws(() => canonico({ a: undefined }), /undefined in a/);
  assert.throws(() => canonico({ a: 1.5 }), /non intero in a/);
  assert.throws(() => canonico({ a: { b: NaN } }), /non finito in a\.b/);
  assert.throws(() => canonico([Infinity]), /non finito/);
});

test('rifiuta oggetti non semplici e bigint', () => {
  assert.throws(() => canonico({ d: new Date() }), /non semplice/);
  assert.throws(() => canonico({ n: 10n }), /bigint/);
});

test('sha256 corrisponde ai vettori noti', () => {
  assert.equal(sha256(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('hashCanonico non dipende dall\'ordine delle chiavi', () => {
  assert.equal(hashCanonico({ b: 1, a: 2 }), hashCanonico({ a: 2, b: 1 }));
  assert.notEqual(hashCanonico({ a: 1 }), hashCanonico({ a: 2 }));
});
