// Le righe della banca: vendite, tetto, interessi, estratti. E il valore.
//
// REGOLE_MONETA.md sezioni 4, 5, 6; ARCHITETTURA.md sezioni 4 e 8. Tutto in
// chiaro e tutto su interi BigInt: centesimi di euro, centesimi di manto,
// prezzi in decimillesimi di euro per manto (10000 = 1,0000 €).
//
//   valore            = riserva × 10000 / circolazione        per difetto
//   prezzo_acquisto   = valore × (100 + sovrapprezzo) / 100   per eccesso
//   manti_venduti     = euro × 10000 / prezzo_acquisto        per difetto
//   prezzo_conversione= valore × (100 − commissione) / 100    per difetto
//   euro_dovuti       = manti × prezzo_conversione / 10000    per difetto
//   bruciati_per_multa= importo × quota_bruciata / 100        per difetto
//                       (il centesimo dispari va alla polizia)
//
// Un solo verso per gli arrotondamenti: quello che lascia euro in riserva.
// Le due funzioni `perDifetto` e `perEccesso` sono l'unico posto in cui si
// divide. La prima vendita in assoluto, e ogni vendita a circolazione zero,
// è al prezzo di lancio: 1,00 €.
//
// L'invariante che fa del manto una moneta coperta: dopo ogni riga la
// riserva copre ancora la circolazione al valore di prima,
//   riserva × 10000 ≥ circolazione × valore_prima,
// che, con il valore arrotondato per difetto, è la stessa cosa di "il
// valore non scende mai". Ogni regola di questo file la ricontrolla dopo
// aver cambiato lo stato e lancia se non regge: non è un test, è una
// regola di riga. (Confrontare la riserva con il valore *dopo* non dice
// niente: è vero per costruzione, il valore è riserva / circolazione.)
//
// `day` è il calendario. Il registro non ha un orologio che chiunque possa
// ricontrollare: ha solo le sue righe. La banca apre ogni giorno con una
// riga `day`, e da lì in poi i termini (i 15 giorni delle multe) si contano
// in righe di giorno, non in timestamp. Che il calendario sia giusto lo
// dice la banca con la sua firma: è un punto di fiducia, dichiarato.
//
// `reserve.statement` è un'affermazione, non una prova. Il registro sa fare
// i conti tra le sue righe; non può sapere se gli euro esistono. La riga
// dice che la banca, con la sua firma, dichiara quel saldo a quella data,
// e che coincide con la riserva calcolata oppure spiega perché no. È
// l'unico punto in cui la fiducia entra nel sistema, e sta qui, visibile.

import { controllaUscite, creaUscite, sommaUscite, preparaStato } from './uscite.js';

export const SCALA_PREZZO = 10000n;
export const PREZZO_DI_LANCIO = 10000n; // 1,0000 € per manto
const RE_HEX64 = /^[0-9a-f]{64}$/;
const RE_MESE = /^\d{4}-(0[1-9]|1[0-2])$/;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Divisione tra non negativi, verso il basso. @param {bigint} a @param {bigint} b */
export function perDifetto(a, b) {
  if (a < 0n || b <= 0n) throw new RangeError('divisione: attesi non negativi e divisore positivo');
  return a / b;
}
/** Divisione tra non negativi, verso l'alto. @param {bigint} a @param {bigint} b */
export function perEccesso(a, b) {
  if (a < 0n || b <= 0n) throw new RangeError('divisione: attesi non negativi e divisore positivo');
  return (a + b - 1n) / b;
}

/**
 * Un intero JSON non negativo, come BigInt.
 * @param {unknown} x @param {string} cosa
 */
export function centesimi(x, cosa) {
  if (!Number.isSafeInteger(x) || /** @type {number} */ (x) < 0) throw new Error(`${cosa}: atteso un intero non negativo`);
  return BigInt(/** @type {number} */ (x));
}

/** @param {Record<string, any>} stato */
function parametri(stato) {
  const p = stato.genesi?.parametri;
  if (!p) throw new Error('stato senza genesi');
  return { sovrapprezzo: BigInt(p.sovrapprezzo_pct), commissione: BigInt(p.commissione_pct) };
}

/**
 * Valore ufficiale in decimillesimi di euro per manto; null a circolazione zero.
 * @param {Record<string, any>} stato
 * @returns {bigint | null}
 */
export function valore(stato) {
  preparaStato(stato);
  if (stato.circolazione_cent === 0n) return null;
  return perDifetto((stato.riserva_cent ?? 0n) * SCALA_PREZZO, stato.circolazione_cent);
}

/** @param {Record<string, any>} stato @returns {bigint} */
export function prezzoAcquisto(stato) {
  const v = valore(stato);
  if (v === null) return PREZZO_DI_LANCIO;
  return perEccesso(v * (100n + parametri(stato).sovrapprezzo), 100n);
}

/** @param {Record<string, any>} stato @returns {bigint | null} */
export function prezzoConversione(stato) {
  const v = valore(stato);
  if (v === null) return null;
  return perDifetto(v * (100n - parametri(stato).commissione), 100n);
}

/** Manti (centesimi) che si ottengono con degli euro (centesimi) a un prezzo. */
export function mantiPerEuro(euroCent, prezzo) {
  return perDifetto(euroCent * SCALA_PREZZO, prezzo);
}

/** Euro (centesimi) dovuti per dei manti (centesimi) a un prezzo. */
export function euroPerManti(mantiCent, prezzo) {
  return perDifetto(mantiCent * prezzo, SCALA_PREZZO);
}

/**
 * Quanto di una multa si brucia; il resto va alla polizia.
 * @param {Record<string, any>} stato @param {number} amount
 * @returns {{ bruciati: number, polizia: number }}
 */
export function divisioneMulta(stato, amount) {
  const quota = BigInt(stato.genesi.parametri.multe_bruciate_pct);
  const bruciati = Number(perDifetto(BigInt(amount) * quota, 100n));
  return { bruciati, polizia: amount - bruciati };
}

/** Quanti euro la banca può ancora incassare sotto il tetto. */
export function spazioSottoTetto(stato) {
  const spazio = (stato.tetto_cent ?? 0n) - (stato.riserva_cent ?? 0n);
  return spazio > 0n ? spazio : 0n;
}

/**
 * L'invariante della copertura, da chiamare dopo ogni cambiamento di riserva
 * o circolazione. `valorePrima` è il valore prima della riga (o null).
 * @param {Record<string, any>} stato
 * @param {bigint | null} valorePrima
 */
export function controllaCopertura(stato, valorePrima) {
  if (stato.riserva_cent < 0n) throw new Error('copertura: riserva negativa');
  if (valorePrima === null) return;
  if (stato.riserva_cent * SCALA_PREZZO < stato.circolazione_cent * valorePrima) {
    throw new Error(`copertura: la riserva non copre più la circolazione al valore di prima (${valorePrima} → ${valore(stato)})`);
  }
}

/** @param {Record<string, any>} stato */
const chiaveBanca = (stato) => stato.genesi.banca.chiave;

/** Lancia se il body ha campi oltre quelli ammessi. */
function soloCampi(b, ammessi, tipo) {
  const extra = Object.keys(b).filter((k) => !ammessi.includes(k));
  if (extra.length) throw new Error(`${tipo}: campi sconosciuti ${extra.join(', ')}`);
}

/**
 * `cap.set`: nuovo tetto della riserva, firmato dalla banca.
 * @type {import('./registro.js').RegolaTipo}
 */
export function regolaCapSet(riga, stato) {
  const b = /** @type {any} */ (riga.body);
  soloCampi(b, ['tetto_cent'], 'cap.set');
  stato.tetto_cent = centesimi(b.tetto_cent, 'cap.set: tetto_cent');
  return [chiaveBanca(stato)];
}

/**
 * `sale`: la banca vende manti contro euro ricevuti fuori dal sistema.
 * Riserva sotto il tetto prima della vendita; prezzo uguale a quello del
 * giorno; manti = euro / prezzo; uscite in chiaro verso l'acquirente, tutte
 * con tag "vendita"; riserva += euro.
 * @type {import('./registro.js').RegolaTipo}
 */
export function regolaSale(riga, stato) {
  const b = /** @type {any} */ (riga.body);
  soloCampi(b, ['euro_cent', 'prezzo', 'out', 'pagamento'], 'sale');
  preparaStato(stato);
  const valorePrima = valore(stato);
  if (stato.riserva_cent >= stato.tetto_cent) throw new Error('sale: riserva al tetto, la banca non vende');
  const euro = centesimi(b.euro_cent, 'sale: euro_cent');
  if (euro === 0n) throw new Error('sale: euro_cent deve essere positivo');
  const prezzo = centesimi(b.prezzo, 'sale: prezzo');
  const atteso = prezzoAcquisto(stato);
  if (prezzo !== atteso) throw new Error(`sale: prezzo ${prezzo}, atteso ${atteso}`);
  if (typeof b.pagamento !== 'string' || !b.pagamento || b.pagamento.length > 128) throw new Error('sale: riferimento al pagamento mancante');
  const out = controllaUscite(b.out, { tagAmmessi: true });
  for (const [i, u] of out.entries()) {
    if (u.addr === null) throw new Error(`sale: uscita ${i} è una bruciatura`);
    if (u.tag !== 'vendita') throw new Error(`sale: uscita ${i} senza tag "vendita"`);
  }
  const manti = mantiPerEuro(euro, prezzo);
  if (manti === 0n) throw new Error('sale: euro insufficienti per un centesimo di manto');
  if (BigInt(sommaUscite(out)) !== manti) throw new Error(`sale: uscite per ${sommaUscite(out)}, dovuti ${manti}`);
  stato.riserva_cent += euro;
  creaUscite(stato, riga.hash, out, { nuovi: true });
  stato.venduti_cent = (stato.venduti_cent ?? 0n) + manti;
  stato.incassati_cent = (stato.incassati_cent ?? 0n) + euro;
  controllaCopertura(stato, valorePrima);
  return [chiaveBanca(stato)];
}

/**
 * `reserve.interest`: interessi maturati sul conto della riserva.
 * @type {import('./registro.js').RegolaTipo}
 */
export function regolaInteressi(riga, stato) {
  const b = /** @type {any} */ (riga.body);
  soloCampi(b, ['euro_cent', 'da', 'a'], 'reserve.interest');
  preparaStato(stato);
  const valorePrima = valore(stato);
  const euro = centesimi(b.euro_cent, 'reserve.interest: euro_cent');
  if (euro === 0n) throw new Error('reserve.interest: euro_cent deve essere positivo');
  if (typeof b.da !== 'string' || !RE_DATA.test(b.da) || typeof b.a !== 'string' || !RE_DATA.test(b.a) || b.a < b.da) {
    throw new Error('reserve.interest: periodo non valido');
  }
  stato.riserva_cent += euro;
  stato.interessi_cent = (stato.interessi_cent ?? 0n) + euro;
  controllaCopertura(stato, valorePrima);
  return [chiaveBanca(stato)];
}

/**
 * `reserve.statement`: la banca dichiara il saldo dell'estratto conto di un
 * mese, con l'hash del documento pubblicato. Se il saldo non coincide con
 * la riserva calcolata, la riga deve spiegare perché. Un estratto per mese.
 * È un'affermazione firmata: il registro non può verificarla.
 * @type {import('./registro.js').RegolaTipo}
 */
export function regolaEstratto(riga, stato) {
  const b = /** @type {any} */ (riga.body);
  soloCampi(b, ['mese', 'saldo_cent', 'documento', 'nota'], 'reserve.statement');
  preparaStato(stato);
  if (typeof b.mese !== 'string' || !RE_MESE.test(b.mese)) throw new Error('reserve.statement: mese non valido');
  stato.estratti ??= {};
  if (stato.estratti[b.mese]) throw new Error(`reserve.statement: estratto di ${b.mese} già registrato`);
  const saldo = centesimi(b.saldo_cent, 'reserve.statement: saldo_cent');
  if (typeof b.documento !== 'string' || !RE_HEX64.test(b.documento)) throw new Error('reserve.statement: hash del documento mancante');
  const coincide = saldo === stato.riserva_cent;
  if (!coincide && (typeof b.nota !== 'string' || !b.nota.trim() || b.nota.length > 500)) {
    throw new Error(`reserve.statement: saldo ${saldo} ≠ riserva ${stato.riserva_cent}, serve una nota`);
  }
  if (coincide && b.nota !== undefined) throw new Error('reserve.statement: nota solo se il saldo non coincide');
  stato.estratti[b.mese] = { saldo_cent: saldo, riserva_cent: stato.riserva_cent, documento: b.documento, ...(coincide ? {} : { nota: b.nota }) };
  return [chiaveBanca(stato)];
}

/**
 * `day`: la banca apre un giorno. Date crescenti; le righe di quel giorno
 * non possono avere un ts precedente. `stato.giorno` è la data, `n_giorni`
 * quante righe di giorno ci sono state: i termini si misurano su questo.
 * @type {import('./registro.js').RegolaTipo}
 */
export function regolaGiorno(riga, stato) {
  const b = /** @type {any} */ (riga.body);
  soloCampi(b, ['data'], 'day');
  if (typeof b.data !== 'string' || !RE_DATA.test(b.data) || Number.isNaN(Date.parse(b.data))) throw new Error('day: data non valida');
  if (stato.giorno && b.data <= stato.giorno) throw new Error(`day: ${b.data} non è dopo ${stato.giorno}`);
  if (riga.ts.slice(0, 10) < b.data) throw new Error(`day: la riga è datata ${riga.ts.slice(0, 10)}, prima del giorno che apre`);
  stato.giorno = b.data;
  stato.n_giorni = (stato.n_giorni ?? 0) + 1;
  return [chiaveBanca(stato)];
}

/** Le regole della banca, pronte per il registro. */
export const tipiBanca = {
  day: regolaGiorno,
  'cap.set': regolaCapSet,
  sale: regolaSale,
  'reserve.interest': regolaInteressi,
  'reserve.statement': regolaEstratto,
};
