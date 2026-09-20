import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as banca from '../banca/comandi.js';
import { identitaRuolo } from '../nucleo/ruoli.js';
import { generaFrase } from '../nucleo/frase.js';
import { portafoglioDaFrase, creaIndirizzo, riconosci, chiaveCausale } from '../nucleo/portafoglio.js';
import { cifraCausale } from '../nucleo/causale.js';
import { firmaScalare } from '../nucleo/chiavi.js';
import { apriRegistro } from '../nucleo/registro-file.js';
import { tipi } from '../nucleo/tipi.js';
import { giro, daDecidere, costruisciFascicolo, VERSIONE } from '../giudice/servizio.js';

/** Azienda, polizia, giudice, un dipendente con un verbale contestato. */
async function scenario() {
  const d = mkdtempSync(join(tmpdir(), 'manti-giudice-'));
  const ledger = join(d, 'ledger.jsonl');
  const fraseBanca = banca.nuovaFrase().frase;
  const fraseGiudice = generaFrase();
  const giudice = identitaRuolo(fraseGiudice, 'giudice');
  const azienda = identitaRuolo(generaFrase(), 'azienda');
  const polizia = identitaRuolo(generaFrase(), 'polizia');
  const dip = portafoglioDaFrase(generaFrase());
  await banca.genesi(ledger, fraseBanca);
  await banca.giorno(ledger, fraseBanca, '2026-09-01');
  await banca.azienda(ledger, fraseBanca, azienda.chiave.pubblica, azienda.portafoglio.coordinate, 'Officina Rossi');
  await banca.giudice(ledger, fraseBanca, giudice.chiave.pubblica, giudice.portafoglio.coordinate, VERSIONE);
  const firma = (type, body, firmatari) => banca.consegna(ledger, () => ({ type, body, firmatari }));
  await firma('police.appoint', { azienda: azienda.chiave.pubblica, chiave: polizia.chiave.pubblica, coordinate: polizia.portafoglio.coordinate }, [azienda.firmatario]);
  await firma('tariff.set', { azienda: azienda.chiave.pubblica, voci: [{ codice: 'ritardo', nome: 'Ritardo oltre 10 minuti', descrizione: "sull'orario di turno", amount: 500 }] }, [azienda.firmatario]);
  const c = creaIndirizzo(dip.coordinate);
  await firma('fine.issue', { azienda: azienda.chiave.pubblica, numero: 'V-1', voce: 'ritardo', amount: 500, consegna: { addr: c.addr, eph: c.eph, memo: cifraCausale(chiaveCausale(c.k), 'Lunedì 8:14') } }, [polizia.firmatario]);
  const id = `${azienda.chiave.pubblica}:V-1`;
  const per = (coord, testo) => { const i = creaIndirizzo(coord); return { addr: i.addr, eph: i.eph, memo: cifraCausale(chiaveCausale(i.k), testo) }; };
  const v = apriRegistro(ledger, { tipi }).stato.verbali[id];
  const p = riconosci(v.consegna, dip).p;
  await firma('fine.contest', { verbale: id, giudice: per(giudice.portafoglio.coordinate, 'Ero in magazzino a scaricare, in sala c\'era un collega. Il turno lo conferma.'), polizia: per(polizia.portafoglio.coordinate, 'ero in magazzino') }, [{ by: v.consegna.addr, firma: (h) => firmaScalare(p, h) }]);
  return { ledger, fraseBanca, fraseGiudice, giudice, azienda, polizia, id, firma, per };
}

test('senza replica il giudice aspetta 3 giorni; poi decide con il fascicolo giusto e firma la sentenza', async () => {
  const s = await scenario();
  let s0 = apriRegistro(s.ledger, { tipi }).stato;
  assert.equal(daDecidere(s0).length, 0);
  const fascicoli = [];
  const chiedi = async (f) => { fascicoli.push(f); return { esito: 'annullata', motivazione: 'La ragione è concreta e la polizia non ha replicato: si presume vera.' }; };
  assert.deepEqual(await giro({ dest: s.ledger, frase: s.fraseGiudice, chiedi }), []);
  await banca.giorno(s.ledger, s.fraseBanca, '2026-09-02');
  await banca.giorno(s.ledger, s.fraseBanca, '2026-09-03');
  await banca.giorno(s.ledger, s.fraseBanca, '2026-09-04');
  s0 = apriRegistro(s.ledger, { tipi }).stato;
  assert.equal(daDecidere(s0).length, 1);
  const esiti = await giro({ dest: s.ledger, frase: s.fraseGiudice, chiedi });
  assert.deepEqual(esiti, [{ id: s.id, esito: 'annullata' }]);
  assert.equal(fascicoli.length, 1);
  const f = fascicoli[0];
  assert.equal(f.verbale.numero, 'V-1');
  assert.equal(f.verbale.infrazione, 'Ritardo oltre 10 minuti');
  assert.equal(f.verbale.regola, "sull'orario di turno");
  assert.match(f.contestazione, /magazzino/);
  assert.equal(f.replica, null);
  assert.ok(!JSON.stringify(f).includes('addr'), 'nessun indirizzo nel fascicolo');
  const v = apriRegistro(s.ledger, { tipi }).stato.verbali[s.id];
  assert.equal(v.stato, 'annullato');
  assert.equal(v.sentenza.versione, VERSIONE);
  assert.match(v.sentenza.fascicolo, /^[0-9a-f]{64}$/);
  // niente da rifare
  assert.deepEqual(await giro({ dest: s.ledger, frase: s.fraseGiudice, chiedi }), []);
});

test('con la replica decide subito; il modello che sbaglia o tace non produce sentenze', async () => {
  const s = await scenario();
  await s.firma('fine.reply', { verbale: s.id, giudice: s.per(s.giudice.portafoglio.coordinate, 'Il turno dice sala. La descrizione del verbale: in sala alle 8:14.') }, [s.polizia.firmatario]);
  const muto = async () => { throw new Error('timeout'); };
  assert.deepEqual(await giro({ dest: s.ledger, frase: s.fraseGiudice, chiedi: muto }), [{ id: s.id, errore: 'timeout' }]);
  assert.equal(apriRegistro(s.ledger, { tipi }).stato.verbali[s.id].stato, 'contestato');
  const fascicoli = [];
  const chiedi = async (f) => { fascicoli.push(f); return { esito: 'confermata', motivazione: 'La replica è coerente con il verbale.' }; };
  assert.deepEqual(await giro({ dest: s.ledger, frase: s.fraseGiudice, chiedi }), [{ id: s.id, esito: 'confermata' }]);
  assert.match(fascicoli[0].replica, /turno dice sala/);
  assert.equal(apriRegistro(s.ledger, { tipi }).stato.verbali[s.id].stato, 'confermato');
});

test('frase sbagliata o versione delle istruzioni diversa: il giro si ferma prima di decidere', async () => {
  const s = await scenario();
  await assert.rejects(() => giro({ dest: s.ledger, frase: generaFrase(), chiedi: async () => ({ esito: 'annullata', motivazione: 'x' }) }), /non è quella del giudice/);
  const altro = identitaRuolo(generaFrase(), 'giudice');
  await banca.giudice(s.ledger, s.fraseBanca, altro.chiave.pubblica, altro.portafoglio.coordinate, 'istruzioni-9');
  const nuovo = apriRegistro(s.ledger, { tipi }).stato;
  assert.equal(nuovo.giudice.versione, 'istruzioni-9');
  const f = costruisciFascicolo(nuovo, { ...nuovo.verbali[s.id], id: s.id }, altro.portafoglio);
  assert.equal(f, null, 'il giudice nuovo non legge i testi cifrati per il vecchio');
});
