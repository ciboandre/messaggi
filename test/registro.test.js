import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Registro, preparaRiga, firmaRiga, hashRiga, PREV_GENESI } from '../nucleo/registro.js';
import { apriRegistro, accodaSuFile, righeDaJsonl, rigaAJsonl } from '../nucleo/registro-file.js';
import { coppiaDaSeme, firma } from '../nucleo/chiavi.js';
import { portafoglioDaFrase } from '../nucleo/portafoglio.js';
import { generaFrase } from '../nucleo/frase.js';

// Chiavi finte ma deterministiche
const banca = coppiaDaSeme(new Uint8Array(32).fill(1));
const altro = coppiaDaSeme(new Uint8Array(32).fill(2));
const coordinateBanca = portafoglioDaFrase(generaFrase()).coordinate;

const PARAMETRI = { sovrapprezzo_pct: 5, commissione_pct: 2, multe_bruciate_pct: 50, tetto_cent: 400000, giorni_multa: 15 };

/** Un tipo di prova: "nota", firmata da chi dice il body. Serve solo ai test. */
const tipiTest = {
  nota: (riga, stato) => {
    const b = /** @type {any} */ (riga.body);
    if (typeof b.testo !== 'string') throw new Error('nota senza testo');
    stato.note = (stato.note ?? 0) + 1;
    return [b.autore];
  },
};

function firmatario(coppia) {
  return { by: coppia.pubblica, firma: (h) => firma(coppia.privata, h) };
}

function genesi(ts = '2026-10-01T00:00:00Z') {
  const r = preparaRiga(null, { type: 'genesis', ts, body: { banca: { chiave: banca.pubblica, coordinate: coordinateBanca }, parametri: PARAMETRI } });
  return firmaRiga(r, [firmatario(banca)]);
}

function nota(reg, testo, coppia = altro, ts = '2026-10-02T10:00:00Z') {
  const r = preparaRiga(reg.ultima, { type: 'nota', ts, body: { testo, autore: coppia.pubblica } });
  return firmaRiga(r, [firmatario(coppia)]);
}

test('la genesi apre il registro e fissa i parametri', () => {
  const reg = new Registro({ tipi: tipiTest });
  const g = genesi();
  assert.equal(g.seq, 0);
  assert.equal(g.prev, PREV_GENESI);
  reg.accoda(g);
  assert.equal(reg.righe.length, 1);
  assert.deepEqual(/** @type {any} */ (reg.stato).genesi.parametri, PARAMETRI);
  assert.equal(/** @type {any} */ (reg.stato).tetto_cent, 400000n);
});

test('le righe si concatenano: seq progressivo e prev uguale all\'hash precedente', () => {
  const reg = new Registro({ tipi: tipiTest });
  reg.accoda(genesi());
  const n1 = nota(reg, 'una');
  reg.accoda(n1);
  const n2 = nota(reg, 'due', altro, '2026-10-03T10:00:00Z');
  reg.accoda(n2);
  assert.equal(n1.seq, 1);
  assert.equal(n2.seq, 2);
  assert.equal(n1.prev, reg.righe[0].hash);
  assert.equal(n2.prev, n1.hash);
  assert.equal(/** @type {any} */ (reg.stato).note, 2);
});

test('l\'hash copre seq, ts, type, body e prev, non le firme', () => {
  const reg = new Registro({ tipi: tipiTest });
  reg.accoda(genesi());
  const n = nota(reg, 'x');
  assert.equal(n.hash, hashRiga(n));
  assert.equal(hashRiga({ ...n, sigs: [] }), n.hash);
  assert.notEqual(hashRiga({ ...n, body: { ...n.body, testo: 'y' } }), n.hash);
});

test('senza genesi non si parte; una seconda genesi non entra', () => {
  const reg = new Registro({ tipi: tipiTest });
  assert.throws(() => reg.accoda(nota(reg, 'prima della genesi')), /riga 0 deve essere la genesi/);
  reg.accoda(genesi());
  const g2 = firmaRiga(preparaRiga(reg.ultima, { type: 'genesis', ts: '2026-10-02T00:00:00Z', body: genesi().body }), [firmatario(banca)]);
  assert.throws(() => reg.accoda(g2), /genesi solo a seq 0/);
});

test('la genesi deve essere firmata dalla chiave banca dichiarata', () => {
  const reg = new Registro({ tipi: tipiTest });
  const g = firmaRiga(preparaRiga(null, { type: 'genesis', ts: '2026-10-01T00:00:00Z', body: genesi().body }), [firmatario(altro)]);
  assert.throws(() => reg.accoda(g), /manca la firma di/);
});

test('parametri mancanti o non interi bloccano la genesi', () => {
  const reg = new Registro({ tipi: tipiTest });
  // un decimale non arriva nemmeno alla firma: la forma canonica lo rifiuta
  const conDecimale = { banca: { chiave: banca.pubblica, coordinate: coordinateBanca }, parametri: { ...PARAMETRI, tetto_cent: 4000.5 } };
  assert.throws(() => preparaRiga(null, { type: 'genesis', ts: '2026-10-01T00:00:00Z', body: conDecimale }), /non intero/);
  // un parametro mancante passa la firma ma non la regola
  const { tetto_cent, ...senzaTetto } = PARAMETRI;
  const body = { banca: { chiave: banca.pubblica, coordinate: coordinateBanca }, parametri: senzaTetto };
  const g = firmaRiga(preparaRiga(null, { type: 'genesis', ts: '2026-10-01T00:00:00Z', body }), [firmatario(banca)]);
  assert.throws(() => reg.accoda(g), /tetto_cent/);
  assert.equal(reg.righe.length, 0);
});

test('una riga manomessa dopo la firma viene rifiutata', () => {
  const reg = new Registro({ tipi: tipiTest });
  reg.accoda(genesi());
  const n = nota(reg, 'originale');
  assert.throws(() => reg.accoda({ ...n, body: { ...n.body, testo: 'cambiato' } }), /hash non corrisponde/);
  const hashFinto = { ...n, body: { ...n.body, testo: 'cambiato' } };
  hashFinto.hash = hashRiga(hashFinto);
  assert.throws(() => reg.accoda(hashFinto), /firma non valida/);
});

test('seq sbagliato, prev sbagliato, ts indietro: tutti rifiutati e il registro non cambia', () => {
  const reg = new Registro({ tipi: tipiTest });
  reg.accoda(genesi());
  const buona = nota(reg, 'ok');
  assert.throws(() => reg.accoda({ ...buona, seq: 5, hash: hashRiga({ ...buona, seq: 5 }) }), /seq 5, atteso 1/);
  const prevFinto = { ...buona, prev: '1'.repeat(64) };
  prevFinto.hash = hashRiga(prevFinto);
  assert.throws(() => reg.accoda(prevFinto), /prev non corrisponde/);
  const indietro = firmaRiga(preparaRiga(reg.ultima, { type: 'nota', ts: '2026-09-30T00:00:00Z', body: { testo: 'ieri', autore: altro.pubblica } }), [firmatario(altro)]);
  assert.throws(() => reg.accoda(indietro), /ts precedente/);
  assert.equal(reg.righe.length, 1);
  assert.equal(/** @type {any} */ (reg.stato).note, undefined);
});

test('firme: nessuna, non richiesta, o mancante', () => {
  const reg = new Registro({ tipi: tipiTest });
  reg.accoda(genesi());
  const base = preparaRiga(reg.ultima, { type: 'nota', ts: '2026-10-02T10:00:00Z', body: { testo: 'x', autore: altro.pubblica } });
  assert.throws(() => reg.accoda({ ...base, sigs: [] }), /nessuna firma/);
  assert.throws(() => reg.accoda(firmaRiga(base, [firmatario(banca)])), /manca la firma di/);
  assert.throws(() => reg.accoda(firmaRiga(base, [firmatario(altro), firmatario(banca)])), /firma non richiesta/);
  assert.throws(() => reg.accoda(firmaRiga(base, [firmatario(altro), firmatario(altro)])), /firma duplicata/);
});

test('un tipo sconosciuto non entra', () => {
  const reg = new Registro({ tipi: tipiTest });
  reg.accoda(genesi());
  const r = firmaRiga(preparaRiga(reg.ultima, { type: 'crea_manti_dal_nulla', ts: '2026-10-02T10:00:00Z', body: { quanti: 1000000 } }), [firmatario(banca)]);
  assert.throws(() => reg.accoda(r), /tipo sconosciuto/);
});

test('la regola genesis non si può sostituire dall\'esterno', () => {
  assert.throws(() => new Registro({ tipi: { genesis: () => [] } }), /incorporata/);
});

test('ricostruire da righe verifica tutto da capo e indica la riga rotta', () => {
  const reg = new Registro({ tipi: tipiTest });
  reg.accoda(genesi());
  reg.accoda(nota(reg, 'a'));
  reg.accoda(nota(reg, 'b', altro, '2026-10-03T00:00:00Z'));
  const copia = Registro.daRighe(reg.righe, { tipi: tipiTest });
  assert.equal(copia.righe.length, 3);
  assert.equal(copia.ultima.hash, reg.ultima.hash);

  const rotte = structuredClone(reg.righe);
  rotte[1].body.testo = 'manomesso';
  assert.throws(() => Registro.daRighe(rotte, { tipi: tipiTest }), /riga 1: hash non corrisponde/);

  const tolta = [reg.righe[0], reg.righe[2]];
  assert.throws(() => Registro.daRighe(tolta, { tipi: tipiTest }), /riga 2: seq 2, atteso 1/);
});

test('su file: si scrive una riga per linea e si rilegge verificando', () => {
  const dir = mkdtempSync(join(tmpdir(), 'manti-'));
  const percorso = join(dir, 'ledger.jsonl');
  const reg = apriRegistro(percorso, { tipi: tipiTest });
  assert.equal(reg.righe.length, 0);
  accodaSuFile(reg, percorso, genesi());
  accodaSuFile(reg, percorso, nota(reg, 'su disco'));
  const testo = readFileSync(percorso, 'utf8');
  assert.equal(testo.split('\n').filter(Boolean).length, 2);
  assert.equal(righeDaJsonl(testo).length, 2);
  assert.equal(rigaAJsonl(reg.righe[1]), testo.split('\n')[1] + '\n');

  const riaperto = apriRegistro(percorso, { tipi: tipiTest });
  assert.equal(riaperto.righe.length, 2);
  assert.equal(riaperto.ultima.hash, reg.ultima.hash);

  // una riga invalida non finisce sul file
  assert.throws(() => accodaSuFile(riaperto, percorso, { ...nota(riaperto, 'x'), seq: 9 }));
  assert.equal(readFileSync(percorso, 'utf8').split('\n').filter(Boolean).length, 2);
});
