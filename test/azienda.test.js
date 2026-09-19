import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Registro, preparaRiga, firmaRiga } from '../nucleo/registro.js';
import { tipiBanca, prezzoAcquisto, mantiPerEuro } from '../nucleo/banca.js';
import { tipiAzienda } from '../nucleo/azienda.js';
import { regolaTransfer } from '../nucleo/trasferimento.js';
import { regolaSpesaInChiaro } from '../nucleo/uscite.js';
import { coppiaDaSeme, firma } from '../nucleo/chiavi.js';
import { portafoglioDaFrase, creaIndirizzo } from '../nucleo/portafoglio.js';
import { generaFrase } from '../nucleo/frase.js';
import { mieEntrate, saldo, costruisciPagamento, costruisciPagamentoRiservato } from '../nucleo/pagamento.js';

const banca = coppiaDaSeme(new Uint8Array(32).fill(1));
const aziendaK = coppiaDaSeme(new Uint8Array(32).fill(2));
const poliziaK = coppiaDaSeme(new Uint8Array(32).fill(3));
const PARAMETRI = { sovrapprezzo_pct: 5, commissione_pct: 2, multe_bruciate_pct: 50, tetto_cent: 100000000, giorni_multa: 15 };
const tipi = { ...tipiBanca, ...tipiAzienda, transfer: regolaTransfer, spesa: regolaSpesaInChiaro };
const firmaDi = (c) => ({ by: c.pubblica, firma: (h) => firma(c.privata, h) });
let orologio = 0;
const ts = () => `2027-01-${String(1 + Math.floor(orologio / 86400)).padStart(2, '0')}T${String(Math.floor((orologio++ % 86400) / 3600)).padStart(2, '0')}:00:00Z`;

function nuovoRegistro() {
  const reg = new Registro({ tipi });
  const coord = portafoglioDaFrase(generaFrase()).coordinate;
  reg.accoda(firmaRiga(preparaRiga(null, { type: 'genesis', ts: '2026-12-31T00:00:00Z', body: { banca: { chiave: banca.pubblica, coordinate: coord }, parametri: PARAMETRI } }), [firmaDi(banca)]));
  return reg;
}
const riga = (reg, type, body, firmatari) => firmaRiga(preparaRiga(reg.ultima, { type, ts: ts(), body }), firmatari);

function vendita(reg, coordinate, euroCent) {
  const prezzo = prezzoAcquisto(reg.stato);
  const manti = mantiPerEuro(BigInt(euroCent), prezzo);
  const i = creaIndirizzo(coordinate);
  return riga(reg, 'sale', { euro_cent: euroCent, prezzo: Number(prezzo), out: [{ addr: i.addr, eph: i.eph, amount: Number(manti), tag: 'vendita' }], pagamento: 'bonifico 1' }, [firmaDi(banca)]);
}

/** Azienda registrata, con catalogo, e manti sul conto. */
function aziendaPronta() {
  const reg = nuovoRegistro();
  const az = portafoglioDaFrase(generaFrase());
  reg.accoda(riga(reg, 'company.register', { chiave: aziendaK.pubblica, coordinate: az.coordinate, nome: 'Officina Rossi' }, [firmaDi(banca)]));
  reg.accoda(riga(reg, 'catalog.set', { azienda: aziendaK.pubblica, voci: [{ codice: 'puntualita', nome: 'Mese senza ritardi', amount: 5000 }, { codice: 'idea', nome: 'Idea adottata', amount: 20000 }] }, [firmaDi(aziendaK)]));
  reg.accoda(vendita(reg, az.coordinate, 1000000)); // 10.000 € → 1.000.000 centesimi di manto
  return { reg, az };
}

/** Il pannello azienda: stipendi uguali, premi da catalogo, resto all'azienda. */
function payout(reg, az, destinazioni, mod = (b) => b) {
  const disponibili = mieEntrate(reg, az);
  const { body, firmatari } = costruisciPagamento({ portafoglio: az, disponibili, destinazioni });
  const out = body.out.map((u, i) => (i < destinazioni.length ? u : { ...u, tag: 'resto' }));
  return riga(reg, 'payout', mod({ azienda: aziendaK.pubblica, in: body.in, out }), [firmaDi(aziendaK), ...firmatari]);
}

test('registrazione: una volta per chiave, non la banca, coordinate vere, nome', () => {
  const reg = nuovoRegistro();
  const az = portafoglioDaFrase(generaFrase());
  const corpo = { chiave: aziendaK.pubblica, coordinate: az.coordinate, nome: 'Officina Rossi' };
  assert.throws(() => reg.accoda(riga(reg, 'company.register', corpo, [firmaDi(aziendaK)])), /manca la firma/);
  reg.accoda(riga(reg, 'company.register', corpo, [firmaDi(banca)]));
  assert.equal(reg.stato.aziende[aziendaK.pubblica].nome, 'Officina Rossi');
  assert.throws(() => reg.accoda(riga(reg, 'company.register', corpo, [firmaDi(banca)])), /già registrata/);
  assert.throws(() => reg.accoda(riga(reg, 'company.register', { ...corpo, chiave: banca.pubblica }, [firmaDi(banca)])), /banca/);
  assert.throws(() => reg.accoda(riga(reg, 'company.register', { ...corpo, chiave: poliziaK.pubblica, coordinate: 'mnt1zzz' }, [firmaDi(banca)])), /coordinate non valide/);
  assert.throws(() => reg.accoda(riga(reg, 'company.register', { ...corpo, chiave: poliziaK.pubblica, nome: ' ' }, [firmaDi(banca)])), /nome/);
});

test('polizia, catalogo e tariffario: li firma l\'azienda, sostituiscono i precedenti', () => {
  const reg = nuovoRegistro();
  const az = portafoglioDaFrase(generaFrase());
  const pol = portafoglioDaFrase(generaFrase());
  reg.accoda(riga(reg, 'company.register', { chiave: aziendaK.pubblica, coordinate: az.coordinate, nome: 'Officina Rossi' }, [firmaDi(banca)]));
  const nomina = { azienda: aziendaK.pubblica, chiave: poliziaK.pubblica, coordinate: pol.coordinate };
  assert.throws(() => reg.accoda(riga(reg, 'police.appoint', nomina, [firmaDi(banca)])), /manca la firma/);
  assert.throws(() => reg.accoda(riga(reg, 'police.appoint', { ...nomina, chiave: aziendaK.pubblica }, [firmaDi(aziendaK)])), /chiave propria/);
  assert.throws(() => reg.accoda(riga(reg, 'police.appoint', { ...nomina, azienda: poliziaK.pubblica }, [firmaDi(poliziaK)])), /azienda sconosciuta/);
  reg.accoda(riga(reg, 'police.appoint', nomina, [firmaDi(aziendaK)]));
  assert.equal(reg.stato.aziende[aziendaK.pubblica].polizia.chiave, poliziaK.pubblica);

  const voci = [{ codice: 'puntualita', nome: 'Mese senza ritardi', amount: 5000 }];
  reg.accoda(riga(reg, 'catalog.set', { azienda: aziendaK.pubblica, voci }, [firmaDi(aziendaK)]));
  assert.deepEqual(reg.stato.aziende[aziendaK.pubblica].catalogo, { puntualita: { nome: 'Mese senza ritardi', amount: 5000 } });
  reg.accoda(riga(reg, 'catalog.set', { azienda: aziendaK.pubblica, voci: [] }, [firmaDi(aziendaK)]));
  assert.deepEqual(reg.stato.aziende[aziendaK.pubblica].catalogo, {}, 'il catalogo è completo, non incrementale');
  assert.throws(() => reg.accoda(riga(reg, 'catalog.set', { azienda: aziendaK.pubblica, voci: [...voci, ...voci] }, [firmaDi(aziendaK)])), /codice ripetuto/);
  assert.throws(() => reg.accoda(riga(reg, 'catalog.set', { azienda: aziendaK.pubblica, voci: [{ codice: 'Maiuscolo', nome: 'x', amount: 1 }] }, [firmaDi(aziendaK)])), /codice non valido/);
  assert.throws(() => reg.accoda(riga(reg, 'catalog.set', { azienda: aziendaK.pubblica, voci: [{ codice: 'a', nome: 'x', amount: 0 }] }, [firmaDi(aziendaK)])), /importo non valido/);
  reg.accoda(riga(reg, 'tariff.set', { azienda: aziendaK.pubblica, voci: [{ codice: 'ritardo', nome: 'Ritardo oltre 10 minuti', amount: 300 }] }, [firmaDi(aziendaK)]));
  assert.equal(reg.stato.aziende[aziendaK.pubblica].tariffario.ritardo.amount, 300);
});

test('payout: tre stipendi uguali, un premio da catalogo, resto all\'azienda; i dipendenti vedono i tag', () => {
  const { reg, az } = aziendaPronta();
  const [d1, d2, d3] = [1, 2, 3].map(() => portafoglioDaFrase(generaFrase()));
  const r = payout(reg, az, [
    { coordinate: d1.coordinate, amount: 150000, tag: 'stipendio' },
    { coordinate: d2.coordinate, amount: 150000, tag: 'stipendio' },
    { coordinate: d3.coordinate, amount: 150000, tag: 'stipendio', causale: 'gennaio' },
    { coordinate: d1.coordinate, amount: 5000, tag: 'premio', voce: 'puntualita' },
  ]);
  reg.accoda(r);
  assert.equal(saldo(mieEntrate(reg, d1)), 155000);
  assert.deepEqual(mieEntrate(reg, d1).map((e) => e.tag).sort(), ['premio', 'stipendio']);
  assert.equal(mieEntrate(reg, d3)[0].causale, 'gennaio');
  assert.equal(saldo(mieEntrate(reg, az)), 1000000 - 455000);
  assert.equal(mieEntrate(reg, az)[0].tag, 'resto');
  assert.equal(reg.stato.aziende[aziendaK.pubblica].pagati_cent, 455000n);
  assert.equal(reg.stato.circolazione_cent, 1000000n);
  assert.equal(r.sigs.length, 2, 'azienda più l\'entrata');
});

test('payout rifiutato: stipendi diversi, premio fuori catalogo o con importo diverso, tag estraneo, due resti, senza firma dell\'azienda', () => {
  const { reg, az } = aziendaPronta();
  const d = portafoglioDaFrase(generaFrase());
  const due = (a1, a2) => [{ coordinate: d.coordinate, amount: a1, tag: 'stipendio' }, { coordinate: d.coordinate, amount: a2, tag: 'stipendio' }];
  assert.throws(() => reg.accoda(payout(reg, az, due(1000, 1001))), /tutti uguali/);
  assert.throws(() => reg.accoda(payout(reg, az, [{ coordinate: d.coordinate, amount: 5000, tag: 'premio', voce: 'ferie' }])), /non in catalogo/);
  assert.throws(() => reg.accoda(payout(reg, az, [{ coordinate: d.coordinate, amount: 4999, tag: 'premio', voce: 'puntualita' }])), /il catalogo dice 5000/);
  assert.throws(() => reg.accoda(payout(reg, az, [{ coordinate: d.coordinate, amount: 5000, tag: 'premio' }])), /senza voce/);
  assert.throws(() => reg.accoda(payout(reg, az, [{ coordinate: d.coordinate, amount: 5000, tag: 'vendita' }])), /non ammesso nel payout/);
  assert.throws(() => reg.accoda(payout(reg, az, [{ coordinate: az.coordinate, amount: 5000, tag: 'stipendio' }], (b) => ({ ...b, out: b.out.map((u) => ({ ...u, tag: 'resto' })) }))), /un solo resto/);
  assert.throws(() => reg.accoda(payout(reg, az, [{ coordinate: az.coordinate, amount: 1000000, tag: 'stipendio' }], (b) => ({ ...b, out: b.out.map((u) => ({ ...u, tag: 'resto' })) }))), /niente stipendi né premi/);
  assert.throws(() => reg.accoda(payout(reg, az, due(1000, 1000), (b) => ({ ...b, out: [...b.out, { ...b.out[2], amount: 1 }] }))), /un solo resto|entrate/);
  assert.throws(() => reg.accoda(payout(reg, az, due(1000, 1000), (b) => ({ ...b, azienda: poliziaK.pubblica }))), /azienda sconosciuta/);
  const r = payout(reg, az, due(1000, 1000));
  assert.throws(() => reg.accoda({ ...r, sigs: r.sigs.slice(1) }), /manca la firma/);
  reg.accoda(r);
});

test('rivelazione: l\'azienda incassa un pagamento riservato e lo spende in chiaro; nei due versi contro la doppia spesa', () => {
  const { reg, az } = aziendaPronta();
  const cliente = portafoglioDaFrase(generaFrase());
  const d = portafoglioDaFrase(generaFrase());
  reg.accoda(vendita(reg, cliente.coordinate, 50000));
  // il cliente paga l'azienda in modo riservato
  const p = costruisciPagamentoRiservato({ portafoglio: cliente, disponibili: mieEntrate(reg, cliente), destinazioni: [{ coordinate: az.coordinate, amount: 30000, causale: 'riparazione' }], stato: reg.stato });
  reg.accoda(riga(reg, 'transfer', p.body, p.firmatari));
  const incasso = mieEntrate(reg, az).find((e) => !e.chiaro);
  assert.ok(incasso);
  assert.equal(incasso.amount, 30000);
  assert.equal(incasso.causale, 'riparazione');

  // lo spende in chiaro: la riga porta la rivelazione
  const { body, firmatari } = costruisciPagamento({ portafoglio: az, disponibili: [incasso], destinazioni: [{ coordinate: d.coordinate, amount: 30000, tag: 'stipendio' }] });
  assert.equal(typeof body.in[0], 'object');
  assert.equal(body.in[0].amount, 30000);
  assert.equal(body.in[0].img, incasso.img);
  assert.ok('img' in firmatari[0]);
  const r = riga(reg, 'payout', { azienda: aziendaK.pubblica, in: body.in, out: body.out }, [firmaDi(aziendaK), ...firmatari]);
  reg.accoda(r);
  assert.equal(saldo(mieEntrate(reg, d)), 30000);
  assert.equal(reg.stato.uscite[incasso.ref].spesa, true, 'esce dagli anelli futuri');
  assert.equal(reg.stato.immagini[incasso.img], r.hash, 'l\'immagine è registrata');
  assert.equal(reg.stato.circolazione_cent, 1000000n + 47619n, 'la seconda vendita è a 1,05');

  // non si rivela due volte, e con maschera o importo sbagliati non si apre
  const ancora = () => riga(reg, 'payout', { azienda: aziendaK.pubblica, in: body.in, out: body.out }, [firmaDi(aziendaK), ...firmatari]);
  assert.throws(() => reg.accoda(ancora()), /già spesa/);
  const { reg: reg2, az: az2 } = aziendaPronta();
  reg2.accoda(vendita(reg2, cliente.coordinate, 50000));
  const p2 = costruisciPagamentoRiservato({ portafoglio: cliente, disponibili: mieEntrate(reg2, cliente), destinazioni: [{ coordinate: az2.coordinate, amount: 30000 }], stato: reg2.stato });
  reg2.accoda(riga(reg2, 'transfer', p2.body, p2.firmatari));
  const inc2 = mieEntrate(reg2, az2).find((e) => !e.chiaro);
  const costruisci = (mod) => {
    const { body: b2, firmatari: f2 } = costruisciPagamento({ portafoglio: az2, disponibili: [inc2], destinazioni: [{ coordinate: d.coordinate, amount: 30000, tag: 'stipendio' }] });
    mod(b2);
    return riga(reg2, 'payout', { azienda: aziendaK.pubblica, in: b2.in, out: b2.out }, [firmaDi(aziendaK), ...f2]);
  };
  assert.throws(() => reg2.accoda(costruisci((b2) => { b2.in[0].mask = 'ab'.repeat(32); })), /fuori dall'ordine/);
  assert.throws(() => reg2.accoda(costruisci((b2) => { b2.in[0].mask = '01' + '00'.repeat(31); })), /non aprono/);
  assert.throws(() => reg2.accoda(costruisci((b2) => { b2.in[0].amount = 29999; })), /non aprono/);
  assert.throws(() => reg2.accoda(costruisci((b2) => { b2.in[0].img = 'ab'.repeat(32); })), /manca la firma ad anello/);
  assert.throws(() => reg2.accoda(costruisci((b2) => { b2.in[0] = inc2.ref; })), /va rivelata/);
  // e un'uscita già spesa in anello non si può rivelare
  const p3 = costruisciPagamentoRiservato({ portafoglio: az2, disponibili: [inc2], destinazioni: [{ coordinate: cliente.coordinate, amount: 30000 }], stato: reg2.stato });
  reg2.accoda(riga(reg2, 'transfer', p3.body, p3.firmatari));
  assert.throws(() => reg2.accoda(costruisci(() => {})), /già spesa in anello/);
});

test('il registro si ricostruisce con lo stesso stato', () => {
  const { reg, az } = aziendaPronta();
  const d = portafoglioDaFrase(generaFrase());
  reg.accoda(payout(reg, az, [{ coordinate: d.coordinate, amount: 1000, tag: 'stipendio' }]));
  const copia = Registro.daRighe(JSON.parse(JSON.stringify(reg.righe)), { tipi });
  assert.deepEqual(copia.stato, reg.stato);
});
