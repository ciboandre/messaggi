import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generaSeme, coppiaDaSeme, firma, verifica } from '../nucleo/chiavi.js';
import { sha256 } from '../nucleo/canonico.js';

// Vettore di prova 1 di RFC 8032, sezione 7.1: da questo seme deve uscire
// esattamente questa chiave pubblica. Se non esce, la derivazione è sbagliata.
const SEME_RFC = Buffer.from('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', 'hex');
const PUBBLICA_RFC = 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';

test('la chiave pubblica dal seme coincide con RFC 8032', () => {
  const { pubblica } = coppiaDaSeme(SEME_RFC);
  assert.equal(pubblica, PUBBLICA_RFC);
});

test('stesso seme, stesse chiavi; semi diversi, chiavi diverse', () => {
  const s = generaSeme();
  assert.equal(coppiaDaSeme(s).pubblica, coppiaDaSeme(s).pubblica);
  assert.notEqual(coppiaDaSeme(s).pubblica, coppiaDaSeme(generaSeme()).pubblica);
});

test('il seme deve essere di 32 byte', () => {
  assert.throws(() => coppiaDaSeme(new Uint8Array(31)), /32 byte/);
  assert.throws(() => coppiaDaSeme('abc'), /32 byte/);
});

test('firma e verifica', () => {
  const { privata, pubblica } = coppiaDaSeme(generaSeme());
  const h = sha256('riga di prova');
  const sig = firma(privata, h);
  assert.equal(Buffer.from(sig, 'base64').length, 64);
  assert.equal(verifica(pubblica, h, sig), true);
});

test('la firma è deterministica', () => {
  const { privata } = coppiaDaSeme(SEME_RFC);
  const h = sha256('x');
  assert.equal(firma(privata, h), firma(privata, h));
});

test('una firma non vale per un altro hash né per un\'altra chiave', () => {
  const a = coppiaDaSeme(generaSeme());
  const b = coppiaDaSeme(generaSeme());
  const h = sha256('uno');
  const sig = firma(a.privata, h);
  assert.equal(verifica(a.pubblica, sha256('due'), sig), false);
  assert.equal(verifica(b.pubblica, h, sig), false);
});

test('una firma manomessa non verifica', () => {
  const { privata, pubblica } = coppiaDaSeme(generaSeme());
  const h = sha256('m');
  const bytes = Buffer.from(firma(privata, h), 'base64');
  bytes[10] ^= 0x01;
  assert.equal(verifica(pubblica, h, bytes.toString('base64')), false);
});

test('input malformati: firma lancia, verifica risponde false', () => {
  const { privata, pubblica } = coppiaDaSeme(generaSeme());
  assert.throws(() => firma(privata, 'non-un-hash'), /64 caratteri/);
  assert.equal(verifica(pubblica, 'non-un-hash', 'AAAA'), false);
  assert.equal(verifica('zz', sha256('a'), 'AAAA'), false);
  assert.equal(verifica(pubblica, sha256('a'), 'non base64 valido!!'), false);
});
