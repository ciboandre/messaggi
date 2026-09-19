// Il correntista da riga di comando: il conto di prova prima dell'app.
//
// Stesse chiavi e stesse righe che avrà l'app (ARCHITETTURA.md, sezione
// 5): dodici parole, coordinate, pagamenti riservati, richieste di
// conversione. Nella fase di test le righe vanno dritte in ledger.jsonl
// e poi su git; con il server (fase C) andranno via HTTP.

import { generaFrase, fraseValida } from '../nucleo/frase.js';
import { portafoglioDaFrase, decodificaCoordinate } from '../nucleo/portafoglio.js';
import { preparaRiga, firmaRiga } from '../nucleo/registro.js';
import { apriRegistro, accodaSuFile } from '../nucleo/registro-file.js';
import { tipi } from '../nucleo/tipi.js';
import { mieEntrate, saldo as sommaSaldo, costruisciPagamentoRiservato, costruisciRichiestaConversione } from '../nucleo/pagamento.js';
import { valore, prezzoConversione, euroPerManti } from '../nucleo/banca.js';
import { centesimiDa } from '../banca/comandi.js';

const adesso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

function portafoglio(frase) {
  if (!fraseValida(frase)) throw new Error('frase non valida');
  return portafoglioDaFrase(frase);
}

/** Una frase nuova e le sue coordinate. */
export function nuovo() {
  const frase = generaFrase();
  return { frase, coordinate: portafoglioDaFrase(frase).coordinate };
}

/** Le coordinate di una frase: sono pubbliche, si danno a chi deve pagare. */
export function coordinate(frase) {
  return portafoglio(frase).coordinate;
}

/** Saldo ed entrate non spese, con il controvalore in euro al valore del giorno. */
export function saldo(percorso, frase) {
  const p = portafoglio(frase);
  const reg = apriRegistro(percorso, { tipi });
  const entrate = mieEntrate(reg, p);
  const v = valore(reg.stato);
  const totale = sommaSaldo(entrate);
  return {
    totale, valore: v,
    in_euro: v === null ? null : (BigInt(totale) * v) / 10000n,
    entrate: entrate.map((e) => ({ seq: e.seq, amount: e.amount, chiaro: e.chiaro, tag: e.tag ?? null, causale: e.causale })),
  };
}

/**
 * Paga in modo riservato a delle coordinate, con causale facoltativa.
 * Accoda la riga al registro.
 */
export function paga(percorso, frase, importo, destinazione, causale) {
  const p = portafoglio(frase);
  decodificaCoordinate(destinazione);
  const amount = centesimiDa(importo);
  const reg = apriRegistro(percorso, { tipi });
  const disponibili = mieEntrate(reg, p);
  const { body, firmatari } = costruisciPagamentoRiservato({ portafoglio: p, disponibili, destinazioni: [{ coordinate: destinazione, amount, ...(causale ? { causale } : {}) }], stato: reg.stato });
  const riga = firmaRiga(preparaRiga(reg.ultima, { type: 'transfer', ts: adesso(), body }), firmatari);
  accodaSuFile(reg, percorso, riga);
  return { riga, resto: sommaSaldo(mieEntrate(reg, p)) };
}

/**
 * Chiede alla banca di convertire dei manti in euro. I dati (nome, IBAN)
 * sono cifrati per la banca. La banca esegue solo se ti ha identificato.
 */
export function converti(percorso, frase, importo, dati) {
  const p = portafoglio(frase);
  const amount = centesimiDa(importo);
  if (typeof dati !== 'string' || !dati.trim()) throw new Error('servono i dati per il pagamento (nome e IBAN), cifrati per la banca');
  const reg = apriRegistro(percorso, { tipi });
  const s = /** @type {any} */ (reg.stato);
  if (!s.genesi) throw new Error('registro senza genesi');
  const disponibili = mieEntrate(reg, p);
  const { body, firmatari } = costruisciRichiestaConversione({ portafoglio: p, disponibili, amount, dati, coordinateBanca: s.genesi.banca.coordinate, stato: reg.stato });
  const riga = firmaRiga(preparaRiga(reg.ultima, { type: 'conversion.request', ts: adesso(), body }), firmatari);
  accodaSuFile(reg, percorso, riga);
  const prezzo = prezzoConversione(reg.stato);
  return { riga, euro_oggi: prezzo === null ? null : euroPerManti(BigInt(amount), prezzo) };
}
