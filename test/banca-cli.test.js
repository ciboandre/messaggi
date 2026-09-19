import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as c from '../banca/comandi.js';
import { generaFrase } from '../nucleo/frase.js';
import { portafoglioDaFrase } from '../nucleo/portafoglio.js';
import { apriRegistro } from '../nucleo/registro-file.js';
import { tipi } from '../nucleo/tipi.js';
import { mieEntrate, saldo, costruisciRichiestaConversione } from '../nucleo/pagamento.js';
import { preparaRiga, firmaRiga } from '../nucleo/registro.js';
import { rigaAJsonl } from '../nucleo/registro-file.js';
import { pubblica } from '../motore/pubblica.js';

const dir = () => mkdtempSync(join(tmpdir(), 'manti-banca-'));

test('la frase della banca: stessa frase, stesse chiavi; frase sbagliata rifiutata', () => {
  const { frase, pubblica, coordinate } = c.nuovaFrase();
  assert.equal(frase.split(' ').length, 12);
  const id = c.identitaBanca(frase);
  assert.equal(id.chiave.pubblica, pubblica);
  assert.equal(id.portafoglio.coordinate, coordinate);
  assert.notEqual(c.identitaBanca(generaFrase()).chiave.pubblica, pubblica);
  assert.throws(() => c.identitaBanca('abaco abaco'), /frase non valida/);
});

test('importi: virgola, punto, centesimi', () => {
  assert.equal(c.centesimiDa('12,50'), 1250);
  assert.equal(c.centesimiDa('12.5'), 1250);
  assert.equal(c.centesimiDa('4000'), 400000);
  assert.equal(c.centesimiDa('1250c'), 1250);
  assert.throws(() => c.centesimiDa('12,345'), /importo non valido/);
  assert.throws(() => c.centesimiDa('-1'), /importo non valido/);
});

test('genesi, giorno, vendita, tetto, interessi, estratto: righe accodate e verificate; il motore le rilegge', () => {
  const d = dir();
  const ledger = join(d, 'ledger.jsonl');
  const { frase } = c.nuovaFrase();
  const g = c.genesi(ledger, frase, { tetto_cent: 400000 });
  assert.equal(g.riga.seq, 0);
  assert.equal(g.riga.type, 'genesis');
  assert.throws(() => c.genesi(ledger, frase), /la genesi c'è già/);
  assert.throws(() => c.giorno(ledger, generaFrase(), '2026-09-01'), /non è quella della banca/);
  c.giorno(ledger, frase, '2026-09-01');
  const cliente = portafoglioDaFrase(generaFrase());
  const v = c.vendita(ledger, frase, '1000', cliente.coordinate, 'bonifico 12');
  assert.equal(v.manti, 100000n);
  assert.equal(v.prezzo, 10000n);
  const reg = apriRegistro(ledger, { tipi });
  assert.equal(saldo(mieEntrate(reg, cliente)), 100000);
  c.tetto(ledger, frase, '5000');
  c.interessi(ledger, frase, '2,50', '2026-08-01', '2026-08-31');
  c.estratto(ledger, frase, '2026-08', '1002,50', 'd'.repeat(64));
  assert.throws(() => c.estratto(ledger, frase, '2026-09', '999', 'd'.repeat(64)), /serve una nota/);
  const s = c.stato(ledger);
  assert.equal(s.righe, 6);
  assert.equal(s.valore, 10025n);
  assert.equal(s.riserva_cent, 100250n);
  assert.equal(s.tetto_cent, 500000n);
  const esito = pubblica(ledger, join(d, 'sito'));
  assert.equal(esito.ok, true);
  assert.equal(esito.seq, 5);
  assert.equal(readFileSync(ledger, 'utf8').split('\n').filter(Boolean).length, 6);
});

test('conversioni: la banca legge i dati con la sua frase, esegue al prezzo del giorno, segna pagata', () => {
  const d = dir();
  const ledger = join(d, 'ledger.jsonl');
  const { frase, coordinate: coordBanca } = c.nuovaFrase();
  c.genesi(ledger, frase);
  c.giorno(ledger, frase, '2026-09-01');
  const cliente = portafoglioDaFrase(generaFrase());
  c.vendita(ledger, frase, '500', cliente.coordinate, 'b');
  // il correntista chiede (l'app farà questo)
  const reg = apriRegistro(ledger, { tipi });
  const r = costruisciRichiestaConversione({ portafoglio: cliente, disponibili: mieEntrate(reg, cliente), amount: 20000, dati: 'Anna Verdi, IT99Z0000000000000000000000', coordinateBanca: coordBanca, stato: reg.stato });
  const riga = firmaRiga(preparaRiga(reg.ultima, { type: 'conversion.request', ts: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), body: r.body }), r.firmatari);
  reg.accoda(riga);
  writeFileSync(ledger, readFileSync(ledger, 'utf8') + rigaAJsonl(riga));
  const lista = c.conversioniInAttesa(ledger, frase);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].amount, 20000);
  assert.equal(lista[0].dati, 'Anna Verdi, IT99Z0000000000000000000000');
  assert.equal(lista[0].euro, 19600n, '200 manti a 0,98');
  assert.equal(c.stato(ledger).in_attesa, 1);
  const e = c.esegui(ledger, frase, lista[0].hash);
  assert.equal(e.euro, 19600n);
  c.pagata(ledger, frase, lista[0].hash, '2026-09-02');
  assert.equal(c.conversioniInAttesa(ledger, frase).length, 0);
  assert.equal(c.stato(ledger).riserva_cent, 50000n - 19600n);
  assert.throws(() => c.esegui(ledger, frase, 'f'.repeat(64)), /sconosciuta/);
});
