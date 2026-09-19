import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Registro, preparaRiga, firmaRiga } from '../nucleo/registro.js';
import { regolaTransfer, controllaUscite, creaUscite } from '../nucleo/uscite.js';
import { coppiaDaSeme, firma, firmaScalare } from '../nucleo/chiavi.js';
import { portafoglioDaFrase, creaIndirizzo, riconosci } from '../nucleo/portafoglio.js';
import { generaFrase } from '../nucleo/frase.js';
import { mieEntrate, saldo, costruisciPagamento, scegliEntrate } from '../nucleo/pagamento.js';
import { cifraCausale, decifraCausale, formaCausaleValida } from '../nucleo/causale.js';
import { chiaveCausale } from '../nucleo/portafoglio.js';

const banca = coppiaDaSeme(new Uint8Array(32).fill(1));
const PARAMETRI = { sovrapprezzo_pct: 5, commissione_pct: 2, multe_bruciate_pct: 50, tetto_cent: 400000, giorni_multa: 15 };

/** Tipo di prova che crea manti dal nulla verso delle uscite, firmato dalla banca. Solo per i test. */
const tipiTest = {
  transfer: regolaTransfer,
  dono: (riga, stato) => {
    const out = controllaUscite(/** @type {any} */ (riga.body).out, { tagAmmessi: true });
    creaUscite(stato, riga.hash, out, { nuovi: true });
    return [/** @type {any} */ (stato).genesi.banca.chiave];
  },
};

let orologio = 0;
const ts = () => `2026-10-${String(2 + Math.floor(orologio / 86400)).padStart(2, '0')}T${String(Math.floor((orologio++ % 86400) / 3600)).padStart(2, '0')}:00:00Z`;

function nuovoRegistro() {
  const reg = new Registro({ tipi: tipiTest });
  const coord = portafoglioDaFrase(generaFrase()).coordinate;
  const g = preparaRiga(null, { type: 'genesis', ts: '2026-10-01T00:00:00Z', body: { banca: { chiave: banca.pubblica, coordinate: coord }, parametri: PARAMETRI } });
  reg.accoda(firmaRiga(g, [{ by: banca.pubblica, firma: (h) => firma(banca.privata, h) }]));
  return reg;
}

function dona(reg, coordinate, importi, tag) {
  const out = importi.map((amount) => {
    const i = creaIndirizzo(coordinate);
    return { addr: i.addr, eph: i.eph, amount, ...(tag ? { tag } : {}) };
  });
  const r = preparaRiga(reg.ultima, { type: 'dono', ts: ts(), body: { out } });
  reg.accoda(firmaRiga(r, [{ by: banca.pubblica, firma: (h) => firma(banca.privata, h) }]));
}

function paga(reg, portafoglio, destinazioni, extra = {}) {
  const disponibili = mieEntrate(reg, portafoglio);
  const { body, firmatari } = costruisciPagamento({ portafoglio, disponibili, destinazioni, ...extra });
  const r = preparaRiga(reg.ultima, { type: 'transfer', ts: ts(), body });
  const riga = firmaRiga(r, firmatari);
  reg.accoda(riga);
  return riga;
}

test('il destinatario trova le proprie entrate e il saldo è la somma', () => {
  const reg = nuovoRegistro();
  const a = portafoglioDaFrase(generaFrase());
  dona(reg, a.coordinate, [2500, 1500], 'stipendio');
  const mie = mieEntrate(reg, a);
  assert.equal(mie.length, 2);
  assert.equal(saldo(mie), 4000);
  assert.equal(mie[0].tag, 'stipendio');
  assert.equal(reg.stato.circolazione_cent, 4000);
  assert.equal(reg.stato.emessi_cent, 4000);
  const altro = portafoglioDaFrase(generaFrase());
  assert.equal(mieEntrate(reg, altro).length, 0);
});

test('un pagamento: chi riceve lo vede con la causale, chi paga ritrova il resto', () => {
  const reg = nuovoRegistro();
  const a = portafoglioDaFrase(generaFrase());
  const b = portafoglioDaFrase(generaFrase());
  dona(reg, a.coordinate, [7130]);
  const riga = paga(reg, a, [{ coordinate: b.coordinate, amount: 1000, causale: 'turno di sabato' }]);
  assert.equal(riga.body.in.length, 1);
  assert.equal(riga.body.out.length, 2, 'uscita per b e resto per a');

  const diB = mieEntrate(reg, b);
  assert.equal(saldo(diB), 1000);
  assert.equal(diB[0].causale, 'turno di sabato');
  const diA = mieEntrate(reg, a);
  assert.equal(saldo(diA), 6130);
  assert.equal(diA[0].causale, null);
  assert.equal(reg.stato.circolazione_cent, 7130, 'un transfer non cambia la circolazione');
});

test('la stessa entrata non si spende due volte', () => {
  const reg = nuovoRegistro();
  const a = portafoglioDaFrase(generaFrase());
  const b = portafoglioDaFrase(generaFrase());
  dona(reg, a.coordinate, [500]);
  const disponibili = mieEntrate(reg, a);
  const primo = costruisciPagamento({ portafoglio: a, disponibili, destinazioni: [{ coordinate: b.coordinate, amount: 500 }] });
  const secondo = costruisciPagamento({ portafoglio: a, disponibili, destinazioni: [{ coordinate: b.coordinate, amount: 500 }] });
  reg.accoda(firmaRiga(preparaRiga(reg.ultima, { type: 'transfer', ts: ts(), body: primo.body }), primo.firmatari));
  const r2 = firmaRiga(preparaRiga(reg.ultima, { type: 'transfer', ts: ts(), body: secondo.body }), secondo.firmatari);
  assert.throws(() => reg.accoda(r2), /già spesa/);
});

test('entrate e uscite devono tornare al centesimo', () => {
  const reg = nuovoRegistro();
  const a = portafoglioDaFrase(generaFrase());
  const b = portafoglioDaFrase(generaFrase());
  dona(reg, a.coordinate, [1000]);
  const e = mieEntrate(reg, a)[0];
  const dest = creaIndirizzo(b.coordinate);
  const body = { in: [e.ref], out: [{ addr: dest.addr, eph: dest.eph, amount: 999 }], ref: null };
  const r = firmaRiga(preparaRiga(reg.ultima, { type: 'transfer', ts: ts(), body }), [{ by: e.addr, firma: (h) => firmaScalare(e.p, h) }]);
  assert.throws(() => reg.accoda(r), /entrate 1000 ≠ uscite 999/);
  assert.equal(reg.stato.circolazione_cent, 1000, 'lo stato non cambia se la riga fallisce');
});

test('firma solo chi possiede le entrate', () => {
  const reg = nuovoRegistro();
  const a = portafoglioDaFrase(generaFrase());
  const ladro = portafoglioDaFrase(generaFrase());
  dona(reg, a.coordinate, [1000]);
  const e = mieEntrate(reg, a)[0];
  const dest = creaIndirizzo(ladro.coordinate);
  const body = { in: [e.ref], out: [{ addr: dest.addr, eph: dest.eph, amount: 1000 }], ref: null };
  const base = preparaRiga(reg.ultima, { type: 'transfer', ts: ts(), body });
  // il ladro firma con una chiave sua: non è quella dell'indirizzo
  const r = firmaRiga(base, [{ by: ladro.S, firma: (h) => firmaScalare(ladro.s, h) }]);
  assert.throws(() => reg.accoda(r), /manca la firma di/);
  // la banca non può muovere manti altrui
  const r2 = firmaRiga(base, [{ by: banca.pubblica, firma: (h) => firma(banca.privata, h) }]);
  assert.throws(() => reg.accoda(r2), /manca la firma di/);
});

test('le bruciature escono dalla circolazione e non hanno destinatario', () => {
  const reg = nuovoRegistro();
  const a = portafoglioDaFrase(generaFrase());
  dona(reg, a.coordinate, [1000]);
  paga(reg, a, [], { bruciature: [{ amount: 300, reason: 'prova' }] });
  assert.equal(reg.stato.circolazione_cent, 700);
  assert.equal(reg.stato.bruciati_cent, 300);
  assert.equal(saldo(mieEntrate(reg, a)), 700);
});

test('più entrate insieme, scelte dalla più grande', () => {
  const reg = nuovoRegistro();
  const a = portafoglioDaFrase(generaFrase());
  const b = portafoglioDaFrase(generaFrase());
  dona(reg, a.coordinate, [200, 500, 300]);
  const scelte = scegliEntrate(mieEntrate(reg, a), 600);
  assert.deepEqual(scelte.map((e) => e.amount), [500, 300]);
  const riga = paga(reg, a, [{ coordinate: b.coordinate, amount: 600 }]);
  assert.equal(riga.body.in.length, 2);
  assert.equal(riga.sigs.length, 2, 'una firma per ogni indirizzo consumato');
  assert.equal(saldo(mieEntrate(reg, a)), 400);
  assert.equal(saldo(mieEntrate(reg, b)), 600);
  assert.throws(() => paga(reg, a, [{ coordinate: b.coordinate, amount: 401 }]), /saldo insufficiente/);
});

test('uscite malformate vengono rifiutate una per una', () => {
  const buona = creaIndirizzo(portafoglioDaFrase(generaFrase()).coordinate);
  const ok = { addr: buona.addr, eph: buona.eph, amount: 1 };
  assert.throws(() => controllaUscite([]), /nessuna uscita/);
  assert.throws(() => controllaUscite([{ ...ok, amount: 0 }]), /importo/);
  assert.throws(() => controllaUscite([{ ...ok, amount: 1.5 }]), /importo/);
  assert.throws(() => controllaUscite([{ ...ok, addr: 'ff'.repeat(32) }]), /indirizzo non valido/);
  assert.throws(() => controllaUscite([{ addr: ok.addr, amount: 1 }]), /eph/);
  assert.throws(() => controllaUscite([{ ...ok, memo: 'x' }]), /causale/);
  assert.throws(() => controllaUscite([{ ...ok, tag: 'stipendio' }]), /tag non ammesso/);
  assert.doesNotThrow(() => controllaUscite([{ ...ok, tag: 'stipendio' }], { tagAmmessi: true }));
  assert.throws(() => controllaUscite([{ ...ok, extra: 1 }]), /campi sconosciuti/);
  assert.throws(() => controllaUscite([{ addr: null, amount: 5 }]), /senza motivo/);
  assert.throws(() => controllaUscite([{ addr: null, amount: 5, reason: 'x', eph: ok.eph }]), /solo amount e reason/);
  assert.doesNotThrow(() => controllaUscite([{ addr: null, amount: 5, reason: 'multa' }]));
});

test('un transfer con campi in più o ref non valido non entra', () => {
  const reg = nuovoRegistro();
  const a = portafoglioDaFrase(generaFrase());
  dona(reg, a.coordinate, [100]);
  const e = mieEntrate(reg, a)[0];
  const mio = creaIndirizzo(a.coordinate);
  const firmatari = [{ by: e.addr, firma: (h) => firmaScalare(e.p, h) }];
  const conExtra = { in: [e.ref], out: [{ addr: mio.addr, eph: mio.eph, amount: 100 }], ref: null, tag: 'x' };
  assert.throws(() => reg.accoda(firmaRiga(preparaRiga(reg.ultima, { type: 'transfer', ts: ts(), body: conExtra }), firmatari)), /campi sconosciuti/);
  const refNum = { in: [e.ref], out: [{ addr: mio.addr, eph: mio.eph, amount: 100 }], ref: 7 };
  assert.throws(() => reg.accoda(firmaRiga(preparaRiga(reg.ultima, { type: 'transfer', ts: ts(), body: refNum }), firmatari)), /ref non valido/);
});

test('le causali: solo il destinatario le legge, una manomissione le annulla', () => {
  const a = portafoglioDaFrase(generaFrase());
  const ind = creaIndirizzo(a.coordinate);
  const chiave = chiaveCausale(ind.k);
  const memo = cifraCausale(chiave, 'grazie per l\'aiuto · caffè ☕');
  assert.equal(formaCausaleValida(memo), true);
  assert.equal(decifraCausale(chiave, memo), 'grazie per l\'aiuto · caffè ☕');
  assert.notEqual(cifraCausale(chiave, 'x'), cifraCausale(chiave, 'x'), 'nonce diverso ogni volta');
  const mio = riconosci(ind, a);
  assert.equal(decifraCausale(chiaveCausale(mio.k), memo), 'grazie per l\'aiuto · caffè ☕');
  assert.equal(decifraCausale(chiaveCausale(creaIndirizzo(a.coordinate).k), memo), null, 'altra uscita, altra chiave');
  const bytes = Buffer.from(memo, 'base64'); bytes[30] ^= 1;
  assert.equal(decifraCausale(chiave, bytes.toString('base64')), null);
  assert.equal(decifraCausale(chiave, 'non base64!!'), null);
  assert.throws(() => cifraCausale(chiave, 'x'.repeat(141)), /oltre 140/);
});

test('ricostruire da capo un registro con pagamenti dà lo stesso stato', () => {
  const reg = nuovoRegistro();
  const a = portafoglioDaFrase(generaFrase());
  const b = portafoglioDaFrase(generaFrase());
  dona(reg, a.coordinate, [1000, 250]);
  paga(reg, a, [{ coordinate: b.coordinate, amount: 700, causale: 'uno' }]);
  paga(reg, b, [{ coordinate: a.coordinate, amount: 100 }], { bruciature: [{ amount: 50, reason: 'prova' }] });
  const copia = Registro.daRighe(structuredClone(reg.righe), { tipi: tipiTest });
  assert.deepEqual(copia.stato, reg.stato);
  assert.equal(copia.stato.circolazione_cent, 1200);
  assert.equal(copia.stato.bruciati_cent, 50);
  assert.equal(copia.stato.emessi_cent, 1250);
  assert.equal(saldo(mieEntrate(copia, a)), 650);
  assert.equal(saldo(mieEntrate(copia, b)), 550);
});
