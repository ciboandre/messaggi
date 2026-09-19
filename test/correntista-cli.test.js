import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as banca from '../banca/comandi.js';
import * as cc from '../correntista/comandi.js';
import { pubblica } from '../motore/pubblica.js';

test('conto di prova: nuovo, coordinate, vendita dalla banca, pagamento riservato, saldo, conversione', async () => {
  const d = mkdtempSync(join(tmpdir(), 'manti-cc-'));
  const ledger = join(d, 'ledger.jsonl');
  const { frase: fraseBanca } = banca.nuovaFrase();
  await banca.genesi(ledger, fraseBanca);
  await banca.giorno(ledger, fraseBanca, '2026-09-01');
  const anna = cc.nuovo();
  const bruno = cc.nuovo();
  assert.equal(cc.coordinate(anna.frase), anna.coordinate);
  assert.throws(() => cc.coordinate('abaco'), /frase non valida/);
  assert.deepEqual(await cc.saldo(ledger, anna.frase), { totale: 0, valore: null, in_euro: null, entrate: [] });

  await banca.vendita(ledger, fraseBanca, '50', anna.coordinate, 'bonifico 1');
  let s = await cc.saldo(ledger, anna.frase);
  assert.equal(s.totale, 5000);
  assert.equal(s.in_euro, 5000n);
  assert.equal(s.entrate[0].tag, 'vendita');

  const p = await cc.paga(ledger, anna.frase, '12,50', bruno.coordinate, 'pizza');
  assert.equal(p.riga.type, 'transfer');
  assert.equal(p.resto, 3750);
  s = await cc.saldo(ledger, bruno.frase);
  assert.equal(s.totale, 1250);
  assert.equal(s.entrate[0].causale, 'pizza');
  assert.equal(s.entrate[0].chiaro, false);
  await assert.rejects(async () => await cc.paga(ledger, bruno.frase, '20', anna.coordinate), /saldo insufficiente/);
  await assert.rejects(async () => await cc.paga(ledger, bruno.frase, '1', 'mnt1…'), /coordinate non valide: servono quelle intere/);

  const r = await cc.converti(ledger, bruno.frase, '10', 'Bruno Neri, IT11A0000000000000000000000');
  assert.equal(r.riga.type, 'conversion.request');
  assert.equal(r.euro_oggi, 980n);
  await assert.rejects(async () => await cc.converti(ledger, bruno.frase, '1', ''), /dati per il pagamento/);
  const attesa = await banca.conversioniInAttesa(ledger, fraseBanca);
  assert.equal(attesa.length, 1);
  assert.equal(attesa[0].dati, 'Bruno Neri, IT11A0000000000000000000000');
  await banca.esegui(ledger, fraseBanca, attesa[0].hash);
  assert.equal((await cc.saldo(ledger, bruno.frase)).totale, 250);
  assert.equal(pubblica(ledger, join(d, 'sito')).ok, true);
});
