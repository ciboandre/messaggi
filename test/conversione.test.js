import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Registro, preparaRiga, firmaRiga } from '../nucleo/registro.js';
import { tipiBanca, prezzoAcquisto, prezzoConversione, mantiPerEuro, euroPerManti, valore } from '../nucleo/banca.js';
import { tipiConversione, apriDatiConversione } from '../nucleo/conversione.js';
import { regolaTransfer } from '../nucleo/trasferimento.js';
import { regolaSpesaInChiaro } from '../nucleo/uscite.js';
import { coppiaDaSeme, firma } from '../nucleo/chiavi.js';
import { portafoglioDaFrase, creaIndirizzo } from '../nucleo/portafoglio.js';
import { generaFrase } from '../nucleo/frase.js';
import { mieEntrate, saldo, costruisciRichiestaConversione, costruisciPagamentoRiservato } from '../nucleo/pagamento.js';
import { impegno, mascheraCasuale } from '../nucleo/impegni.js';

const banca = coppiaDaSeme(new Uint8Array(32).fill(1));
const PARAMETRI = { sovrapprezzo_pct: 5, commissione_pct: 2, multe_bruciate_pct: 50, tetto_cent: 100000000, giorni_multa: 15 };
const tipi = { ...tipiBanca, ...tipiConversione, transfer: regolaTransfer, spesa: regolaSpesaInChiaro };
const firmaBanca = { by: banca.pubblica, firma: (h) => firma(banca.privata, h) };
let orologio = 0;
const ts = () => `2027-02-${String(1 + Math.floor(orologio / 86400)).padStart(2, '0')}T${String(Math.floor((orologio++ % 86400) / 3600)).padStart(2, '0')}:00:00Z`;
const riga = (reg, type, body, firmatari) => firmaRiga(preparaRiga(reg.ultima, { type, ts: ts(), body }), firmatari);

function nuovoRegistro() {
  const reg = new Registro({ tipi });
  const pb = portafoglioDaFrase(generaFrase());
  reg.accoda(firmaRiga(preparaRiga(null, { type: 'genesis', ts: '2027-01-31T00:00:00Z', body: { banca: { chiave: banca.pubblica, coordinate: pb.coordinate }, parametri: PARAMETRI } }), [firmaBanca]));
  return { reg, pb };
}
function vendita(reg, coordinate, euroCent) {
  const prezzo = prezzoAcquisto(reg.stato);
  const manti = mantiPerEuro(BigInt(euroCent), prezzo);
  const i = creaIndirizzo(coordinate);
  return riga(reg, 'sale', { euro_cent: euroCent, prezzo: Number(prezzo), out: [{ addr: i.addr, eph: i.eph, amount: Number(manti), tag: 'vendita' }], pagamento: 'bonifico' }, [firmaBanca]);
}
function richiesta(reg, pb, chi, amount, mod = (b) => b) {
  const { body, firmatari } = costruisciRichiestaConversione({ portafoglio: chi, disponibili: mieEntrate(reg, chi), amount, dati: 'Mario Rossi, IT60X0542811101000000123456', coordinateBanca: pb.coordinate, stato: reg.stato });
  return riga(reg, 'conversion.request', mod(body), firmatari);
}
function esegui(reg, richiestaHash, mod = (b) => b) {
  const c = reg.stato.conversioni[richiestaHash];
  const prezzo = prezzoConversione(reg.stato);
  return riga(reg, 'conversion.execute', mod({ richiesta: richiestaHash, prezzo: Number(prezzo), euro_cent: Number(euroPerManti(BigInt(c.amount), prezzo)) }), [firmaBanca]);
}

test('andata e ritorno: vendita, richiesta con resto riservato, esecuzione al prezzo del giorno, pagamento', () => {
  const { reg, pb } = nuovoRegistro();
  const a = portafoglioDaFrase(generaFrase());
  const b = portafoglioDaFrase(generaFrase());
  reg.accoda(vendita(reg, a.coordinate, 100000)); // 1.000 € → 1.000 manti
  reg.accoda(vendita(reg, b.coordinate, 100000)); // a 1,05: 952,38 manti, valore sale a 1,0243
  const prima = valore(reg.stato);
  const r = richiesta(reg, pb, a, 60000);
  reg.accoda(r);
  assert.equal(r.body.amount, 60000);
  assert.equal(r.body.out.length, 1, 'resto riservato');
  assert.ok(r.body.proof);
  assert.equal(r.body.in[0].ring.length, 2);
  assert.equal(reg.stato.conversioni[r.hash].stato, 'richiesta');
  assert.equal(reg.stato.circolazione_cent, 195238n, 'i manti chiesti circolano finché non sono bruciati');
  assert.equal(saldo(mieEntrate(reg, a)), 40000, 'ad a resta il resto');
  assert.equal(mieEntrate(reg, a)[0].chiaro, false);
  assert.equal(apriDatiConversione(r.body.dati, pb), 'Mario Rossi, IT60X0542811101000000123456');
  assert.equal(apriDatiConversione(r.body.dati, a), null, 'nessun altro li legge');
  assert.ok(!JSON.stringify(r).includes('IT60X'), 'l\'IBAN non è nel registro');

  // un interesse tra richiesta ed esecuzione: il prezzo che vale è quello dell'esecuzione, più alto
  reg.accoda(riga(reg, 'reserve.interest', { euro_cent: 1000, da: '2027-01-01', a: '2027-01-31' }, [firmaBanca]));
  const prezzoOggi = prezzoConversione(reg.stato);
  assert.ok(prezzoOggi > prima * 98n / 100n);
  const e = esegui(reg, r.hash);
  reg.accoda(e);
  const euro = euroPerManti(60000n, prezzoOggi);
  assert.equal(reg.stato.conversioni[r.hash].stato, 'eseguita');
  assert.equal(reg.stato.conversioni[r.hash].euro_cent, euro);
  assert.equal(reg.stato.circolazione_cent, 135238n);
  assert.equal(reg.stato.bruciati_cent, 60000n);
  assert.equal(reg.stato.riserva_cent, 201000n - euro);
  assert.equal(reg.stato.convertiti_cent, 60000n);
  assert.ok(valore(reg.stato) > prima, 'la commissione resta in riserva e il valore sale');

  assert.throws(() => reg.accoda(riga(reg, 'conversion.paid', { richiesta: r.hash, data: 'domani' }, [firmaBanca])), /data/);
  reg.accoda(riga(reg, 'conversion.paid', { richiesta: r.hash, data: '2027-02-03' }, [firmaBanca]));
  assert.equal(reg.stato.conversioni[r.hash].stato, 'pagata');
  assert.throws(() => reg.accoda(riga(reg, 'conversion.paid', { richiesta: r.hash, data: '2027-02-03' }, [firmaBanca])), /non eseguita/);
  assert.throws(() => reg.accoda(esegui(reg, r.hash)), /già pagata/);
});

test('richiesta di tutto: il resto c\'è lo stesso, da zero, così lo pseudo-impegno non svela l\'entrata; bilancio con l\'importo pubblico', () => {
  const { reg, pb } = nuovoRegistro();
  const a = portafoglioDaFrase(generaFrase());
  reg.accoda(vendita(reg, a.coordinate, 100000));
  const r = richiesta(reg, pb, a, 100000);
  assert.equal(r.body.out.length, 1);
  assert.ok(r.body.proof);
  assert.notEqual(r.body.in[0].pseudo, reg.stato.uscite[r.body.in[0].ring[0]].commit, 'lo pseudo-impegno non coincide con l\'impegno vero');
  assert.throws(() => reg.accoda(richiesta(reg, pb, a, 100000, (b) => ({ ...b, out: [] }))), /esattamente un resto/);
  assert.throws(() => reg.accoda(richiesta(reg, pb, a, 100000, (b) => ({ ...b, proof: {} }))), /prova di intervallo/);
  assert.throws(() => reg.accoda(richiesta(reg, pb, a, 100000, (b) => ({ ...b, amount: 99999 }))), /bilancio/);
  assert.throws(() => reg.accoda(richiesta(reg, pb, a, 100000, (b) => ({ ...b, amount: 0 }))), /importo non valido/);
  assert.throws(() => reg.accoda(richiesta(reg, pb, a, 100000, (b) => ({ ...b, dati: { ...b.dati, memo: 'x' } }))), /dati cifrati/);
  assert.throws(() => reg.accoda(richiesta(reg, pb, a, 100000, (b) => ({ ...b, extra: 1 }))), /campi sconosciuti/);
  reg.accoda(r);
  assert.equal(saldo(mieEntrate(reg, a)), 0, 'il resto da zero vale zero');
  assert.equal(mieEntrate(reg, a).length, 1, 'ma esiste, e l\'app lo vede');
  // il resto manomesso: impegno diverso → bilancio; prova di un altro → prova
  const { reg: reg2, pb: pb2 } = nuovoRegistro();
  reg2.accoda(vendita(reg2, a.coordinate, 100000));
  assert.throws(() => reg2.accoda(richiesta(reg2, pb2, a, 60000, (b) => { b.out[0].commit = impegno(40000, mascheraCasuale()); return b; })), /bilancio/);
  const altra = richiesta(reg2, pb2, a, 60000).body.proof;
  assert.throws(() => reg2.accoda(richiesta(reg2, pb2, a, 60000, (b) => ({ ...b, proof: altra }))), /prova di intervallo/);
});

test('i manti chiesti non sono un\'uscita: non stanno negli anelli e non si spendono; la richiesta non si esegue due volte', () => {
  const { reg, pb } = nuovoRegistro();
  const a = portafoglioDaFrase(generaFrase());
  const b = portafoglioDaFrase(generaFrase());
  reg.accoda(vendita(reg, a.coordinate, 100000));
  reg.accoda(vendita(reg, b.coordinate, 100));
  const r = richiesta(reg, pb, a, 100000);
  reg.accoda(r);
  assert.equal(reg.stato.disponibili, 3, 'le due vendite e il resto da zero; i manti chiesti non sono un\'uscita');
  assert.equal(Object.keys(reg.stato.uscite).length, 3);
  // a ha solo il resto da zero; la stessa entrata in una nuova richiesta è una doppia spesa
  assert.equal(saldo(mieEntrate(reg, a)), 0);
  const stantia = costruisciRichiestaConversione({ portafoglio: a, disponibili: [{ ...Object.values(reg.stato.uscite)[0], ...mieEntrateVecchie(reg, a) }], amount: 1, dati: 'x', coordinateBanca: pb.coordinate, stato: reg.stato });
  assert.throws(() => reg.accoda(riga(reg, 'conversion.request', stantia.body, stantia.firmatari)), /già spesa/);
  reg.accoda(esegui(reg, r.hash));
  assert.throws(() => reg.accoda(esegui(reg, r.hash)), /già eseguita/);
  assert.throws(() => reg.accoda(riga(reg, 'conversion.execute', { richiesta: 'f'.repeat(64), prezzo: 1, euro_cent: 1 }, [firmaBanca])), /inesistente/);
});

/** L'entrata di a come la vedeva prima di spenderla (per simulare un'app con la copia vecchia). */
function mieEntrateVecchie(reg, a) {
  const copia = Registro.daRighe(reg.righe.slice(0, 3), { tipi });
  return mieEntrate(copia, a)[0];
}

test('esecuzione: prezzo o euro diversi da quelli del giorno vengono rifiutati; li firma solo la banca', () => {
  const { reg, pb } = nuovoRegistro();
  const a = portafoglioDaFrase(generaFrase());
  reg.accoda(vendita(reg, a.coordinate, 100000));
  const r = richiesta(reg, pb, a, 50000);
  reg.accoda(r);
  assert.throws(() => reg.accoda(esegui(reg, r.hash, (b) => ({ ...b, prezzo: b.prezzo + 1 }))), /oggi vale/);
  assert.throws(() => reg.accoda(esegui(reg, r.hash, (b) => ({ ...b, euro_cent: b.euro_cent + 1 }))), /dovuti/);
  const e = esegui(reg, r.hash);
  const altro = coppiaDaSeme(new Uint8Array(32).fill(7));
  assert.throws(() => reg.accoda(firmaRiga({ ...e, sigs: undefined }, [{ by: altro.pubblica, firma: (h) => firma(altro.privata, h) }])), /manca la firma/);
  reg.accoda(e);
  assert.equal(reg.stato.riserva_cent, 100000n - 49000n, '500 manti a 0,98 = 490 €');
});

test('tutti convertono: la riserva copre, e a circolazione zero il prezzo torna quello di lancio', () => {
  const { reg, pb } = nuovoRegistro();
  const a = portafoglioDaFrase(generaFrase());
  reg.accoda(vendita(reg, a.coordinate, 100000));
  const r = richiesta(reg, pb, a, 100000);
  reg.accoda(r);
  reg.accoda(esegui(reg, r.hash));
  assert.equal(reg.stato.circolazione_cent, 0n);
  assert.equal(reg.stato.riserva_cent, 2000n, 'il 2% resta');
  assert.equal(valore(reg.stato), null);
  assert.equal(prezzoAcquisto(reg.stato), 10000n);
  reg.accoda(vendita(reg, a.coordinate, 10000));
  assert.equal(valore(reg.stato), 12000n, 'la riserva residua va a chi compra dopo');
});

test('il registro si ricostruisce con lo stesso stato', () => {
  const { reg, pb } = nuovoRegistro();
  const a = portafoglioDaFrase(generaFrase());
  reg.accoda(vendita(reg, a.coordinate, 100000));
  const p = costruisciPagamentoRiservato({ portafoglio: a, disponibili: mieEntrate(reg, a), destinazioni: [{ coordinate: a.coordinate, amount: 30000 }], stato: reg.stato });
  reg.accoda(riga(reg, 'transfer', p.body, p.firmatari));
  const r = richiesta(reg, pb, a, 50000);
  reg.accoda(r);
  reg.accoda(esegui(reg, r.hash));
  reg.accoda(riga(reg, 'conversion.paid', { richiesta: r.hash, data: '2027-02-05' }, [firmaBanca]));
  const copia = Registro.daRighe(JSON.parse(JSON.stringify(reg.righe)), { tipi });
  assert.deepEqual(copia.stato, reg.stato);
  assert.equal(saldo(mieEntrate(copia, a)), 50000);
});
