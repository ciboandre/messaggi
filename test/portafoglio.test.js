import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  portafoglioDaFrase, portafoglioDaSeme, codificaCoordinate, decodificaCoordinate,
  coordinateLeggibili, creaIndirizzo, riconosci, chiaveCausale, PREFISSO,
} from '../nucleo/portafoglio.js';
import { generaFrase } from '../nucleo/frase.js';
import { firmaScalare, verifica, pubblicaDaScalare } from '../nucleo/chiavi.js';
import { sha256 } from '../nucleo/canonico.js';

const FRASE = 'abbaglio abete abisso abolire abrasivo abrogato accadere accenno accusato acetone acido acqua';

test('dalla stessa frase escono sempre le stesse chiavi', () => {
  const a = portafoglioDaFrase(FRASE);
  const b = portafoglioDaFrase(FRASE.toUpperCase());
  assert.equal(a.S, b.S);
  assert.equal(a.V, b.V);
  assert.equal(a.coordinate, b.coordinate);
  assert.equal(a.s, b.s);
});

test('spesa e vista sono chiavi diverse; frasi diverse, portafogli diversi', () => {
  const a = portafoglioDaFrase(FRASE);
  assert.notEqual(a.S, a.V);
  assert.notEqual(a.coordinate, portafoglioDaFrase(generaFrase()).coordinate);
});

test('il seme deve essere di 64 byte', () => {
  assert.throws(() => portafoglioDaSeme(new Uint8Array(32)), /64 byte/);
});

test('le coordinate hanno prefisso mnt, si decodificano e tornano uguali', () => {
  const p = portafoglioDaFrase(FRASE);
  assert.ok(p.coordinate.startsWith(PREFISSO + '1'));
  assert.ok(p.coordinate.length >= 110 && p.coordinate.length <= 120, `lunghezza ${p.coordinate.length}`);
  const { S, V } = decodificaCoordinate(p.coordinate);
  assert.equal(S, p.S);
  assert.equal(V, p.V);
  assert.equal(codificaCoordinate(S, V), p.coordinate);
});

test('le coordinate si accettano con spazi e maiuscole', () => {
  const p = portafoglioDaFrase(FRASE);
  const leggibili = coordinateLeggibili(p.coordinate);
  assert.ok(leggibili.includes(' '));
  assert.deepEqual(decodificaCoordinate(leggibili.toUpperCase()), { S: p.S, V: p.V });
});

test('un carattere sbagliato nelle coordinate viene scoperto', () => {
  const c = portafoglioDaFrase(FRASE).coordinate;
  const i = 40;
  const altro = c[i] === 'q' ? 'p' : 'q';
  const rotta = c.slice(0, i) + altro + c.slice(i + 1);
  assert.throws(() => decodificaCoordinate(rotta));
  assert.throws(() => decodificaCoordinate('btc1' + c.slice(4)));
  assert.throws(() => decodificaCoordinate('non sono coordinate'));
});

test('chi paga crea un indirizzo, il destinatario lo riconosce e può firmare', () => {
  const dest = portafoglioDaFrase(FRASE);
  const uscita = creaIndirizzo(dest.coordinate);
  assert.match(uscita.addr, /^[0-9a-f]{64}$/);
  assert.match(uscita.eph, /^[0-9a-f]{64}$/);

  const mio = riconosci(uscita, dest);
  assert.ok(mio, 'il destinatario deve riconoscere la propria uscita');
  assert.equal(mio.k, uscita.k, 'il segreto condiviso è lo stesso da entrambe le parti');
  assert.equal(pubblicaDaScalare(mio.p), uscita.addr, 'la chiave privata derivata corrisponde all\'indirizzo');

  const h = sha256('riga da firmare');
  const sig = firmaScalare(mio.p, h);
  assert.equal(verifica(uscita.addr, h, sig), true);
  assert.equal(verifica(uscita.addr, sha256('altra riga'), sig), false);
});

test('un altro portafoglio non riconosce l\'uscita', () => {
  const dest = portafoglioDaFrase(FRASE);
  const altro = portafoglioDaFrase(generaFrase());
  const uscita = creaIndirizzo(dest.coordinate);
  assert.equal(riconosci(uscita, altro), null);
});

test('due pagamenti alle stesse coordinate danno indirizzi diversi', () => {
  const dest = portafoglioDaFrase(FRASE);
  const a = creaIndirizzo(dest.coordinate);
  const b = creaIndirizzo(dest.coordinate);
  assert.notEqual(a.addr, b.addr);
  assert.notEqual(a.eph, b.eph);
  assert.ok(riconosci(a, dest) && riconosci(b, dest));
});

test('con lo stesso r l\'indirizzo è riproducibile', () => {
  const dest = portafoglioDaFrase(FRASE);
  const r = new Uint8Array(64).fill(9);
  assert.deepEqual(creaIndirizzo(dest.coordinate, r), creaIndirizzo(dest.coordinate, r));
});

test('un\'uscita manomessa non viene riconosciuta', () => {
  const dest = portafoglioDaFrase(FRASE);
  const u = creaIndirizzo(dest.coordinate);
  const altroEph = creaIndirizzo(dest.coordinate).eph;
  assert.equal(riconosci({ addr: u.addr, eph: altroEph }, dest), null);
  assert.equal(riconosci({ addr: u.addr, eph: 'zz' }, dest), null);
  const addrRotto = (u.addr[0] === '0' ? '1' : '0') + u.addr.slice(1);
  assert.equal(riconosci({ addr: addrRotto, eph: u.eph }, dest), null);
});

test('la chiave per la causale è di 32 byte e uguale per le due parti', () => {
  const dest = portafoglioDaFrase(FRASE);
  const u = creaIndirizzo(dest.coordinate);
  const mio = riconosci(u, dest);
  assert.equal(chiaveCausale(u.k).length, 32);
  assert.deepEqual(chiaveCausale(u.k), chiaveCausale(mio.k));
  assert.notDeepEqual(chiaveCausale(u.k), chiaveCausale(creaIndirizzo(dest.coordinate).k));
});
