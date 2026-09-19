// Simulazione di tre mesi da riga di comando: la prova generale della fase A.
//
// ARCHITETTURA.md, sezione 2. Uso:
//   node simulazione/tre-mesi.js [giorni=90] [correntisti=30] [righe al giorno≈8] [seme=1] [cartella=sim-out]
//
// Due sorgenti di casualità, separate. Lo scenario — chi paga chi, quando,
// quanto, quali esche — viene da un generatore con seme, così una corsa
// fallita si ripete uguale. Maschere, chiavi effimere, nonce delle prove
// vengono dalla casualità vera dei moduli, come in produzione.
//
// A ogni riga: il valore non scende (tranne nelle correzioni), la
// copertura regge (lo controlla la regola), le immagini sono uniche e gli
// anelli della dimensione attesa (lo controlla il registro). Alla fine: la
// riserva calcolata è uguale agli euro veri contati fuori dal registro, e
// il motore rilegge tutto da capo. I tempi, per tipo di riga e per il
// replay, vanno a video.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Registro, preparaRiga, firmaRiga } from '../nucleo/registro.js';
import { rigaAJsonl } from '../nucleo/registro-file.js';
import { tipi } from '../nucleo/tipi.js';
import { valore, prezzoAcquisto, prezzoConversione, mantiPerEuro, euroPerManti, spazioSottoTetto } from '../nucleo/banca.js';
import { definitivoNonSaldato } from '../nucleo/multe.js';
import { coppiaDaSeme, firma, firmaScalare } from '../nucleo/chiavi.js';
import { portafoglioDaFrase, creaIndirizzo, riconosci, chiaveCausale } from '../nucleo/portafoglio.js';
import { cifraCausale } from '../nucleo/causale.js';
import { generaFrase } from '../nucleo/frase.js';
import { mieEntrate as scansione, saldo, costruisciPagamento, costruisciPagamentoRiservato, costruisciRichiestaConversione } from '../nucleo/pagamento.js';

// L'app terrà una copia delle proprie entrate e guarderà solo le righe
// nuove: qui lo stesso, altrimenti ogni pagamento riscandaglia tutto il
// registro per ogni portafoglio (un'immagine di chiave per uscita).
const cache = new Map();
function mieEntrate(reg, portafoglio) {
  let c = cache.get(portafoglio);
  if (!c) { c = { seq: -1, entrate: [] }; cache.set(portafoglio, c); }
  const nuove = { righe: reg.righe.slice(c.seq + 1), stato: reg.stato };
  c.entrate.push(...scansione(nuove, portafoglio));
  c.seq = reg.righe.length - 1;
  c.entrate = c.entrate.filter((e) => !reg.stato.uscite[e.ref].spesa && !reg.stato.immagini[e.img]);
  return c.entrate;
}
import { pubblica } from '../motore/pubblica.js';

const [GIORNI = 90, CORRENTISTI = 30, RIGHE_AL_GIORNO = 8, SEME = 1, CARTELLA = 'sim-out'] = process.argv.slice(2).map((x, i) => (i < 4 ? Number(x) : x));

// ── casualità dello scenario, con seme ──
let stato32 = (Number(SEME) >>> 0) || 1;
const caso = () => { // mulberry32
  stato32 = (stato32 + 0x6D2B79F5) >>> 0;
  let t = stato32;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const tra = (a, b) => a + Math.floor(caso() * (b - a + 1));
const scegli = (xs) => xs[Math.floor(caso() * xs.length)];
const casoIndice = (n) => Math.floor(caso() * n);

// ── il mondo ──
const banca = coppiaDaSeme(new Uint8Array(32).fill(1));
const giudice = coppiaDaSeme(new Uint8Array(32).fill(4));
const firmaDi = (c) => ({ by: c.pubblica, firma: (h) => firma(c.privata, h) });
const pb = portafoglioDaFrase(generaFrase());
const gente = Array.from({ length: Number(CORRENTISTI) }, (_, i) => ({ nome: `c${i}`, p: portafoglioDaFrase(generaFrase()), identificato: caso() < 0.7 }));
const aziende = [0, 1].map((i) => ({
  chiave: coppiaDaSeme(new Uint8Array(32).fill(10 + i)), polizia: coppiaDaSeme(new Uint8Array(32).fill(20 + i)),
  p: portafoglioDaFrase(generaFrase()), pol: portafoglioDaFrase(generaFrase()), nome: ['Officina Rossi', 'Bar Bianchi'][i],
  dipendenti: [], stipendio: [150000, 120000][i],
}));
gente.forEach((g, i) => { if (i % 3 !== 2) aziende[i % 2].dipendenti.push(g); });

const reg = new Registro({ tipi });
let orologio = Date.UTC(2027, 0, 1);
const ts = () => { orologio += tra(30, 600) * 1000; return new Date(orologio).toISOString().replace(/\.\d{3}Z$/, 'Z'); };
const tempi = {};
const conta = {};
function accoda(type, body, firmatari, etichetta = type, t0 = performance.now()) {
  const riga = firmaRiga(preparaRiga(reg.ultima, { type, ts: ts(), body }), firmatari);
  const t1 = performance.now();
  const prima = valore(reg.stato);
  reg.accoda(riga);
  const t2 = performance.now();
  const dopo = valore(reg.stato);
  if (prima !== null && dopo !== null && dopo < prima && type !== 'correction') throw new Error(`riga ${riga.seq} ${type}: il valore scende da ${prima} a ${dopo}`);
  (tempi[etichetta] ??= { n: 0, costruzione: 0, verifica: 0 });
  tempi[etichetta].n++; tempi[etichetta].costruzione += t1 - t0; tempi[etichetta].verifica += t2 - t1;
  conta[type] = (conta[type] ?? 0) + 1;
  return riga;
}
// euro veri, contati fuori dal registro
const euroVeri = { incassati: 0n, interessi: 0n, restituiti: 0n, corretti: 0n };

// ── genesi e ruoli ──
reg.accoda(firmaRiga(preparaRiga(null, { type: 'genesis', ts: '2026-12-31T23:00:00Z', body: { banca: { chiave: banca.pubblica, coordinate: pb.coordinate }, parametri: { sovrapprezzo_pct: 5, commissione_pct: 2, multe_bruciate_pct: 50, tetto_cent: 5000000, giorni_multa: 15 } } }), [firmaDi(banca)]));
accoda('judge.register', { chiave: giudice.pubblica, versione: 'istruzioni-1' }, [firmaDi(banca)]);
for (const az of aziende) {
  accoda('company.register', { chiave: az.chiave.pubblica, coordinate: az.p.coordinate, nome: az.nome }, [firmaDi(banca)]);
  accoda('police.appoint', { azienda: az.chiave.pubblica, chiave: az.polizia.pubblica, coordinate: az.pol.coordinate }, [firmaDi(az.chiave)]);
  accoda('catalog.set', { azienda: az.chiave.pubblica, voci: [{ codice: 'puntualita', nome: 'Mese senza ritardi', amount: 5000 }, { codice: 'idea', nome: 'Idea adottata', amount: 20000 }] }, [firmaDi(az.chiave)]);
  accoda('tariff.set', { azienda: az.chiave.pubblica, voci: [{ codice: 'ritardo', nome: 'Ritardo oltre 10 minuti', amount: 300 }, { codice: 'divisa', nome: 'Senza divisa', amount: 501 }] }, [firmaDi(az.chiave)]);
}

function vendi(coordinate, euroCent) {
  if (spazioSottoTetto(reg.stato) === 0n) return false;
  const prezzo = prezzoAcquisto(reg.stato);
  const manti = mantiPerEuro(BigInt(euroCent), prezzo);
  if (manti === 0n) return false;
  const i = creaIndirizzo(coordinate);
  accoda('sale', { euro_cent: euroCent, prezzo: Number(prezzo), out: [{ addr: i.addr, eph: i.eph, amount: Number(manti), tag: 'vendita' }], pagamento: `stripe:pi_${reg.righe.length}` }, [firmaDi(banca)]);
  euroVeri.incassati += BigInt(euroCent);
  return true;
}
function paga(chi, a, amount, causale, multa = null) {
  const disponibili = mieEntrate(reg, chi.p);
  if (saldo(disponibili) < amount + (multa ? reg.stato.verbali[multa].amount : 0)) return false;
  const t0 = performance.now();
  const { body, firmatari } = costruisciPagamentoRiservato({ portafoglio: chi.p, disponibili, destinazioni: a ? [{ coordinate: a.coordinate, amount, causale }] : [], stato: reg.stato, multa, caso: casoIndice });
  const nOut = body.out.filter((u) => u.amount === undefined).length;
  accoda('transfer', body, firmatari, multa ? 'transfer (multa)' : `transfer (${body.in.length} in, ${nOut} out)`, t0);
  return true;
}
function stipendi(az, giorno) {
  const disponibili = mieEntrate(reg, az.p);
  const dest = az.dipendenti.map((d) => ({ coordinate: d.p.coordinate, amount: az.stipendio, tag: 'stipendio', causale: `stipendio ${giorno.slice(0, 7)}` }));
  for (const d of az.dipendenti) if (caso() < 0.2) dest.push({ coordinate: d.p.coordinate, amount: 5000, tag: 'premio', voce: 'puntualita' });
  const trattenute = Object.entries(reg.stato.verbali ?? {}).filter(([, v]) => v.azienda === az.chiave.pubblica && definitivoNonSaldato(reg.stato, v)).map(([id]) => id);
  const totale = dest.reduce((s, d) => s + d.amount, 0) + trattenute.reduce((s, id) => s + reg.stato.verbali[id].amount, 0);
  if (saldo(disponibili) < totale) {
    const mancano = totale - saldo(disponibili) + 100000;
    const euro = Number(euroPerManti(BigInt(mancano), prezzoAcquisto(reg.stato))) + 100;
    if (!vendi(az.p.coordinate, euro)) return;
    return stipendi(az, giorno);
  }
  const t0 = performance.now();
  const { body, firmatari } = costruisciPagamento({ portafoglio: az.p, disponibili, destinazioni: dest, trattenute, stato: reg.stato });
  const out = body.out.map((u) => (u.tag === undefined && u.addr !== null ? { ...u, tag: 'resto' } : u));
  accoda('payout', { azienda: az.chiave.pubblica, in: body.in, out, ...(trattenute.length ? { trattenute } : {}) }, [firmaDi(az.chiave), ...firmatari], `payout (${dest.length} uscite)`, t0);
}
let numeroVerbale = 0;
function multa(az) {
  const d = scegli(az.dipendenti);
  const voce = scegli(['ritardo', 'divisa']);
  const numero = `V-${++numeroVerbale}`;
  const c = creaIndirizzo(d.p.coordinate);
  accoda('fine.issue', { azienda: az.chiave.pubblica, numero, voce, amount: reg.stato.aziende[az.chiave.pubblica].tariffario[voce].amount, consegna: { addr: c.addr, eph: c.eph, memo: cifraCausale(chiaveCausale(c.k), 'verbale di prova') } }, [firmaDi(az.polizia)]);
  return { id: `${az.chiave.pubblica}:${numero}`, d, az };
}
const aperti = [];
function gestisciMulte() {
  for (const m of [...aperti]) {
    const v = reg.stato.verbali[m.id];
    const dado = caso();
    if (v.stato === 'aperto' && dado < 0.15) { // paga
      if (paga(m.d, null, 0, undefined, m.id)) aperti.splice(aperti.indexOf(m), 1);
    } else if (v.stato === 'aperto' && dado < 0.22 && reg.stato.n_giorni - v.giorno <= 15) { // contesta
      const p = riconosci(v.consegna, m.d.p).p;
      const per = (coord) => { const i = creaIndirizzo(coord); return { addr: i.addr, eph: i.eph, memo: cifraCausale(chiaveCausale(i.k), 'contesto') }; };
      accoda('fine.contest', { verbale: m.id, giudice: per(pb.coordinate), polizia: per(m.az.pol.coordinate) }, [{ by: v.consegna.addr, firma: (h) => firmaScalare(p, h) }]);
    } else if (v.stato === 'contestato' && !v.replica && dado < 0.5) {
      const i = creaIndirizzo(pb.coordinate);
      accoda('fine.reply', { verbale: m.id, giudice: { addr: i.addr, eph: i.eph, memo: cifraCausale(chiaveCausale(i.k), 'replico') } }, [firmaDi(m.az.polizia)]);
    } else if (v.stato === 'contestato' && (v.replica || reg.stato.n_giorni - v.contestato_giorno >= 3) && dado < 0.6) {
      const esito = caso() < 0.5 ? 'annullata' : 'confermata';
      accoda('verdict', { verbale: m.id, esito, motivazione: esito === 'annullata' ? 'La contestazione è fondata.' : 'Nessuna prova a sostegno della contestazione.', fascicolo: 'ab'.repeat(32), versione: 'istruzioni-1' }, [firmaDi(giudice)]);
      if (esito === 'annullata') aperti.splice(aperti.indexOf(m), 1);
    } else if (v.stato === 'pagato' || v.stato === 'annullato') {
      aperti.splice(aperti.indexOf(m), 1);
    }
  }
}
const richieste = [];
function chiediConversione(chi) {
  const disponibili = mieEntrate(reg, chi.p);
  if (saldo(disponibili) < 1000) return;
  const amount = tra(500, Math.min(saldo(disponibili), 200000));
  const t0 = performance.now();
  const { body, firmatari } = costruisciRichiestaConversione({ portafoglio: chi.p, disponibili, amount, dati: `${chi.nome}, IT00X0000000000000000000000`, coordinateBanca: pb.coordinate, stato: reg.stato, caso: casoIndice });
  const r = accoda('conversion.request', body, firmatari, 'conversion.request', t0);
  richieste.push({ hash: r.hash, chi });
}
function eseguiConversioni() {
  for (const r of [...richieste]) {
    if (!r.chi.identificato) continue; // la banca non paga chi non conosce: resta in sospeso
    const c = reg.stato.conversioni[r.hash];
    const prezzo = prezzoConversione(reg.stato);
    const euro = euroPerManti(BigInt(c.amount), prezzo);
    accoda('conversion.execute', { richiesta: r.hash, prezzo: Number(prezzo), euro_cent: Number(euro) }, [firmaDi(banca)]);
    euroVeri.restituiti += euro;
    accoda('conversion.paid', { richiesta: r.hash, data: reg.stato.giorno }, [firmaDi(banca)]);
    richieste.splice(richieste.indexOf(r), 1);
  }
}

// ── i giorni ──
const t0 = performance.now();
let ultimoInteresse = null;
for (let g = 1; g <= Number(GIORNI); g++) {
  const data = new Date(Date.UTC(2027, 0, g)).toISOString().slice(0, 10);
  orologio = Math.max(orologio, Date.UTC(2027, 0, g) + 6 * 3600 * 1000);
  accoda('day', { data }, [firmaDi(banca)]);
  if (data.endsWith('-01')) {
    for (const az of aziende) stipendi(az, data);
    if (g > 1) {
      const euro = tra(100, 800);
      ultimoInteresse = accoda('reserve.interest', { euro_cent: euro, da: data, a: data }, [firmaDi(banca)]);
      euroVeri.interessi += BigInt(euro);
      accoda('reserve.statement', { mese: data.slice(0, 7), saldo_cent: Number(reg.stato.riserva_cent), documento: 'cd'.repeat(32) }, [firmaDi(banca)]);
    }
  }
  if (g === 45 && ultimoInteresse) { // una correzione, una volta
    accoda('correction', { ref: ultimoInteresse.hash, euro_cent: 50, motivazione: 'interesse sovrastimato di 0,50 €' }, [firmaDi(banca)]);
    euroVeri.corretti += 50n;
  }
  const righe = tra(Math.max(1, Number(RIGHE_AL_GIORNO) - 4), Number(RIGHE_AL_GIORNO) + 4);
  for (let k = 0; k < righe; k++) {
    const dado = caso();
    if (dado < 0.15) vendi(scegli(gente).p.coordinate, tra(2000, 30000));
    else if (dado < 0.75) { const [da, a] = [scegli(gente), scegli(gente)]; if (da !== a) paga(da, a.p, tra(100, 8000), scegli(['caffè', 'pranzo', 'grazie', undefined])); }
    else if (dado < 0.85) aperti.push(multa(scegli(aziende)));
    else if (dado < 0.93) chiediConversione(scegli(gente));
    else gestisciMulte();
  }
  gestisciMulte();
  if (g % 3 === 0) eseguiConversioni();
  if (g % 10 === 0) process.stdout.write(`giorno ${g}: ${reg.righe.length} righe, valore ${valore(reg.stato)}\n`);
}
const durata = (performance.now() - t0) / 1000;

// ── verifiche finali ──
const s = reg.stato;
const attesa = euroVeri.incassati + euroVeri.interessi - euroVeri.restituiti - euroVeri.corretti;
if (s.riserva_cent !== attesa) throw new Error(`riserva ${s.riserva_cent} ≠ euro veri ${attesa}`);
// la somma dei saldi con la scansione completa, non con la cache
const saldi = gente.reduce((acc, g) => acc + saldo(scansione(reg, g.p)), 0) + aziende.reduce((acc, a) => acc + saldo(scansione(reg, a.p)) + saldo(scansione(reg, a.pol)), 0);
const inSospeso = Object.values(s.conversioni).filter((c) => c.stato === 'richiesta').reduce((acc, c) => acc + c.amount, 0);
if (BigInt(saldi + inSospeso) !== s.circolazione_cent) throw new Error(`saldi ${saldi} + in sospeso ${inSospeso} ≠ circolazione ${s.circolazione_cent}`);

mkdirSync(CARTELLA, { recursive: true });
writeFileSync(join(CARTELLA, 'ledger.jsonl'), reg.righe.map(rigaAJsonl).join(''));
const t1 = performance.now();
const esito = pubblica(join(CARTELLA, 'ledger.jsonl'), join(CARTELLA, 'sito'));
const replay = (performance.now() - t1) / 1000;
if (!esito.ok) throw new Error(`il motore rifiuta: ${esito.errore.seq} ${esito.errore.motivo}`);

console.log(`\n${reg.righe.length} righe in ${GIORNI} giorni, ${CORRENTISTI} correntisti, seme ${SEME}: costruite e verificate in ${durata.toFixed(1)} s`);
console.log(`valore finale ${(Number(valore(s)) / 10000).toFixed(4)} €, riserva ${(Number(s.riserva_cent) / 100).toFixed(2)} € = euro veri, circolazione ${(Number(s.circolazione_cent) / 100).toFixed(2)} manti = somma dei saldi`);
console.log(`uscite ${Object.keys(s.uscite).length}, immagini spese ${Object.keys(s.immagini).length}, verbali ${Object.keys(s.verbali ?? {}).length}, conversioni ${Object.keys(s.conversioni ?? {}).length} (${inSospeso ? 'alcune in sospeso' : 'tutte eseguite'})`);
console.log(`\nreplay del motore da capo: ${replay.toFixed(1)} s per ${reg.righe.length} righe (${(replay * 1000 / reg.righe.length).toFixed(0)} ms/riga)\n`);
console.log('tipo                          n   costruzione   verifica   (ms per riga)');
for (const [k, v] of Object.entries(tempi).sort((a, b) => b[1].costruzione - a[1].costruzione)) {
  console.log(`${k.padEnd(28)} ${String(v.n).padStart(4)}   ${(v.costruzione / v.n).toFixed(0).padStart(8)}     ${(v.verifica / v.n).toFixed(0).padStart(6)}`);
}
