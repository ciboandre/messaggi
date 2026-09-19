import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Registro, preparaRiga, firmaRiga } from '../nucleo/registro.js';
import { rigaAJsonl } from '../nucleo/registro-file.js';
import { tipi } from '../nucleo/tipi.js';
import { prezzoAcquisto, mantiPerEuro } from '../nucleo/banca.js';
import { coppiaDaSeme, firma } from '../nucleo/chiavi.js';
import { portafoglioDaFrase, creaIndirizzo } from '../nucleo/portafoglio.js';
import { generaFrase } from '../nucleo/frase.js';
import { mieEntrate, costruisciPagamentoRiservato } from '../nucleo/pagamento.js';
import { pubblica, rileggi, riassunto } from '../motore/pubblica.js';

const banca = coppiaDaSeme(new Uint8Array(32).fill(1));
const PARAMETRI = { sovrapprezzo_pct: 5, commissione_pct: 2, multe_bruciate_pct: 50, tetto_cent: 100000000, giorni_multa: 15 };
const firmaBanca = { by: banca.pubblica, firma: (h) => firma(banca.privata, h) };
let orologio = 0;
const ts = () => { orologio += 60; return new Date(Date.UTC(2027, 3, 1) + orologio * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'); };
const riga = (reg, type, body, firmatari) => firmaRiga(preparaRiga(reg.ultima, { type, ts: ts(), body }), firmatari);

function registroDiProva() {
  const reg = new Registro({ tipi });
  const pb = portafoglioDaFrase(generaFrase());
  const a = portafoglioDaFrase(generaFrase());
  const b = portafoglioDaFrase(generaFrase());
  reg.accoda(firmaRiga(preparaRiga(null, { type: 'genesis', ts: '2027-03-31T00:00:00Z', body: { banca: { chiave: banca.pubblica, coordinate: pb.coordinate }, parametri: PARAMETRI } }), [firmaBanca]));
  reg.accoda(riga(reg, 'day', { data: '2027-04-01' }, [firmaBanca]));
  const prezzo = prezzoAcquisto(reg.stato);
  const i = creaIndirizzo(a.coordinate);
  reg.accoda(riga(reg, 'sale', { euro_cent: 100000, prezzo: Number(prezzo), out: [{ addr: i.addr, eph: i.eph, amount: Number(mantiPerEuro(100000n, prezzo)), tag: 'vendita' }], pagamento: 'b1' }, [firmaBanca]));
  reg.accoda(riga(reg, 'reserve.interest', { euro_cent: 250, da: '2027-03-01', a: '2027-03-31' }, [firmaBanca]));
  const p = costruisciPagamentoRiservato({ portafoglio: a, disponibili: mieEntrate(reg, a), destinazioni: [{ coordinate: b.coordinate, amount: 1234, causale: 'x' }], stato: reg.stato });
  reg.accoda(riga(reg, 'transfer', p.body, p.firmatari));
  reg.accoda(riga(reg, 'reserve.statement', { mese: '2027-03', saldo_cent: 100250, documento: 'd'.repeat(64) }, [firmaBanca]));
  return reg;
}

test('il motore rilegge un registro buono, scrive stato.json e index.html con il valore e il conto esplicito', () => {
  const reg = registroDiProva();
  const dir = mkdtempSync(join(tmpdir(), 'manti-'));
  const ledger = join(dir, 'ledger.jsonl');
  writeFileSync(ledger, reg.righe.map(rigaAJsonl).join(''));
  const esito = pubblica(ledger, join(dir, 'sito'));
  assert.equal(esito.ok, true);
  assert.equal(esito.seq, 5);
  const stato = JSON.parse(readFileSync(join(dir, 'sito', 'stato.json'), 'utf8'));
  assert.equal(stato.errore, null);
  assert.equal(stato.valore.decimillesimi, '10025');
  assert.equal(stato.riserva_cent, '100250');
  assert.equal(stato.circolazione_cent, '100000');
  assert.equal(stato.uscite, 3, 'vendita, pagamento e resto');
  assert.equal(stato.immagini_spese, 1);
  assert.equal(stato.estratti['2027-03'].saldo_cent, '100250');
  const html = readFileSync(join(dir, 'sito', 'index.html'), 'utf8');
  assert.match(html, /class="big">1,003<small>€ per 1/, 'il valore grande, tre decimali come nel mockup');
  assert.match(html, /1002,50 ÷ 1000,00<\/span><span class="num">1,0025 €/, 'il conto di oggi');
  assert.match(html, /▲ 0,3% dalla partenza · non è mai sceso/);
  assert.match(html, /<span class="pill ">pagamento<\/span>/);
  assert.match(html, /2 uscite riservate/);
  assert.match(html, /verificato, 6 righe su 6/);
  assert.match(html, /<symbol id="manto"/);
  assert.ok(!html.includes('1234'), 'l\'importo riservato non compare');
  assert.ok(!html.includes('<script'), 'nessuno script');
  assert.ok(!html.includes('Registro rotto'));
  assert.ok(existsSync(join(dir, 'sito', 'ledger.jsonl')));
});

test('una riga invalida in mezzo: il motore si ferma lì, mostra l\'ultimo stato buono e l\'avviso, esce con errore', () => {
  const reg = registroDiProva();
  const righe = JSON.parse(JSON.stringify(reg.righe));
  righe[3].body.euro_cent = 999; // l'interesse manomesso: hash non torna più
  const dir = mkdtempSync(join(tmpdir(), 'manti-'));
  const ledger = join(dir, 'ledger.jsonl');
  writeFileSync(ledger, righe.map(rigaAJsonl).join(''));
  const esito = pubblica(ledger, join(dir, 'sito'));
  assert.equal(esito.ok, false);
  assert.equal(esito.errore.seq, 3);
  assert.match(esito.errore.motivo, /hash non corrisponde/);
  assert.equal(esito.seq, 2, 'buone fino alla vendita');
  const stato = JSON.parse(readFileSync(join(dir, 'sito', 'stato.json'), 'utf8'));
  assert.equal(stato.errore.seq, 3);
  assert.equal(stato.riserva_cent, '100000', 'senza l\'interesse');
  const html = readFileSync(join(dir, 'sito', 'index.html'), 'utf8');
  assert.match(html, /Registro rotto/);
  assert.match(html, /La riga <b>3<\/b> non passa/);
  assert.match(html, /numeri fermi alla riga 2 su 6/);
});

test('registro assente vale vuoto; illeggibile è un errore con pagina e senza stato', () => {
  const dir = mkdtempSync(join(tmpdir(), 'manti-'));
  const esito = pubblica(join(dir, 'manca.jsonl'), join(dir, 'sito'));
  assert.equal(esito.ok, true);
  assert.equal(esito.seq, -1);
  assert.match(readFileSync(join(dir, 'sito', 'index.html'), 'utf8'), /Registro vuoto/);
  assert.match(readFileSync(join(dir, 'sito', 'index.html'), 'utf8'), /in attesa della prima vendita/);
  writeFileSync(join(dir, 'rotto.jsonl'), '{"seq":0}\nnon json\n');
  const rotto = pubblica(join(dir, 'rotto.jsonl'), join(dir, 'sito2'));
  assert.equal(rotto.ok, false);
  assert.match(rotto.errore.motivo, /illeggibile.*linea 2: JSON non valido/);
  assert.ok(existsSync(join(dir, 'sito2', 'index.html')));
  assert.ok(!existsSync(join(dir, 'sito2', 'stato.json')));
});

test('deterministico: due esecuzioni sullo stesso registro danno gli stessi byte', () => {
  const reg = registroDiProva();
  const dir = mkdtempSync(join(tmpdir(), 'manti-'));
  const ledger = join(dir, 'ledger.jsonl');
  writeFileSync(ledger, reg.righe.map(rigaAJsonl).join(''));
  pubblica(ledger, join(dir, 'a'));
  pubblica(ledger, join(dir, 'b'));
  assert.equal(readFileSync(join(dir, 'a', 'index.html'), 'utf8'), readFileSync(join(dir, 'b', 'index.html'), 'utf8'));
  assert.equal(readFileSync(join(dir, 'a', 'stato.json'), 'utf8'), readFileSync(join(dir, 'b', 'stato.json'), 'utf8'));
  assert.ok(!readFileSync(join(dir, 'a', 'index.html'), 'utf8').includes(new Date().toISOString().slice(0, 4) + '-' + new Date().toISOString().slice(5, 7)), 'nessuna data di oggi nella pagina');
});

test('riassunto: nessun BigInt, tutto serializzabile', () => {
  const reg = registroDiProva();
  const r = riassunto(reg);
  assert.doesNotThrow(() => JSON.stringify(r));
  assert.equal(typeof r.riserva_cent, 'string');
  const { registro, errore } = rileggi(JSON.parse(JSON.stringify(reg.righe)));
  assert.equal(errore, null);
  assert.deepEqual(registro.stato, reg.stato);
});
