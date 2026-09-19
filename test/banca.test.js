import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Registro, preparaRiga, firmaRiga } from '../nucleo/registro.js';
import { regolaSpesaInChiaro } from '../nucleo/uscite.js';
import {
  tipiBanca, valore, prezzoAcquisto, prezzoConversione, mantiPerEuro, euroPerManti, spazioSottoTetto,
  controllaCopertura, perDifetto, perEccesso, PREZZO_DI_LANCIO, SCALA_PREZZO,
} from '../nucleo/banca.js';
import { coppiaDaSeme, firma } from '../nucleo/chiavi.js';
import { portafoglioDaFrase, creaIndirizzo } from '../nucleo/portafoglio.js';
import { generaFrase } from '../nucleo/frase.js';
import { mieEntrate, saldo, costruisciPagamento } from '../nucleo/pagamento.js';

const banca = coppiaDaSeme(new Uint8Array(32).fill(1));
const PARAMETRI = { sovrapprezzo_pct: 5, commissione_pct: 2, multe_bruciate_pct: 50, tetto_cent: 400000, giorni_multa: 15 };
const tipi = { ...tipiBanca, spesa: regolaSpesaInChiaro };
const firmaBanca = { by: banca.pubblica, firma: (h) => firma(banca.privata, h) };
let orologio = 0;
const ts = () => `2026-12-${String(1 + Math.floor(orologio / 86400)).padStart(2, '0')}T${String(Math.floor((orologio++ % 86400) / 3600)).padStart(2, '0')}:00:00Z`;

function nuovoRegistro(parametri = PARAMETRI) {
  const reg = new Registro({ tipi });
  const coord = portafoglioDaFrase(generaFrase()).coordinate;
  const g = preparaRiga(null, { type: 'genesis', ts: '2026-11-30T00:00:00Z', body: { banca: { chiave: banca.pubblica, coordinate: coord }, parametri } });
  reg.accoda(firmaRiga(g, [firmaBanca]));
  return reg;
}
const rigaBanca = (reg, type, body) => firmaRiga(preparaRiga(reg.ultima, { type, ts: ts(), body }), [firmaBanca]);

/** Costruisce una vendita come farà il pannello banca. */
function vendita(reg, coordinate, euroCent, mod = {}) {
  const prezzo = prezzoAcquisto(reg.stato);
  const manti = mantiPerEuro(BigInt(euroCent), prezzo);
  const i = creaIndirizzo(coordinate);
  const body = { euro_cent: euroCent, prezzo: Number(prezzo), out: [{ addr: i.addr, eph: i.eph, amount: Number(manti), tag: 'vendita' }], pagamento: `stripe:pi_${orologio}`, ...mod };
  return rigaBanca(reg, 'sale', body);
}

test('arrotondamenti: per difetto e per eccesso, mai con negativi', () => {
  assert.equal(perDifetto(7n, 2n), 3n);
  assert.equal(perEccesso(7n, 2n), 4n);
  assert.equal(perEccesso(8n, 2n), 4n);
  assert.throws(() => perDifetto(-1n, 2n), RangeError);
  assert.throws(() => perEccesso(1n, 0n), RangeError);
});

test('prima vendita a 1,00 €, poi il valore sale con il sovrapprezzo, prezzi da regola', () => {
  const reg = nuovoRegistro();
  const a = portafoglioDaFrase(generaFrase());
  assert.equal(valore(reg.stato), null, 'senza manti non c\'è valore');
  assert.equal(prezzoAcquisto(reg.stato), PREZZO_DI_LANCIO);
  assert.equal(prezzoConversione(reg.stato), null);
  assert.equal(reg.stato.riserva_cent, 0n);

  reg.accoda(vendita(reg, a.coordinate, 100000)); // 1.000 €
  assert.equal(reg.stato.riserva_cent, 100000n);
  assert.equal(reg.stato.circolazione_cent, 100000n, '1.000 manti');
  assert.equal(valore(reg.stato), 10000n, '1,0000 €');
  assert.equal(prezzoAcquisto(reg.stato), 10500n, '+5%, per eccesso');
  assert.equal(prezzoConversione(reg.stato), 9800n, '−2%, per difetto');
  assert.equal(saldo(mieEntrate(reg, a)), 100000);
  assert.equal(mieEntrate(reg, a)[0].tag, 'vendita');

  reg.accoda(vendita(reg, a.coordinate, 100000));
  assert.equal(reg.stato.circolazione_cent, 100000n + 95238n, '1.000 € a 1,05 = 952,38 manti, per difetto');
  assert.equal(reg.stato.riserva_cent, 200000n);
  assert.equal(valore(reg.stato), 10243n, 'chi c\'era prima ci guadagna');
  assert.equal(reg.stato.venduti_cent, 195238n);
  assert.equal(reg.stato.incassati_cent, 200000n);
  assert.equal(euroPerManti(100000n, prezzoConversione(reg.stato)), 100380n, '1.000 manti convertiti oggi renderebbero 1.003,80 €');
});

test('vendita rifiutata: prezzo diverso, manti sbagliati, senza tag, bruciatura, euro zero, chiave sbagliata', () => {
  const reg = nuovoRegistro();
  const a = portafoglioDaFrase(generaFrase());
  reg.accoda(vendita(reg, a.coordinate, 50000));
  const buona = () => vendita(reg, a.coordinate, 10000);
  assert.throws(() => reg.accoda(vendita(reg, a.coordinate, 10000, { prezzo: 10000 })), /prezzo 10000, atteso 10500/);
  assert.throws(() => reg.accoda(vendita(reg, a.coordinate, 10000, { euro_cent: 10001 })), /uscite per 9523, dovuti 9524/);
  assert.throws(() => reg.accoda(vendita(reg, a.coordinate, 10000, { out: [{ ...buona().body.out[0], tag: 'stipendio' }] })), /senza tag "vendita"/);
  assert.throws(() => reg.accoda(vendita(reg, a.coordinate, 10000, { out: [{ addr: null, amount: 9523, reason: 'x' }] })), /bruciatura/);
  assert.throws(() => reg.accoda(vendita(reg, a.coordinate, 10000, { euro_cent: 0 })), /positivo/);
  assert.throws(() => reg.accoda(vendita(reg, a.coordinate, 10000, { euro_cent: 1, out: [{ ...buona().body.out[0], amount: 0 }] })), /importo non valido|insufficienti/);
  assert.throws(() => reg.accoda(vendita(reg, a.coordinate, 10000, { pagamento: '' })), /pagamento/);
  assert.throws(() => reg.accoda(vendita(reg, a.coordinate, 10000, { extra: 1 })), /campi sconosciuti/);
  const altro = coppiaDaSeme(new Uint8Array(32).fill(9));
  const r = buona();
  assert.throws(() => reg.accoda(firmaRiga({ ...r, sigs: undefined }, [{ by: altro.pubblica, firma: (h) => firma(altro.privata, h) }])), /manca la firma/);
  reg.accoda(buona());
  assert.equal(reg.stato.riserva_cent, 60000n);
});

test('il tetto ferma le vendite, cap.set lo alza, spazio sotto il tetto', () => {
  const reg = nuovoRegistro({ ...PARAMETRI, tetto_cent: 150000 });
  const a = portafoglioDaFrase(generaFrase());
  assert.equal(spazioSottoTetto(reg.stato), 150000n);
  reg.accoda(vendita(reg, a.coordinate, 100000));
  assert.equal(spazioSottoTetto(reg.stato), 50000n);
  // sotto il tetto si vende anche oltre: è la riserva *prima* che conta
  reg.accoda(vendita(reg, a.coordinate, 100000));
  assert.equal(reg.stato.riserva_cent, 200000n);
  assert.equal(spazioSottoTetto(reg.stato), 0n);
  assert.throws(() => reg.accoda(vendita(reg, a.coordinate, 100)), /riserva al tetto/);
  assert.throws(() => reg.accoda(rigaBanca(reg, 'cap.set', { tetto_cent: -1 })), /intero non negativo/);
  assert.throws(() => reg.accoda(rigaBanca(reg, 'cap.set', { tetto_cent: 1.5 })), /interi/);
  reg.accoda(rigaBanca(reg, 'cap.set', { tetto_cent: 300000 }));
  assert.equal(reg.stato.tetto_cent, 300000n);
  reg.accoda(vendita(reg, a.coordinate, 100));
});

test('gli interessi alzano il valore senza muovere manti; periodo controllato', () => {
  const reg = nuovoRegistro();
  const a = portafoglioDaFrase(generaFrase());
  reg.accoda(vendita(reg, a.coordinate, 100000));
  const prima = valore(reg.stato);
  reg.accoda(rigaBanca(reg, 'reserve.interest', { euro_cent: 250, da: '2026-11-01', a: '2026-11-30' }));
  assert.equal(reg.stato.riserva_cent, 100250n);
  assert.equal(reg.stato.circolazione_cent, 100000n);
  assert.equal(valore(reg.stato), 10025n);
  assert.ok(valore(reg.stato) > prima);
  assert.equal(reg.stato.interessi_cent, 250n);
  assert.throws(() => reg.accoda(rigaBanca(reg, 'reserve.interest', { euro_cent: 0, da: '2026-11-01', a: '2026-11-30' })), /positivo/);
  assert.throws(() => reg.accoda(rigaBanca(reg, 'reserve.interest', { euro_cent: 1, da: '2026-11-30', a: '2026-11-01' })), /periodo/);
  assert.throws(() => reg.accoda(rigaBanca(reg, 'reserve.interest', { euro_cent: 1, da: 'ieri', a: 'oggi' })), /periodo/);
});

test('l\'estratto conto è un\'affermazione: coincide, o spiega; uno per mese', () => {
  const reg = nuovoRegistro();
  const a = portafoglioDaFrase(generaFrase());
  reg.accoda(vendita(reg, a.coordinate, 100000));
  const doc = 'd'.repeat(64);
  assert.throws(() => reg.accoda(rigaBanca(reg, 'reserve.statement', { mese: '2026-11', saldo_cent: 99000, documento: doc })), /serve una nota/);
  assert.throws(() => reg.accoda(rigaBanca(reg, 'reserve.statement', { mese: '2026-11', saldo_cent: 100000, documento: doc, nota: 'x' })), /nota solo se/);
  assert.throws(() => reg.accoda(rigaBanca(reg, 'reserve.statement', { mese: '2026-13', saldo_cent: 100000, documento: doc })), /mese/);
  assert.throws(() => reg.accoda(rigaBanca(reg, 'reserve.statement', { mese: '2026-11', saldo_cent: 100000, documento: 'zz' })), /documento/);
  reg.accoda(rigaBanca(reg, 'reserve.statement', { mese: '2026-11', saldo_cent: 100000, documento: doc }));
  assert.throws(() => reg.accoda(rigaBanca(reg, 'reserve.statement', { mese: '2026-11', saldo_cent: 100000, documento: doc })), /già registrato/);
  reg.accoda(rigaBanca(reg, 'reserve.statement', { mese: '2026-12', saldo_cent: 100120, documento: doc, nota: 'interessi accreditati dalla banca il 31, riga in arrivo' }));
  assert.deepEqual(reg.stato.estratti['2026-12'], { saldo_cent: 100120n, riserva_cent: 100000n, documento: doc, nota: 'interessi accreditati dalla banca il 31, riga in arrivo' });
});

test('invariante: riserva ≥ circolazione × valore e valore mai in calo, riga per riga, su 200 righe a caso', () => {
  const reg = nuovoRegistro({ ...PARAMETRI, tetto_cent: 100000000 });
  const gente = Array.from({ length: 4 }, () => portafoglioDaFrase(generaFrase()));
  let seme = 12345;
  const caso = (n) => { seme = (seme * 1103515245 + 12345) % 2147483648; return seme % n; };
  let valorePrima = null;
  for (let i = 0; i < 200; i++) {
    const dado = caso(10);
    if (dado < 6) {
      reg.accoda(vendita(reg, gente[caso(4)].coordinate, 1 + caso(500000)));
    } else if (dado < 9) {
      reg.accoda(rigaBanca(reg, 'reserve.interest', { euro_cent: 1 + caso(5000), da: '2026-12-01', a: '2026-12-31' }));
    } else {
      // una bruciatura in chiaro (come una multa): meno manti, stessi euro
      const chi = gente.find((g) => mieEntrate(reg, g).length);
      if (!chi) continue;
      const e = mieEntrate(reg, chi)[0];
      const meta = Math.max(1, Math.floor(e.amount / 2));
      const { body, firmatari } = costruisciPagamento({ portafoglio: chi, disponibili: [e], destinazioni: e.amount - meta > 0 ? [{ coordinate: chi.coordinate, amount: e.amount - meta }] : [], bruciature: [{ amount: meta, reason: 'prova' }] });
      reg.accoda(firmaRiga(preparaRiga(reg.ultima, { type: 'spesa', ts: ts(), body }), firmatari));
    }
    const v = valore(reg.stato);
    if (v === null) continue; // interessi prima della prima vendita: nessun manto, nessun valore
    assert.ok(reg.stato.riserva_cent * SCALA_PREZZO >= reg.stato.circolazione_cent * v, `riga ${i}: riserva non copre`);
    if (valorePrima !== null) assert.ok(v >= valorePrima, `riga ${i}: valore da ${valorePrima} a ${v}`);
    valorePrima = v;
  }
  assert.ok(valore(reg.stato) > PREZZO_DI_LANCIO);
  // e la copertura si controlla anche a mano su uno stato manomesso
  const rotto = structuredClone(reg.stato);
  rotto.riserva_cent = 1n;
  assert.throws(() => controllaCopertura(rotto, valore(reg.stato)), /non copre/);
  assert.throws(() => controllaCopertura(reg.stato, valore(reg.stato) + 1n), /non copre/);
  controllaCopertura(reg.stato, valore(reg.stato));
  controllaCopertura(rotto, null);
});

test('il giorno: date crescenti, la riga non prima del giorno che apre, contatore dei giorni', () => {
  const reg = nuovoRegistro();
  const giorno = (data, ts, firmatario = firmaBanca) => firmaRiga(preparaRiga(reg.ultima, { type: 'day', ts, body: { data } }), [firmatario]);
  assert.equal(reg.stato.giorno, undefined);
  reg.accoda(giorno('2026-12-01', '2026-12-01T05:00:00Z'));
  assert.equal(reg.stato.giorno, '2026-12-01');
  assert.equal(reg.stato.n_giorni, 1);
  assert.throws(() => reg.accoda(giorno('2026-12-01', '2026-12-01T06:00:00Z')), /non è dopo/);
  assert.throws(() => reg.accoda(giorno('2026-11-30', '2026-12-01T06:00:00Z')), /non è dopo/);
  assert.throws(() => reg.accoda(giorno('2026-13-01', '2026-12-01T06:00:00Z')), /data non valida/);
  assert.throws(() => reg.accoda(giorno('2026-12-03', '2026-12-02T06:00:00Z')), /datata 2026-12-02, prima/);
  reg.accoda(giorno('2026-12-02', '2026-12-02T06:00:00Z'));
  assert.equal(reg.stato.n_giorni, 2);
  const altro = coppiaDaSeme(new Uint8Array(32).fill(5));
  assert.throws(() => reg.accoda(giorno('2026-12-03', '2026-12-03T06:00:00Z', { by: altro.pubblica, firma: (h) => firma(altro.privata, h) })), /manca la firma/);
});

test('correction: solo un interesse, una volta, se la copertura regge; con motivazione', () => {
  const reg = nuovoRegistro();
  const a = portafoglioDaFrase(generaFrase());
  const v = vendita(reg, a.coordinate, 100000);
  reg.accoda(v);
  const i = rigaBanca(reg, 'reserve.interest', { euro_cent: 2500, da: '2026-11-01', a: '2026-11-30' });
  reg.accoda(i);
  assert.equal(reg.stato.riserva_cent, 102500n);
  const correggi = (ref, mod = {}) => rigaBanca(reg, 'correction', { ref, motivazione: 'cifra sbagliata: erano 250', ...mod });
  assert.throws(() => reg.accoda(correggi(v.hash)), /solo reserve.interest/);
  assert.throws(() => reg.accoda(correggi('f'.repeat(64))), /solo reserve.interest/);
  assert.throws(() => reg.accoda(correggi(i.hash, { motivazione: ' ' })), /motivazione/);
  assert.throws(() => reg.accoda(correggi(i.hash, { euro_cent: 2501 })), /al massimo l'interesse riferito, 2500/);
  assert.throws(() => reg.accoda(correggi(i.hash, { euro_cent: 0 })), /al massimo/);
  reg.accoda(correggi(i.hash));
  assert.equal(reg.stato.riserva_cent, 100000n);
  assert.equal(reg.stato.interessi_cent, 0n);
  assert.throws(() => reg.accoda(correggi(i.hash)), /già corretta/);
  // è l'unica riga in cui il valore scende, e lo dice
  assert.deepEqual(reg.stato.correzioni[i.hash], { correzione: reg.ultima.hash, euro_cent: 2500n, motivazione: 'cifra sbagliata: erano 250', valore_prima: 10250n, valore_dopo: 10000n });
  // parziale: una cifra in più
  const i3 = rigaBanca(reg, 'reserve.interest', { euro_cent: 2500, da: '2027-01-01', a: '2027-01-31' });
  reg.accoda(i3);
  reg.accoda(correggi(i3.hash, { euro_cent: 2250, motivazione: 'erano 250, non 2500' }));
  assert.equal(reg.stato.riserva_cent, 100250n);
});

test('il registro si ricostruisce con lo stesso stato, BigInt compresi', () => {
  const reg = nuovoRegistro();
  const a = portafoglioDaFrase(generaFrase());
  reg.accoda(vendita(reg, a.coordinate, 100000));
  reg.accoda(rigaBanca(reg, 'reserve.interest', { euro_cent: 250, da: '2026-11-01', a: '2026-11-30' }));
  reg.accoda(vendita(reg, a.coordinate, 12345));
  const copia = Registro.daRighe(JSON.parse(JSON.stringify(reg.righe)), { tipi });
  assert.deepEqual(copia.stato, reg.stato);
  assert.equal(typeof copia.stato.riserva_cent, 'bigint');
});
