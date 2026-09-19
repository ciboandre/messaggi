// Conversioni: manti → euro, in tre righe.
//
// REGOLE_MONETA.md sezione 7; ARCHITETTURA.md sezione 8.
//
// `conversion.request` (correntista): entrate in anello, un importo in
// chiaro da convertire, un resto riservato con la sua prova di intervallo,
// e i dati per il pagamento cifrati per la banca. È la prima riga mista:
// il bilancio confronta gli pseudo-impegni con amount·H più l'impegno del
// resto, e la prova copre solo il resto (l'importo pubblico è un intero
// visibile, non ha bisogno di prova). I manti chiesti non diventano
// un'uscita: stanno in `conversioni`, fuori da ogni anello e da ogni
// spesa, finché la banca non li brucia. Restano in circolazione fino a
// quel momento.
//
// Il resto c'è sempre, anche da zero manti. Senza, con una sola entrata
// il bilancio obbligherebbe lo pseudo-impegno ad avere maschera zero, cioè
// a essere uguale all'impegno dell'entrata vera: l'anello direbbe quale
// membro è quello vero. Monero fa lo stesso con l'uscita di resto fittizia.
//
// `conversion.execute` (banca): riferimento alla richiesta, bruciatura dei
// manti al prezzo di conversione **del giorno dell'esecuzione**, euro
// dovuti per difetto, riserva −= euro. Vale il giorno dell'esecuzione
// perché è il valore che la riserva copre in quel momento; e siccome il
// valore non scende mai, un'esecuzione tardiva non danneggia mai chi ha
// chiesto: al più gli rende di più.
//
// `conversion.paid` (banca): data del pagamento in euro. È un'affermazione
// firmata, come l'estratto conto: il registro sa che i manti sono stati
// bruciati e che gli euro sono usciti dalla riserva calcolata; che siano
// arrivati sul conto di qualcuno lo dice solo la banca.
//
// La richiesta porta anche un indirizzo di ritorno (chiave una tantum e
// R, come un'uscita): il registro non sa di chi è la richiesta, quindi
// una riga di restituzione potrà creare un'uscita solo verso un indirizzo
// che la richiesta già porta. Il tipo di riga che lo usa arriva dopo; il
// campo c'è da subito perché il formato di una riga nel registro non si
// cambia più.
//
// Chi può chiedere: chiunque. Chi viene pagato: solo chi la banca ha
// identificato, senza multe definitive non saldate. L'anello nasconde da
// quali uscite vengono i manti, quindi il registro non può sapere di chi è
// la richiesta: il controllo è della banca, prima di eseguire, con
// l'anagrafica che sta fuori dal registro. Una richiesta che la banca non
// esegue resta lì: come restituirla è lasciato aperto (sezione 13).
//
// Riservatezza: i dati di pagamento sono cifrati per le coordinate della
// banca, con lo stesso meccanismo delle causali. In chiaro c'è solo
// l'importo. Il registro non collega mai la richiesta a una persona.

import { bilancio, impegnoInChiaro } from './impegni.js';
import { verificaIntervalli, riempi } from './intervallo.js';
import { controllaUsciteRiservate, controllaEntrateInAnello, firmeAnello } from './trasferimento.js';
import { registraUscita, preparaStato } from './uscite.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { formaCausaleValida, decifraCausale } from './causale.js';
import { chiaveCausale, riconosci } from './portafoglio.js';
import { centesimi, valore, prezzoConversione, euroPerManti, controllaCopertura } from './banca.js';

const RE_HEX64 = /^[0-9a-f]{64}$/;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** @param {unknown} hex */
function puntoBuono(hex) {
  if (typeof hex !== 'string' || !RE_HEX64.test(hex)) return false;
  try {
    const P = ed25519.Point.fromHex(hex, false);
    return P.toHex() === hex && P.isTorsionFree();
  } catch {
    return false;
  }
}

/** Lancia se il body ha campi oltre quelli ammessi. */
function soloCampi(b, ammessi, tipo) {
  const extra = Object.keys(b).filter((k) => !ammessi.includes(k));
  if (extra.length) throw new Error(`${tipo}: campi sconosciuti ${extra.join(', ')}`);
}

/**
 * `conversion.request`.
 * @type {import('./registro.js').RegolaTipo}
 */
export function regolaConversionRequest(riga, stato) {
  const b = /** @type {any} */ (riga.body);
  soloCampi(b, ['in', 'amount', 'out', 'proof', 'dati', 'ritorno'], 'conversion.request');
  if (!b.ritorno || typeof b.ritorno !== 'object') throw new Error('conversion.request: indirizzo di ritorno mancante');
  soloCampi(b.ritorno, ['addr', 'eph'], 'conversion.request: ritorno');
  if (!puntoBuono(b.ritorno.addr) || !puntoBuono(b.ritorno.eph)) throw new Error('conversion.request: indirizzo di ritorno non valido');
  preparaStato(stato);
  if (!Number.isInteger(b.amount) || b.amount <= 0) throw new Error('conversion.request: importo non valido');
  if (!Array.isArray(b.out) || b.out.length !== 1) throw new Error('conversion.request: esattamente un resto riservato, anche da zero');
  const resto = controllaUsciteRiservate(b.out);
  if (!b.dati || typeof b.dati !== 'object') throw new Error('conversion.request: dati mancanti');
  soloCampi(b.dati, ['addr', 'eph', 'memo'], 'conversion.request: dati');
  if (typeof b.dati.addr !== 'string' || !RE_HEX64.test(b.dati.addr) || typeof b.dati.eph !== 'string' || !RE_HEX64.test(b.dati.eph)) {
    throw new Error('conversion.request: dati senza indirizzo per la banca');
  }
  if (!formaCausaleValida(b.dati.memo)) throw new Error('conversion.request: dati cifrati malformati');

  const entrate = controllaEntrateInAnello(stato, b.in);
  // bilancio: Σ pseudo = amount·H + C_resto. L'importo pubblico entra come uscita in chiaro.
  if (!bilancio({ pseudo: entrate.map((e) => e.pseudo), uscite: resto.map((u) => u.commit), usciteChiare: [b.amount] })) {
    throw new Error('conversion.request: il bilancio degli impegni non torna');
  }
  // la prova copre solo il resto: l'importo in chiaro non ne ha bisogno
  if (!verificaIntervalli(riempi(resto.map((u) => u.commit)), b.proof)) {
    throw new Error('conversion.request: prova di intervallo non valida');
  }
  const img = firmeAnello(riga, stato, entrate);
  for (const [i, u] of resto.entries()) {
    registraUscita(stato, `${riga.hash}:${i}`, { addr: u.addr, commit: u.commit, amount: null });
  }
  stato.conversioni ??= {};
  stato.conversioni[riga.hash] = { amount: b.amount, stato: 'richiesta', seq: riga.seq, ritorno: { addr: b.ritorno.addr, eph: b.ritorno.eph } };
  return { by: [], img };
}

/**
 * `conversion.execute`.
 * @type {import('./registro.js').RegolaTipo}
 */
export function regolaConversionExecute(riga, stato) {
  const b = /** @type {any} */ (riga.body);
  soloCampi(b, ['richiesta', 'prezzo', 'euro_cent'], 'conversion.execute');
  preparaStato(stato);
  if (typeof b.richiesta !== 'string' || !RE_HEX64.test(b.richiesta)) throw new Error('conversion.execute: riferimento alla richiesta mancante');
  const c = stato.conversioni?.[b.richiesta];
  if (!c) throw new Error('conversion.execute: richiesta inesistente');
  if (c.stato !== 'richiesta') throw new Error(`conversion.execute: richiesta già ${c.stato}`);
  const valorePrima = valore(stato);
  const prezzo = prezzoConversione(stato);
  if (prezzo === null) throw new Error('conversion.execute: nessun valore');
  if (centesimi(b.prezzo, 'conversion.execute: prezzo') !== prezzo) throw new Error(`conversion.execute: prezzo ${b.prezzo}, oggi vale ${prezzo}`);
  const euro = euroPerManti(BigInt(c.amount), prezzo);
  if (centesimi(b.euro_cent, 'conversion.execute: euro_cent') !== euro) throw new Error(`conversion.execute: euro ${b.euro_cent}, dovuti ${euro}`);
  stato.bruciati_cent += BigInt(c.amount);
  stato.circolazione_cent -= BigInt(c.amount);
  stato.riserva_cent -= euro;
  stato.convertiti_cent = (stato.convertiti_cent ?? 0n) + BigInt(c.amount);
  stato.restituiti_cent = (stato.restituiti_cent ?? 0n) + euro;
  Object.assign(c, { stato: 'eseguita', prezzo, euro_cent: euro, esecuzione: riga.hash });
  controllaCopertura(stato, valorePrima);
  return [stato.genesi.banca.chiave];
}

/**
 * `conversion.paid`: la banca attesta di aver pagato. Una per esecuzione.
 * @type {import('./registro.js').RegolaTipo}
 */
export function regolaConversionPaid(riga, stato) {
  const b = /** @type {any} */ (riga.body);
  soloCampi(b, ['richiesta', 'data'], 'conversion.paid');
  if (typeof b.richiesta !== 'string' || !RE_HEX64.test(b.richiesta)) throw new Error('conversion.paid: riferimento alla richiesta mancante');
  const c = stato.conversioni?.[b.richiesta];
  if (!c) throw new Error('conversion.paid: richiesta inesistente');
  if (c.stato !== 'eseguita') throw new Error(`conversion.paid: richiesta ${c.stato}, non eseguita`);
  if (typeof b.data !== 'string' || !RE_DATA.test(b.data)) throw new Error('conversion.paid: data non valida');
  Object.assign(c, { stato: 'pagata', pagata: b.data });
  return [stato.genesi.banca.chiave];
}

/**
 * Lato banca: apre i dati di pagamento di una richiesta con il proprio
 * portafoglio. Null se non sono per questa banca o sono manomessi.
 * @param {{ addr: string, eph: string, memo: string }} dati
 * @param {import('./portafoglio.js').Portafoglio} portafoglioBanca
 * @returns {string | null}
 */
export function apriDatiConversione(dati, portafoglioBanca) {
  const r = riconosci(dati, portafoglioBanca);
  if (!r) return null;
  return decifraCausale(chiaveCausale(r.k), dati.memo);
}

/** Le regole delle conversioni, pronte per il registro. */
export const tipiConversione = {
  'conversion.request': regolaConversionRequest,
  'conversion.execute': regolaConversionExecute,
  'conversion.paid': regolaConversionPaid,
};
