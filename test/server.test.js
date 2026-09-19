import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { avvia } from '../server/server.js';
import { registroDalServer, inviaRiga } from '../strumenti/cliente.js';
import { identitaBanca, nuovaFrase, PARAMETRI } from '../banca/comandi.js';
import { nuovo } from '../correntista/comandi.js';
import { portafoglioDaFrase, creaIndirizzo } from '../nucleo/portafoglio.js';
import { prezzoAcquisto, mantiPerEuro } from '../nucleo/banca.js';
import { mieEntrate, saldo, costruisciPagamentoRiservato } from '../nucleo/pagamento.js';
import { preparaRiga, firmaRiga } from '../nucleo/registro.js';

test('server: prossima, righe accodate, 400 con il motivo, 409 se prev è vecchio, registro e stato', async () => {
  const d = mkdtempSync(join(tmpdir(), 'manti-srv-'));
  const percorso = join(d, 'ledger.jsonl');
  const s = avvia({ percorso, porta: 0 });
  const url = `http://localhost:${s.porta()}`;
  try {
    const { frase } = nuovaFrase();
    const banca = identitaBanca(frase);
    const p0 = await (await fetch(`${url}/prossima`)).json();
    assert.equal(p0.seq, 0);
    assert.equal(p0.prev, '0'.repeat(64));

    // genesi via server
    const g = await inviaRiga(url, () => ({ type: 'genesis', body: { banca: { chiave: banca.chiave.pubblica, coordinate: banca.portafoglio.coordinate }, parametri: PARAMETRI }, firmatari: [banca.firmatario] }));
    assert.equal(g.seq, 0);
    // giorno e vendita
    await inviaRiga(url, () => ({ type: 'day', body: { data: '2026-09-01' }, firmatari: [banca.firmatario] }));
    const anna = nuovo();
    const pa = portafoglioDaFrase(anna.frase);
    await inviaRiga(url, (reg) => {
      const prezzo = prezzoAcquisto(reg.stato);
      const i = creaIndirizzo(anna.coordinate);
      return { type: 'sale', body: { euro_cent: 5000, prezzo: Number(prezzo), pagamento: 'b1', out: [{ addr: i.addr, eph: i.eph, amount: Number(mantiPerEuro(5000n, prezzo)), tag: 'vendita' }] }, firmatari: [banca.firmatario] };
    });
    // il correntista paga, costruendo sullo stato del server
    const bruno = nuovo();
    const pag = await inviaRiga(url, (reg) => {
      const { body, firmatari } = costruisciPagamentoRiservato({ portafoglio: pa, disponibili: mieEntrate(reg, pa), destinazioni: [{ coordinate: bruno.coordinate, amount: 1250 }], stato: reg.stato });
      return { type: 'transfer', body, firmatari };
    });
    assert.equal(pag.seq, 3);
    const reg = await registroDalServer(url);
    assert.equal(reg.righe.length, 4);
    assert.equal(saldo(mieEntrate(reg, portafoglioDaFrase(bruno.frase))), 1250);
    assert.equal(readFileSync(percorso, 'utf8').split('\n').filter(Boolean).length, 4, 'sul disco');

    // 400: riga firmata da chi non può
    const altro = identitaBanca(nuovaFrase().frase);
    const p = await (await fetch(`${url}/prossima`)).json();
    const cattiva = firmaRiga(preparaRiga(reg.ultima, { type: 'day', body: { data: '2026-09-02' }, ts: p.ts }), [altro.firmatario]);
    const r400 = await fetch(`${url}/righe`, { method: 'POST', body: JSON.stringify(cattiva) });
    assert.equal(r400.status, 400);
    assert.match((await r400.json()).errore, /manca la firma/);
    // 409: prev vecchio
    const vecchia = firmaRiga(preparaRiga(reg.righe[1], { type: 'day', body: { data: '2026-09-02' }, ts: p.ts }), [banca.firmatario]);
    const r409 = await fetch(`${url}/righe`, { method: 'POST', body: JSON.stringify(vecchia) });
    assert.equal(r409.status, 409);
    assert.equal((await r409.json()).seq, 4);
    // JSON rotto e 404
    assert.equal((await fetch(`${url}/righe`, { method: 'POST', body: '{' })).status, 400);
    assert.equal((await fetch(`${url}/niente`)).status, 404);
    // stato e registro da N
    const stato = await (await fetch(`${url}/stato`)).json();
    assert.equal(stato.circolazione_cent, '5000');
    assert.equal(stato.ultima_riga.seq, 3);
    const daDue = (await (await fetch(`${url}/registro?da=2`)).text()).split('\n').filter(Boolean);
    assert.equal(daDue.length, 2);
    assert.equal(JSON.parse(daDue[0]).seq, 2);
  } finally {
    await s.chiudi();
  }
});

test('server: due righe in gara, una sola entra, l\'altra viene rifirmata sulla nuova posizione', async () => {
  const d = mkdtempSync(join(tmpdir(), 'manti-srv-'));
  const s = avvia({ percorso: join(d, 'ledger.jsonl'), porta: 0 });
  const url = `http://localhost:${s.porta()}`;
  try {
    const banca = identitaBanca(nuovaFrase().frase);
    await inviaRiga(url, () => ({ type: 'genesis', body: { banca: { chiave: banca.chiave.pubblica, coordinate: banca.portafoglio.coordinate }, parametri: PARAMETRI }, firmatari: [banca.firmatario] }));
    const reg = await registroDalServer(url);
    const p = await (await fetch(`${url}/prossima`)).json();
    const a = firmaRiga(preparaRiga(reg.ultima, { type: 'day', body: { data: '2026-09-01' }, ts: p.ts }), [banca.firmatario]);
    const b = firmaRiga(preparaRiga(reg.ultima, { type: 'cap.set', body: { tetto_cent: 500000 }, ts: p.ts }), [banca.firmatario]);
    const [ra, rb] = await Promise.all([a, b].map((r) => fetch(`${url}/righe`, { method: 'POST', body: JSON.stringify(r) })));
    assert.deepEqual([ra.status, rb.status].sort(), [201, 409]);
    // inviaRiga rifirma da sola
    const e = await inviaRiga(url, () => ({ type: 'cap.set', body: { tetto_cent: 600000 }, firmatari: [banca.firmatario] }));
    assert.equal(e.seq, 2);
  } finally {
    await s.chiudi();
  }
});

test('banca e correntista via server: MANTI_SERVER al posto del file, stesse funzioni', async () => {
  const { mkdtempSync } = await import('node:fs');
  const { default: banca } = await import('../banca/comandi.js').then((m) => ({ default: m }));
  const { default: cc } = await import('../correntista/comandi.js').then((m) => ({ default: m }));
  const d = mkdtempSync(join(tmpdir(), 'manti-srv-'));
  const s = avvia({ percorso: join(d, 'ledger.jsonl'), porta: 0 });
  const dest = { server: `http://localhost:${s.porta()}` };
  try {
    const { frase } = banca.nuovaFrase();
    await banca.genesi(dest, frase);
    await banca.giorno(dest, frase, '2026-09-01');
    const anna = cc.nuovo();
    const bruno = cc.nuovo();
    const v = await banca.vendita(dest, frase, '20', anna.coordinate, 'b');
    assert.equal(v.manti, 2000n);
    const p = await cc.paga(dest, anna.frase, '5', bruno.coordinate, 'ciao');
    assert.equal(p.riga.seq, 3);
    assert.equal(p.resto, 1500);
    assert.equal((await cc.saldo(dest, bruno.frase)).totale, 500);
    const r = await cc.converti(dest, bruno.frase, '2', 'Bruno, IT00');
    assert.equal(r.riga.type, 'conversion.request');
    const attesa = await banca.conversioniInAttesa(dest, frase);
    assert.equal(attesa[0].dati, 'Bruno, IT00');
    await banca.esegui(dest, frase, attesa[0].hash);
    await banca.pagata(dest, frase, attesa[0].hash, '2026-09-01');
    const st = await banca.stato(dest);
    assert.equal(st.righe, 7);
    assert.equal(st.in_attesa, 0);
    await assert.rejects(() => banca.giorno(dest, cc.nuovo().frase, '2026-09-02'), /non è quella della banca/);
  } finally {
    await s.chiudi();
  }
});
