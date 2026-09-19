// Il correntista da riga di comando: il conto di prova prima dell'app.
//
// Stesse chiavi e stesse righe che avrà l'app (ARCHITETTURA.md, sezione
// 5): dodici parole, coordinate, pagamenti riservati, richieste di
// conversione. La destinazione è il file ledger.jsonl (poi git push) o il
// server della banca, come per la banca (banca/comandi.js).

import { generaFrase, fraseValida } from '../nucleo/frase.js';
import { portafoglioDaFrase } from '../nucleo/portafoglio.js';
import { mieEntrate, saldo as sommaSaldo, costruisciPagamentoRiservato, costruisciRichiestaConversione } from '../nucleo/pagamento.js';
import { valore, prezzoConversione, euroPerManti } from '../nucleo/banca.js';
import { centesimiDa, controllaCoordinate, consegna, leggiRegistro } from '../banca/comandi.js';

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
export async function saldo(dest, frase) {
  const p = portafoglio(frase);
  const reg = await leggiRegistro(dest);
  const entrate = mieEntrate(reg, p);
  const v = valore(reg.stato);
  const totale = sommaSaldo(entrate);
  return {
    totale, valore: v,
    in_euro: v === null ? null : (BigInt(totale) * v) / 10000n,
    entrate: entrate.map((e) => ({ seq: e.seq, amount: e.amount, chiaro: e.chiaro, tag: e.tag ?? null, causale: e.causale })),
  };
}

/** Paga in modo riservato a delle coordinate, con causale facoltativa. */
export async function paga(dest, frase, importo, destinazione, causale) {
  const p = portafoglio(frase);
  controllaCoordinate(destinazione);
  const amount = centesimiDa(importo);
  let resto = 0;
  const esito = await consegna(dest, (reg) => {
    const disponibili = mieEntrate(reg, p);
    const { body, firmatari } = costruisciPagamentoRiservato({ portafoglio: p, disponibili, destinazioni: [{ coordinate: destinazione, amount, ...(causale ? { causale } : {}) }], stato: reg.stato });
    resto = sommaSaldo(disponibili) - amount;
    return { type: 'transfer', body, firmatari };
  });
  return { ...esito, resto };
}

/**
 * Chiede alla banca di convertire dei manti in euro. I dati (nome, IBAN)
 * sono cifrati per la banca. La banca esegue solo se ti ha identificato.
 */
export async function converti(dest, frase, importo, dati) {
  const p = portafoglio(frase);
  const amount = centesimiDa(importo);
  if (typeof dati !== 'string' || !dati.trim()) throw new Error('servono i dati per il pagamento (nome e IBAN), cifrati per la banca');
  let euroOggi = null;
  const esito = await consegna(dest, (reg) => {
    const s = /** @type {any} */ (reg.stato);
    if (!s.genesi) throw new Error('registro senza genesi');
    const { body, firmatari } = costruisciRichiestaConversione({ portafoglio: p, disponibili: mieEntrate(reg, p), amount, dati, coordinateBanca: s.genesi.banca.coordinate, stato: reg.stato });
    const prezzo = prezzoConversione(reg.stato);
    euroOggi = prezzo === null ? null : euroPerManti(BigInt(amount), prezzo);
    return { type: 'conversion.request', body, firmatari };
  });
  return { ...esito, euro_oggi: euroOggi };
}
