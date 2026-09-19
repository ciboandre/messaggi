import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Registro, preparaRiga, firmaRiga } from '../nucleo/registro.js';
import { controllaUscite, creaUscite, regolaSpesaInChiaro } from '../nucleo/uscite.js';
import { regolaTransfer, ANELLO } from '../nucleo/trasferimento.js';
import { coppiaDaSeme, firma, firmaScalare } from '../nucleo/chiavi.js';
import { portafoglioDaFrase, creaIndirizzo } from '../nucleo/portafoglio.js';
import { generaFrase } from '../nucleo/frase.js';
import { mieEntrate, saldo, costruisciPagamento, costruisciPagamentoRiservato, scegliEsche } from '../nucleo/pagamento.js';
import { impegno, mascheraCasuale } from '../nucleo/impegni.js';

const banca = coppiaDaSeme(new Uint8Array(32).fill(1));
const PARAMETRI = { sovrapprezzo_pct: 5, commissione_pct: 2, multe_bruciate_pct: 50, tetto_cent: 400000, giorni_multa: 15 };

const tipiTest = {
  transfer: regolaTransfer,
  spesa: regolaSpesaInChiaro,
  /** crea manti dal nulla, firmato dalla banca: solo per i test */
  dono: (riga, stato) => {
    const out = controllaUscite(/** @type {any} */ (riga.body).out, { tagAmmessi: true });
    creaUscite(stato, riga.hash, out, { nuovi: true });
    return [/** @type {any} */ (stato).genesi.banca.chiave];
  },
};

let orologio = 0;
const ts = () => `2026-11-${String(1 + Math.floor(orologio / 86400)).padStart(2, '0')}T${String(Math.floor((orologio++ % 86400) / 3600)).padStart(2, '0')}:00:00Z`;
const firmaBanca = { by: banca.pubblica, firma: (h) => firma(banca.privata, h) };

function nuovoRegistro() {
  const reg = new Registro({ tipi: tipiTest });
  const coord = portafoglioDaFrase(generaFrase()).coordinate;
  const g = preparaRiga(null, { type: 'genesis', ts: '2026-10-31T00:00:00Z', body: { banca: { chiave: banca.pubblica, coordinate: coord }, parametri: PARAMETRI } });
  reg.accoda(firmaRiga(g, [firmaBanca]));
  return reg;
}

function dona(reg, coordinate, importi, tag) {
  const out = importi.map((amount) => {
    const i = creaIndirizzo(coordinate);
    return { addr: i.addr, eph: i.eph, amount, ...(tag ? { tag } : {}) };
  });
  reg.accoda(firmaRiga(preparaRiga(reg.ultima, { type: 'dono', ts: ts(), body: { out } }), [firmaBanca]));
}

function pagaRiservato(reg, portafoglio, destinazioni, extra = {}) {
  const disponibili = mieEntrate(reg, portafoglio);
  const { body, firmatari } = costruisciPagamentoRiservato({ portafoglio, disponibili, destinazioni, stato: reg.stato, ...extra });
  const riga = firmaRiga(preparaRiga(reg.ultima, { type: 'transfer', ts: ts(), body }), firmatari);
  reg.accoda(riga);
  return riga;
}

test('un pagamento riservato: chi riceve vede importo e causale, chi paga il resto, il registro nessun numero', () => {
  const reg = nuovoRegistro();
  const a = portafoglioDaFrase(generaFrase());
  const b = portafoglioDaFrase(generaFrase());
  dona(reg, a.coordinate, [5000, 3000], 'vendita');
  const riga = pagaRiservato(reg, a, [{ coordinate: b.coordinate, amount: 1200, causale: 'caffè per tutti' }]);

  assert.equal(riga.body.in.length, 1, 'basta l\'entrata da 5000');
  assert.equal(riga.body.in[0].ring.length, 2, 'anello di tutte le uscite disponibili: due');
  assert.equal(riga.body.out.length, 2, 'uscita per b e resto per a');
  for (const u of riga.body.out) {
    assert.equal(u.amount, undefined, 'nessun importo in chiaro');
    assert.match(u.commit, /^[0-9a-f]{64}$/);
    assert.match(u.amt, /^[0-9a-f]{16}$/);
  }
  assert.equal(riga.sigs.length, 1);
  assert.ok('img' in riga.sigs[0] && !('by' in riga.sigs[0]));

  const diB = mieEntrate(reg, b);
  assert.equal(saldo(diB), 1200);
  assert.equal(diB[0].causale, 'caffè per tutti');
  assert.equal(diB[0].chiaro, false);
  const diA = mieEntrate(reg, a);
  assert.equal(saldo(diA), 8000 - 1200);
  assert.equal(diA.filter((e) => e.chiaro).length, 1, 'il 3000 in chiaro non è stato toccato');
  assert.equal(reg.stato.circolazione_cent, 8000n, 'la circolazione non cambia');
  assert.equal(reg.stato.disponibili, 4, 'le quattro uscite restano tutte esche possibili');
  assert.equal(Object.keys(reg.stato.immagini).length, 1);
});

test('doppia spesa: la stessa entrata in un secondo anello ha la stessa immagine, e il registro la rifiuta', () => {
  const reg = nuovoRegistro();
  const a = portafoglioDaFrase(generaFrase());
  const b = portafoglioDaFrase(generaFrase());
  dona(reg, a.coordinate, [5000]);
  const disponibili = mieEntrate(reg, a);
  const primo = costruisciPagamentoRiservato({ portafoglio: a, disponibili, destinazioni: [{ coordinate: b.coordinate, amount: 100 }], stato: reg.stato });
  reg.accoda(firmaRiga(preparaRiga(reg.ultima, { type: 'transfer', ts: ts(), body: primo.body }), primo.firmatari));
  assert.equal(mieEntrate(reg, a).length, 1, 'ad a resta solo il resto');
  // stessa lista di prima, come un'app con la copia vecchia del registro
  const secondo = costruisciPagamentoRiservato({ portafoglio: a, disponibili, destinazioni: [{ coordinate: b.coordinate, amount: 100 }], stato: reg.stato });
  assert.equal(secondo.body.in[0].img, primo.body.in[0].img);
  const r2 = firmaRiga(preparaRiga(reg.ultima, { type: 'transfer', ts: ts(), body: secondo.body }), secondo.firmatari);
  assert.throws(() => reg.accoda(r2), /immagine di chiave già spesa/);
  assert.equal(reg.righe.length, 3, 'niente è entrato');
});

test('catena riservata: b paga c con un\'entrata riservata, tra esche in chiaro e riservate', () => {
  const reg = nuovoRegistro();
  const [a, b, c] = [1, 2, 3].map(() => portafoglioDaFrase(generaFrase()));
  dona(reg, a.coordinate, [5000, 200, 300]);
  pagaRiservato(reg, a, [{ coordinate: b.coordinate, amount: 2000 }]);
  const riga = pagaRiservato(reg, b, [{ coordinate: c.coordinate, amount: 1500, causale: 'grazie' }]);
  assert.equal(riga.body.in[0].ring.length, 5, 'tre in chiaro + due riservate');
  assert.equal(saldo(mieEntrate(reg, c)), 1500);
  assert.equal(saldo(mieEntrate(reg, b)), 500);
  assert.equal(saldo(mieEntrate(reg, a)), 3500);
  assert.equal(reg.stato.circolazione_cent, 5500n);
  // due entrate consumate insieme: b ha resto 500, riceve 100, paga 550
  pagaRiservato(reg, a, [{ coordinate: b.coordinate, amount: 100 }]);
  const doppia = pagaRiservato(reg, b, [{ coordinate: c.coordinate, amount: 550 }]);
  assert.equal(doppia.body.in.length, 2);
  assert.equal(doppia.sigs.length, 2);
  assert.notEqual(doppia.body.in[0].img, doppia.body.in[1].img);
  assert.equal(saldo(mieEntrate(reg, b)), 50);
  assert.equal(saldo(mieEntrate(reg, c)), 2050);
});

test('con più di 16 uscite l\'anello è di 16, contiene la vera, ed è in ordine di creazione', () => {
  const reg = nuovoRegistro();
  const a = portafoglioDaFrase(generaFrase());
  const b = portafoglioDaFrase(generaFrase());
  dona(reg, a.coordinate, Array(20).fill(100));
  const mia = mieEntrate(reg, a)[7];
  const { ring, indice } = scegliEsche(reg.stato, mia.ref);
  assert.equal(ring.length, ANELLO);
  assert.equal(ring[indice], mia.ref);
  assert.equal(new Set(ring).size, ANELLO);
  const ordini = ring.map((r) => reg.stato.uscite[r].ordine);
  assert.deepEqual(ordini, [...ordini].sort((x, y) => x - y));
  const riga = pagaRiservato(reg, a, [{ coordinate: b.coordinate, amount: 100 }]);
  assert.equal(riga.body.in[0].ring.length, ANELLO);
});

test('anelli sbagliati: dimensione, ordine, ripetizioni, esche spese in chiaro o inesistenti', () => {
  const reg = nuovoRegistro();
  const a = portafoglioDaFrase(generaFrase());
  const b = portafoglioDaFrase(generaFrase());
  dona(reg, a.coordinate, [1000, 1000, 1000]);
  // una spesa in chiaro toglie un'esca
  const inChiaro = costruisciPagamento({ portafoglio: a, disponibili: mieEntrate(reg, a).slice(0, 1), destinazioni: [{ coordinate: b.coordinate, amount: 1000 }] });
  reg.accoda(firmaRiga(preparaRiga(reg.ultima, { type: 'spesa', ts: ts(), body: inChiaro.body }), inChiaro.firmatari));
  assert.equal(reg.stato.disponibili, 3, 'due di a più quella di b');
  const spesa = inChiaro.body.in[0];

  const costruisci = (mod) => {
    const disponibili = mieEntrate(reg, a);
    const { body, firmatari } = costruisciPagamentoRiservato({ portafoglio: a, disponibili, destinazioni: [{ coordinate: b.coordinate, amount: 500 }], stato: reg.stato });
    mod(body);
    return firmaRiga(preparaRiga(reg.ultima, { type: 'transfer', ts: ts(), body }), firmatari);
  };
  assert.throws(() => reg.accoda(costruisci((bd) => bd.in[0].ring.shift())), /anello di 2, atteso 3/);
  assert.throws(() => reg.accoda(costruisci((bd) => bd.in[0].ring.push(...bd.in[0].ring))), /ordine di creazione/);
  assert.throws(() => reg.accoda(costruisci((bd) => bd.in[0].ring.reverse())), /ordine di creazione/);
  assert.throws(() => reg.accoda(costruisci((bd) => { bd.in[0].ring[2] = bd.in[0].ring[1]; })), /ordine di creazione, o con ripetizioni/);
  assert.throws(() => reg.accoda(costruisci((bd) => { bd.in[0].ring[0] = spesa; })), /spesa in chiaro/);
  assert.throws(() => reg.accoda(costruisci((bd) => { bd.in[0].ring[0] = 'f'.repeat(64) + ':0'; })), /inesistente/);
  assert.throws(() => reg.accoda(costruisci((bd) => { bd.ref = 'x'; })), /ref deve essere null/);
  assert.throws(() => reg.accoda(costruisci((bd) => { bd.extra = 1; })), /campi sconosciuti/);
  // e una buona passa ancora
  reg.accoda(costruisci(() => {}));
});

test('una riga costruita prima che nascano altre uscite resta valida: l\'anello si misura fino alla sua esca più recente', () => {
  const reg = nuovoRegistro();
  const a = portafoglioDaFrase(generaFrase());
  const b = portafoglioDaFrase(generaFrase());
  dona(reg, a.coordinate, [1000, 1000]);
  const { body, firmatari } = costruisciPagamentoRiservato({ portafoglio: a, disponibili: mieEntrate(reg, a), destinazioni: [{ coordinate: b.coordinate, amount: 300 }], stato: reg.stato });
  assert.equal(body.in[0].ring.length, 2);
  dona(reg, b.coordinate, [500, 500, 500]);
  assert.equal(reg.stato.disponibili, 5);
  // stesso body, nuova posizione nella catena: il server la ripropone, l'app rifirma
  reg.accoda(firmaRiga(preparaRiga(reg.ultima, { type: 'transfer', ts: ts(), body }), firmatari));
  assert.equal(saldo(mieEntrate(reg, b)), 1800);
  // ma un anello che salta un'uscita nata prima della sua esca più recente no
  const { body: b2, firmatari: f2 } = costruisciPagamentoRiservato({ portafoglio: b, disponibili: mieEntrate(reg, b).filter((e) => e.chiaro), destinazioni: [{ coordinate: a.coordinate, amount: 100 }], stato: reg.stato });
  assert.equal(b2.in[0].ring.length, 7, 'due di a, tre di b, due riservate');
  b2.in[0].ring.splice(1, 1);
  assert.throws(() => reg.accoda(firmaRiga(preparaRiga(reg.ultima, { type: 'transfer', ts: ts(), body: b2 }), f2)), /anello di 6, atteso 7/);
});

test('manomissioni: impegno, prova, pseudo-impegno, firma ad anello, firme in più o in meno', () => {
  const reg = nuovoRegistro();
  const a = portafoglioDaFrase(generaFrase());
  const b = portafoglioDaFrase(generaFrase());
  dona(reg, a.coordinate, [1000, 1000]);
  const disponibili = mieEntrate(reg, a);
  const costruisci = () => costruisciPagamentoRiservato({ portafoglio: a, disponibili, destinazioni: [{ coordinate: b.coordinate, amount: 400 }], stato: reg.stato });
  const riga = (body, firmatari) => firmaRiga(preparaRiga(reg.ultima, { type: 'transfer', ts: ts(), body }), firmatari);

  let { body, firmatari } = costruisci();
  body.out[0].commit = impegno(400, mascheraCasuale());
  assert.throws(() => reg.accoda(riga(body, firmatari)), /bilancio/);

  ({ body, firmatari } = costruisci());
  body.proof = costruisci().body.proof;
  assert.throws(() => reg.accoda(riga(body, firmatari)), /prova di intervallo/);

  ({ body, firmatari } = costruisci());
  const altra = costruisci();
  body.in[0].pseudo = altra.body.in[0].pseudo;
  assert.throws(() => reg.accoda(riga(body, firmatari)), /bilancio/);

  ({ body, firmatari } = costruisci());
  let r = riga(body, firmatari);
  r = { ...r, sigs: [{ img: r.sigs[0].img, sig: riga(altra.body, altra.firmatari).sigs[0].sig }] };
  assert.throws(() => reg.accoda(r), /firma ad anello non valida/);

  ({ body, firmatari } = costruisci());
  r = riga(body, firmatari);
  assert.throws(() => reg.accoda({ ...r, sigs: [] }), /nessuna firma/);
  assert.throws(() => reg.accoda({ ...r, sigs: [{ by: banca.pubblica, sig: firma(banca.privata, r.hash) }] }), /manca la firma ad anello/);
  assert.throws(() => reg.accoda({ ...r, sigs: [...r.sigs, { by: banca.pubblica, sig: firma(banca.privata, r.hash) }] }), /firma non richiesta/);
  assert.throws(() => reg.accoda({ ...r, sigs: [...r.sigs, ...r.sigs] }), /duplicata/);
  const e = disponibili[1];
  assert.throws(() => reg.accoda({ ...r, sigs: [...r.sigs, { img: e.img, sig: r.sigs[0].sig }] }), /firma ad anello non richiesta/);
  assert.throws(() => reg.accoda({ ...r, sigs: [{ img: r.sigs[0].img, by: e.addr, sig: r.sigs[0].sig }] }), /firma ad anello malformata/);

  // l'importo cifrato manomesso non invalida la riga: il destinatario non lo apre e basta
  ({ body, firmatari } = costruisci());
  body.out[0].amt = 'ab'.repeat(8);
  reg.accoda(riga(body, firmatari));
  assert.equal(saldo(mieEntrate(reg, b)), 0, 'b non riesce ad aprire l\'uscita');
  assert.equal(mieEntrate(reg, a).length, 2, 'ad a resta l\'altra da 1000 e il resto');
});

test('chi non ha la chiave non firma: un altro portafoglio non trova entrate, e con p sbagliata l\'anello lancia', () => {
  const reg = nuovoRegistro();
  const a = portafoglioDaFrase(generaFrase());
  const ladro = portafoglioDaFrase(generaFrase());
  dona(reg, a.coordinate, [1000]);
  assert.equal(mieEntrate(reg, ladro).length, 0);
  const mia = mieEntrate(reg, a)[0];
  const rubata = { ...mia, p: ladro.s };
  assert.throws(() => {
    const { body, firmatari } = costruisciPagamentoRiservato({ portafoglio: ladro, disponibili: [rubata], destinazioni: [{ coordinate: ladro.coordinate, amount: 1000 }], stato: reg.stato });
    firmaRiga(preparaRiga(reg.ultima, { type: 'transfer', ts: ts(), body }), firmatari);
  }, /non apre/);
});

test('il registro si ricostruisce da capo con lo stesso stato', () => {
  const reg = nuovoRegistro();
  const [a, b, c] = [1, 2, 3].map(() => portafoglioDaFrase(generaFrase()));
  dona(reg, a.coordinate, [3000, 1000]);
  pagaRiservato(reg, a, [{ coordinate: b.coordinate, amount: 1500 }]);
  pagaRiservato(reg, b, [{ coordinate: c.coordinate, amount: 700 }, { coordinate: a.coordinate, amount: 100 }]);
  const copia = Registro.daRighe(JSON.parse(JSON.stringify(reg.righe)), { tipi: tipiTest });
  assert.deepEqual(copia.stato, reg.stato);
  assert.equal(saldo(mieEntrate(copia, c)), 700);
  assert.equal(saldo(mieEntrate(copia, a)), 4000 - 1500 + 100);
  assert.equal(copia.stato.circolazione_cent, 4000n);
});
