import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Registro, preparaRiga, firmaRiga } from '../nucleo/registro.js';
import { tipiBanca, prezzoAcquisto, mantiPerEuro, valore, divisioneMulta } from '../nucleo/banca.js';
import { tipiAzienda } from '../nucleo/azienda.js';
import { tipiMulte, definitivoNonSaldato } from '../nucleo/multe.js';
import { regolaTransfer } from '../nucleo/trasferimento.js';
import { coppiaDaSeme, firma, firmaScalare } from '../nucleo/chiavi.js';
import { portafoglioDaFrase, creaIndirizzo, riconosci, chiaveCausale, indirizzoDaR } from '../nucleo/portafoglio.js';
import { cifraCausale, decifraCausale } from '../nucleo/causale.js';
import { generaFrase } from '../nucleo/frase.js';
import { mieEntrate, saldo, costruisciPagamento, costruisciPagamentoRiservato } from '../nucleo/pagamento.js';

const banca = coppiaDaSeme(new Uint8Array(32).fill(1));
const aziendaK = coppiaDaSeme(new Uint8Array(32).fill(2));
const poliziaK = coppiaDaSeme(new Uint8Array(32).fill(3));
const giudiceK = coppiaDaSeme(new Uint8Array(32).fill(4));
const PARAMETRI = { sovrapprezzo_pct: 5, commissione_pct: 2, multe_bruciate_pct: 50, tetto_cent: 100000000, giorni_multa: 15 };
const tipi = { ...tipiBanca, ...tipiAzienda, ...tipiMulte, transfer: regolaTransfer };
const firmaDi = (c) => ({ by: c.pubblica, firma: (h) => firma(c.privata, h) });
let orologio = 0;
const ts = () => { orologio += 60; return new Date(Date.UTC(2027, 2, 1) + orologio * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'); };
const riga = (reg, type, body, firmatari) => firmaRiga(preparaRiga(reg.ultima, { type, ts: ts(), body }), firmatari);
const cifraPer = (coordinate, testo) => { const i = creaIndirizzo(coordinate); return { addr: i.addr, eph: i.eph, memo: cifraCausale(chiaveCausale(i.k), testo) }; };
const leggi = (x, portafoglio) => { const r = riconosci(x, portafoglio); return r ? decifraCausale(chiaveCausale(r.k), x.memo) : null; };

/** Azienda con polizia, tariffario, giudice, un dipendente pagato, un giorno aperto. */
function scenario() {
  const reg = new Registro({ tipi });
  const pb = portafoglioDaFrase(generaFrase());
  reg.accoda(firmaRiga(preparaRiga(null, { type: 'genesis', ts: '2027-02-28T00:00:00Z', body: { banca: { chiave: banca.pubblica, coordinate: pb.coordinate }, parametri: PARAMETRI } }), [firmaDi(banca)]));
  const az = portafoglioDaFrase(generaFrase());
  const pol = portafoglioDaFrase(generaFrase());
  const dip = portafoglioDaFrase(generaFrase());
  reg.accoda(riga(reg, 'company.register', { chiave: aziendaK.pubblica, coordinate: az.coordinate, nome: 'Officina Rossi' }, [firmaDi(banca)]));
  reg.accoda(riga(reg, 'police.appoint', { azienda: aziendaK.pubblica, chiave: poliziaK.pubblica, coordinate: pol.coordinate }, [firmaDi(aziendaK)]));
  reg.accoda(riga(reg, 'tariff.set', { azienda: aziendaK.pubblica, voci: [{ codice: 'ritardo', nome: 'Ritardo oltre 10 minuti', amount: 301 }] }, [firmaDi(aziendaK)]));
  reg.accoda(riga(reg, 'judge.register', { chiave: giudiceK.pubblica, versione: 'istruzioni-1' }, [firmaDi(banca)]));
  const prezzo = prezzoAcquisto(reg.stato);
  const i = creaIndirizzo(az.coordinate);
  reg.accoda(riga(reg, 'sale', { euro_cent: 100000, prezzo: Number(prezzo), out: [{ addr: i.addr, eph: i.eph, amount: Number(mantiPerEuro(100000n, prezzo)), tag: 'vendita' }], pagamento: 'b' }, [firmaDi(banca)]));
  const p = costruisciPagamento({ portafoglio: az, disponibili: mieEntrate(reg, az), destinazioni: [{ coordinate: dip.coordinate, amount: 20000, tag: 'stipendio' }, { coordinate: dip.coordinate, amount: 20000, tag: 'stipendio' }] });
  reg.accoda(riga(reg, 'payout', { azienda: aziendaK.pubblica, in: p.body.in, out: p.body.out.map((u, k) => (k < 2 ? u : { ...u, tag: 'resto' })) }, [firmaDi(aziendaK), ...p.firmatari]));
  giorno(reg);
  return { reg, pb, az, pol, dip };
}
let giornoN = 0;
function giorno(reg, quanti = 1) {
  for (let k = 0; k < quanti; k++) {
    giornoN++;
    const data = new Date(Date.UTC(2027, 2, giornoN)).toISOString().slice(0, 10);
    orologio = Math.max(orologio, (giornoN - 1) * 86400 + 3600);
    reg.accoda(riga(reg, 'day', { data }, [firmaDi(banca)]));
  }
}
function verbale(reg, dip, numero = 'V-1', mod = (b) => b) {
  return riga(reg, 'fine.issue', mod({ azienda: aziendaK.pubblica, numero, voce: 'ritardo', amount: 301, consegna: cifraPer(dip.coordinate, 'Lunedì 8:14, cantiere B') }), [firmaDi(poliziaK)]);
}
const ID = `${aziendaK.pubblica}:V-1`;

test('verbale: dal tariffario, con giorno aperto, firmato dalla polizia; il multato lo legge, nessun altro', () => {
  const { reg, dip, az } = scenario();
  assert.throws(() => reg.accoda(verbale(reg, dip, 'V-1', (b) => ({ ...b, amount: 300 }))), /il tariffario dice 301/);
  assert.throws(() => reg.accoda(verbale(reg, dip, 'V-1', (b) => ({ ...b, voce: 'furto' }))), /non in tariffario/);
  assert.throws(() => reg.accoda(verbale(reg, dip, 'V 1')), /numero del verbale/);
  assert.throws(() => reg.accoda(firmaRiga({ ...verbale(reg, dip), sigs: undefined }, [firmaDi(aziendaK)])), /manca la firma/);
  reg.accoda(verbale(reg, dip));
  const v = reg.stato.verbali[ID];
  assert.equal(v.stato, 'aperto');
  assert.equal(v.giorno, 1);
  assert.equal(v.data, '2027-03-01');
  assert.equal(leggi(v.consegna, dip), 'Lunedì 8:14, cantiere B');
  assert.equal(leggi(v.consegna, az), null);
  assert.throws(() => reg.accoda(verbale(reg, dip)), /già emesso/);
  assert.equal(definitivoNonSaldato(reg.stato, v), false);
});

test('pagamento: transfer con ref, metà bruciata e metà alla polizia verificabile con r; il valore sale', () => {
  const { reg, dip, pol } = scenario();
  reg.accoda(verbale(reg, dip));
  const prima = valore(reg.stato);
  const { body, firmatari } = costruisciPagamentoRiservato({ portafoglio: dip, disponibili: mieEntrate(reg, dip), destinazioni: [], stato: reg.stato, multa: ID });
  assert.equal(body.ref, ID);
  const chiare = body.out.filter((u) => u.amount !== undefined);
  assert.deepEqual(chiare.map((u) => u.amount), [150, 151], 'il centesimo dispari alla polizia');
  assert.deepEqual(divisioneMulta(reg.stato, 301), { bruciati: 150, polizia: 151 });
  assert.deepEqual(indirizzoDaR(pol.coordinate, chiare[1].r), { addr: chiare[1].addr, eph: chiare[1].eph });
  const r = riga(reg, 'transfer', body, firmatari);
  reg.accoda(r);
  assert.equal(reg.stato.verbali[ID].stato, 'pagato');
  assert.equal(reg.stato.verbali[ID].come, 'pagato');
  assert.equal(saldo(mieEntrate(reg, pol)), 151);
  assert.equal(mieEntrate(reg, pol)[0].tag, 'multa');
  assert.equal(saldo(mieEntrate(reg, dip)), 40000 - 301);
  assert.equal(reg.stato.bruciati_cent, 150n);
  assert.ok(valore(reg.stato) > prima, 'la bruciatura alza il valore');
  assert.throws(() => reg.accoda(riga(reg, 'transfer', body, firmatari)), /già spesa|pagato/);
});

test('pagamento rifiutato: importi sbagliati, metà non alla polizia, verbale inesistente o già pagato, uscite in chiaro senza ref', () => {
  const { reg, dip, az } = scenario();
  reg.accoda(verbale(reg, dip));
  const costruisci = (mod) => {
    const { body, firmatari } = costruisciPagamentoRiservato({ portafoglio: dip, disponibili: mieEntrate(reg, dip), destinazioni: [], stato: reg.stato, multa: ID });
    mod(body);
    return riga(reg, 'transfer', body, firmatari);
  };
  const chiara = (b, k) => b.out.filter((u) => u.amount !== undefined)[k];
  assert.throws(() => reg.accoda(costruisci((b) => { chiara(b, 0).amount = 151; chiara(b, 1).amount = 150; })), /bruciatura 151, dovuta 150/);
  assert.throws(() => reg.accoda(costruisci((b) => { chiara(b, 0).amount = 149; })), /bilancio/);
  assert.throws(() => reg.accoda(costruisci((b) => { const mio = creaIndirizzo(az.coordinate); Object.assign(chiara(b, 1), { addr: mio.addr, eph: mio.eph, r: mio.r }); })), /non va alla polizia/);
  assert.throws(() => reg.accoda(costruisci((b) => { b.ref = `${aziendaK.pubblica}:V-9`; chiara(b, 0).reason = `multa:${aziendaK.pubblica}:V-9`; chiara(b, 1).ref = `${aziendaK.pubblica}:V-9`; })), /verbale sconosciuto/);
  assert.throws(() => reg.accoda(costruisci((b) => { b.ref = null; })), /solo per pagare una multa/);
  assert.throws(() => reg.accoda(costruisci((b) => { delete chiara(b, 1).r; })), /senza ref o r/);
  assert.throws(() => reg.accoda(costruisci((b) => { chiara(b, 1).memo = cifraCausale(new Uint8Array(32), 'ciao'); })), /niente causale/);
  reg.accoda(costruisci(() => {}));
  assert.throws(() => reg.accoda(costruisci(() => {})), /pagato, non si paga/);
});

test('contestazione entro 15 giorni di registro, replica, sentenza che annulla', () => {
  const { reg, dip, pol } = scenario();
  reg.accoda(verbale(reg, dip));
  const v = reg.stato.verbali[ID];
  const p = riconosci(v.consegna, dip).p;
  const firmaConsegna = { by: v.consegna.addr, firma: (h) => firmaScalare(p, h) };
  const contesta = (firmatario = firmaConsegna) => riga(reg, 'fine.contest', { verbale: ID, giudice: cifraPer(giudiceCoord, 'ero in ferie, allego il modulo'), polizia: cifraPer(pol.coordinate, 'ero in ferie') }, [firmatario]);
  const giudiceCoord = portafoglioDaFrase(generaFrase()).coordinate;
  const altro = portafoglioDaFrase(generaFrase());
  assert.throws(() => reg.accoda(contesta({ by: creaIndirizzo(altro.coordinate).addr, firma: (h) => firmaScalare(altro.s, h) })), /firma non valida|manca la firma/);
  giorno(reg, 14); // siamo al giorno 15: 14 giorni dopo il verbale
  reg.accoda(contesta());
  assert.equal(reg.stato.verbali[ID].stato, 'contestato');
  assert.equal(leggi(reg.stato.verbali[ID].contestazione.polizia, pol), 'ero in ferie');
  assert.throws(() => reg.accoda(contesta()), /contestato/);
  // senza replica il giudice aspetta 3 giorni
  const sentenza = (esito, mod = (b) => b) => riga(reg, 'verdict', mod({ verbale: ID, esito, motivazione: 'Il modulo ferie è valido e precedente al verbale.', fascicolo: 'f'.repeat(64), versione: 'istruzioni-1' }), [firmaDi(giudiceK)]);
  assert.throws(() => reg.accoda(sentenza('annullata')), /servono 3 giorni/);
  reg.accoda(riga(reg, 'fine.reply', { verbale: ID, giudice: cifraPer(giudiceCoord, 'il modulo non risulta') }, [firmaDi(poliziaK)]));
  assert.throws(() => reg.accoda(riga(reg, 'fine.reply', { verbale: ID, giudice: cifraPer(giudiceCoord, 'ancora') }, [firmaDi(poliziaK)])), /replica già data/);
  assert.throws(() => reg.accoda(sentenza('sospesa')), /esito ammesso/);
  assert.throws(() => reg.accoda(sentenza('annullata', (b) => ({ ...b, versione: 'istruzioni-2' }))), /istruzioni istruzioni-2, registrate istruzioni-1/);
  assert.throws(() => reg.accoda(firmaRiga({ ...sentenza('annullata'), sigs: undefined }, [firmaDi(banca)])), /manca la firma/);
  reg.accoda(sentenza('annullata'));
  assert.equal(reg.stato.verbali[ID].stato, 'annullato');
  assert.equal(reg.stato.verbali[ID].sentenza.motivazione, 'Il modulo ferie è valido e precedente al verbale.');
  // annullato: non si paga, non si trattiene
  assert.throws(() => {
    const { body, firmatari } = costruisciPagamentoRiservato({ portafoglio: dip, disponibili: mieEntrate(reg, dip), destinazioni: [], stato: reg.stato, multa: ID });
    reg.accoda(riga(reg, 'transfer', body, firmatari));
  }, /annullato, non si paga/);
});

test('il termine: 15 giorni di registro dopo il verbale si contesta ancora, al sedicesimo no; poi il verbale è definitivo e l\'azienda lo trattiene', () => {
  const { reg, dip, pol, az } = scenario();
  reg.accoda(verbale(reg, dip));
  const v = reg.stato.verbali[ID];
  const p = riconosci(v.consegna, dip).p;
  const contesta = () => riga(reg, 'fine.contest', { verbale: ID, giudice: cifraPer(pol.coordinate, 'x'), polizia: cifraPer(pol.coordinate, 'x') }, [{ by: v.consegna.addr, firma: (h) => firmaScalare(p, h) }]);
  // trattenere prima del termine: no
  const trattieni = () => {
    const { body, firmatari } = costruisciPagamento({ portafoglio: az, disponibili: mieEntrate(reg, az), destinazioni: [{ coordinate: dip.coordinate, amount: 20000, tag: 'stipendio' }], trattenute: [ID], stato: reg.stato });
    return riga(reg, 'payout', { azienda: aziendaK.pubblica, in: body.in, out: body.out.map((u) => (u.tag === undefined && u.addr !== null ? { ...u, tag: 'resto' } : u)), trattenute: body.trattenute }, [firmaDi(aziendaK), ...firmatari]);
  };
  assert.throws(() => reg.accoda(trattieni()), /non ancora definitivo/);
  giorno(reg, 15); // giorno 16: 15 giorni dopo il verbale, ancora in tempo
  assert.equal(definitivoNonSaldato(reg.stato, reg.stato.verbali[ID]), false);
  assert.throws(() => reg.accoda(trattieni()), /non ancora definitivo/);
  giorno(reg, 1); // giorno 17: scaduto
  assert.throws(() => reg.accoda(contesta()), /termine scaduto/);
  assert.equal(definitivoNonSaldato(reg.stato, reg.stato.verbali[ID]), true);
  const r = trattieni();
  reg.accoda(r);
  assert.equal(reg.stato.verbali[ID].stato, 'pagato');
  assert.equal(reg.stato.verbali[ID].come, 'trattenuto');
  assert.equal(saldo(mieEntrate(reg, pol)), 151);
  assert.equal(reg.stato.aziende[aziendaK.pubblica].pagati_cent, 40000n + 20000n + 301n);
  assert.equal(saldo(mieEntrate(reg, dip)), 60000, 'lo stipendio è intero: la multa la paga l\'azienda al posto suo, e gliela scala fuori dal registro');
  assert.throws(() => reg.accoda(trattieni()), /pagato, non si paga/);
});

test('trattenuta di un verbale altrui o inesistente, e bruciatura fuori dalle trattenute: rifiutate', () => {
  const { reg, dip, az } = scenario();
  reg.accoda(verbale(reg, dip));
  giorno(reg, 16);
  const altraAzienda = coppiaDaSeme(new Uint8Array(32).fill(8));
  reg.accoda(riga(reg, 'company.register', { chiave: altraAzienda.pubblica, coordinate: portafoglioDaFrase(generaFrase()).coordinate, nome: 'Bar Bianchi' }, [firmaDi(banca)]));
  const { body, firmatari } = costruisciPagamento({ portafoglio: az, disponibili: mieEntrate(reg, az), destinazioni: [{ coordinate: dip.coordinate, amount: 1000, tag: 'stipendio' }], trattenute: [ID], stato: reg.stato });
  const out = body.out.map((u) => (u.tag === undefined && u.addr !== null ? { ...u, tag: 'resto' } : u));
  assert.throws(() => reg.accoda(riga(reg, 'payout', { azienda: altraAzienda.pubblica, in: body.in, out, trattenute: [ID] }, [firmaDi(altraAzienda), ...firmatari])), /non è di questa azienda/);
  assert.throws(() => reg.accoda(riga(reg, 'payout', { azienda: aziendaK.pubblica, in: body.in, out, trattenute: [] }, [firmaDi(aziendaK), ...firmatari])), /fuori dalle trattenute/);
  assert.throws(() => reg.accoda(riga(reg, 'payout', { azienda: aziendaK.pubblica, in: body.in, out, trattenute: [ID, ID] }, [firmaDi(aziendaK), ...firmatari])), /ripetute/);
  reg.accoda(riga(reg, 'payout', { azienda: aziendaK.pubblica, in: body.in, out, trattenute: [ID] }, [firmaDi(aziendaK), ...firmatari]));
});

test('la polizia ritira un verbale aperto, con motivazione; non uno pagato o contestato', () => {
  const { reg, dip } = scenario();
  reg.accoda(verbale(reg, dip));
  const ritira = (firmatario = firmaDi(poliziaK), motivazione = 'persona sbagliata') => riga(reg, 'fine.withdraw', { verbale: ID, motivazione }, [firmatario]);
  assert.throws(() => reg.accoda(ritira(firmaDi(aziendaK))), /manca la firma/);
  assert.throws(() => reg.accoda(ritira(undefined, '')), /motivazione/);
  reg.accoda(ritira());
  assert.equal(reg.stato.verbali[ID].stato, 'ritirato');
  assert.throws(() => reg.accoda(ritira()), /si ritira solo se aperto/);
  assert.throws(() => {
    const { body, firmatari } = costruisciPagamentoRiservato({ portafoglio: dip, disponibili: mieEntrate(reg, dip), destinazioni: [], stato: reg.stato, multa: ID });
    reg.accoda(riga(reg, 'transfer', body, firmatari));
  }, /ritirato, non si paga/);
});

test('sentenza che conferma: il verbale resta saldabile e definitivo; il registro si ricostruisce', () => {
  const { reg, dip, pol } = scenario();
  reg.accoda(verbale(reg, dip));
  const v = reg.stato.verbali[ID];
  const p = riconosci(v.consegna, dip).p;
  reg.accoda(riga(reg, 'fine.contest', { verbale: ID, giudice: cifraPer(pol.coordinate, 'x'), polizia: cifraPer(pol.coordinate, 'x') }, [{ by: v.consegna.addr, firma: (h) => firmaScalare(p, h) }]));
  giorno(reg, 3);
  reg.accoda(riga(reg, 'verdict', { verbale: ID, esito: 'confermata', motivazione: 'Nessuna prova a sostegno.', fascicolo: 'a'.repeat(64), versione: 'istruzioni-1' }, [firmaDi(giudiceK)]));
  assert.equal(reg.stato.verbali[ID].stato, 'confermato');
  assert.equal(definitivoNonSaldato(reg.stato, reg.stato.verbali[ID]), true);
  const { body, firmatari } = costruisciPagamentoRiservato({ portafoglio: dip, disponibili: mieEntrate(reg, dip), destinazioni: [{ coordinate: pol.coordinate, amount: 5 }], stato: reg.stato, multa: ID });
  reg.accoda(riga(reg, 'transfer', body, firmatari));
  assert.equal(reg.stato.verbali[ID].stato, 'pagato');
  assert.equal(saldo(mieEntrate(reg, pol)), 156);
  const copia = Registro.daRighe(JSON.parse(JSON.stringify(reg.righe)), { tipi });
  assert.deepEqual(copia.stato, reg.stato);
});
