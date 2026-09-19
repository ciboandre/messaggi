// Le aziende: registrazione, polizia, catalogo, tariffario, stipendi e premi.
//
// REGOLE_MONETA.md sezioni 9 e 10; ARCHITETTURA.md sezione 8. Tutto in
// chiaro: un'azienda è un ruolo, paga con importi visibili verso indirizzi
// usa e getta dei dipendenti. Chi guarda vede che l'azienda ha pagato
// dieci stipendi da tanto, non a chi.
//
// Nessun calcolo di percentuali qui: catalogo e tariffario portano importi
// interi decisi da chi li firma, e il registro li confronta, non li
// deriva. Le trattenute sono verbali definitivi non saldati di dipendenti
// dell'azienda, pagati dall'azienda al posto loro con la stessa coppia di
// uscite di una multa pagata (multe.js): metà bruciata, metà alla
// polizia. Il registro non sa chi è dipendente di chi: controlla che il
// verbale sia dell'azienda che firma.
//
// `payout` è firmato due volte: dalla chiave dell'azienda, che dice quale
// catalogo vale, e dalle chiavi delle entrate consumate, che autorizzano
// la spesa. Le entrate sono in chiaro o rivelate (uscite.js).
//
// Stato:
//   aziende: { chiave → { nome, coordinate, polizia, catalogo, tariffario, pagati_cent } }

import { controllaUscite, creaUscite, sommaUscite, consumaEntrate, preparaStato } from './uscite.js';
import { decodificaCoordinate } from './portafoglio.js';
import { saldaVerbale } from './multe.js';

const RE_HEX64 = /^[0-9a-f]{64}$/;
const RE_CODICE = /^[a-z0-9][a-z0-9-]{0,31}$/;
export const NOME_MAX = 64;
export const VOCI_MAX = 200;

/** Lancia se il body ha campi oltre quelli ammessi. */
function soloCampi(b, ammessi, tipo) {
  const extra = Object.keys(b).filter((k) => !ammessi.includes(k));
  if (extra.length) throw new Error(`${tipo}: campi sconosciuti ${extra.join(', ')}`);
}

/** @param {unknown} c @param {string} dove */
function coordinateValide(c, dove) {
  try {
    decodificaCoordinate(c);
  } catch (e) {
    throw new Error(`${dove}: coordinate non valide (${/** @type {Error} */ (e).message})`);
  }
}

/**
 * L'azienda nominata nel body, che deve esistere.
 * @param {Record<string, any>} stato @param {any} b @param {string} tipo
 */
function aziendaDi(stato, b, tipo) {
  if (typeof b.azienda !== 'string' || !RE_HEX64.test(b.azienda)) throw new Error(`${tipo}: azienda mancante`);
  const az = stato.aziende?.[b.azienda];
  if (!az) throw new Error(`${tipo}: azienda sconosciuta ${b.azienda.slice(0, 8)}`);
  return az;
}

/**
 * Controlla un catalogo o un tariffario: voci con codice unico, nome,
 * importo intero positivo. Restituisce { codice → { nome, amount } }.
 * @param {unknown} voci @param {string} tipo
 */
export function controllaVoci(voci, tipo) {
  if (!Array.isArray(voci)) throw new Error(`${tipo}: voci mancanti`);
  if (voci.length > VOCI_MAX) throw new Error(`${tipo}: al massimo ${VOCI_MAX} voci`);
  /** @type {Record<string, { nome: string, amount: number }>} */
  const mappa = {};
  for (const [i, v] of voci.entries()) {
    const dove = `${tipo}: voce ${i}`;
    if (!v || typeof v !== 'object') throw new Error(`${dove} malformata`);
    soloCampi(v, ['codice', 'nome', 'amount'], dove);
    if (typeof v.codice !== 'string' || !RE_CODICE.test(v.codice)) throw new Error(`${dove}: codice non valido`);
    if (mappa[v.codice]) throw new Error(`${dove}: codice ripetuto ${v.codice}`);
    if (typeof v.nome !== 'string' || !v.nome.trim() || v.nome.length > NOME_MAX) throw new Error(`${dove}: nome non valido`);
    if (!Number.isInteger(v.amount) || v.amount <= 0) throw new Error(`${dove}: importo non valido`);
    mappa[v.codice] = { nome: v.nome, amount: v.amount };
  }
  return mappa;
}

/**
 * `company.register`: la banca registra un'azienda. Una volta per chiave.
 * @type {import('./registro.js').RegolaTipo}
 */
export function regolaCompanyRegister(riga, stato) {
  const b = /** @type {any} */ (riga.body);
  soloCampi(b, ['chiave', 'coordinate', 'nome'], 'company.register');
  if (typeof b.chiave !== 'string' || !RE_HEX64.test(b.chiave)) throw new Error('company.register: chiave non valida');
  if (b.chiave === stato.genesi.banca.chiave) throw new Error('company.register: la chiave della banca non può essere un\'azienda');
  stato.aziende ??= {};
  if (stato.aziende[b.chiave]) throw new Error('company.register: azienda già registrata');
  coordinateValide(b.coordinate, 'company.register');
  if (typeof b.nome !== 'string' || !b.nome.trim() || b.nome.length > NOME_MAX) throw new Error('company.register: nome non valido');
  stato.aziende[b.chiave] = { nome: b.nome, coordinate: b.coordinate, polizia: null, catalogo: {}, tariffario: {}, pagati_cent: 0n };
  return [stato.genesi.banca.chiave];
}

/**
 * `police.appoint`: l'azienda nomina la propria polizia. Sostituisce la precedente.
 * @type {import('./registro.js').RegolaTipo}
 */
export function regolaPoliceAppoint(riga, stato) {
  const b = /** @type {any} */ (riga.body);
  soloCampi(b, ['azienda', 'chiave', 'coordinate'], 'police.appoint');
  const az = aziendaDi(stato, b, 'police.appoint');
  if (typeof b.chiave !== 'string' || !RE_HEX64.test(b.chiave)) throw new Error('police.appoint: chiave non valida');
  if (b.chiave === b.azienda || b.chiave === stato.genesi.banca.chiave) throw new Error('police.appoint: la polizia ha una chiave propria');
  coordinateValide(b.coordinate, 'police.appoint');
  az.polizia = { chiave: b.chiave, coordinate: b.coordinate };
  return [b.azienda];
}

/**
 * `catalog.set`: il catalogo completo dei premi. Sostituisce il precedente.
 * @type {import('./registro.js').RegolaTipo}
 */
export function regolaCatalogSet(riga, stato) {
  const b = /** @type {any} */ (riga.body);
  soloCampi(b, ['azienda', 'voci'], 'catalog.set');
  const az = aziendaDi(stato, b, 'catalog.set');
  az.catalogo = controllaVoci(b.voci, 'catalog.set');
  return [b.azienda];
}

/**
 * `tariff.set`: il tariffario completo delle multe. Sostituisce il precedente.
 * @type {import('./registro.js').RegolaTipo}
 */
export function regolaTariffSet(riga, stato) {
  const b = /** @type {any} */ (riga.body);
  soloCampi(b, ['azienda', 'voci'], 'tariff.set');
  const az = aziendaDi(stato, b, 'tariff.set');
  az.tariffario = controllaVoci(b.voci, 'tariff.set');
  return [b.azienda];
}

/**
 * `payout`: stipendi e premi dal conto dell'azienda. Uscite in chiaro,
 * ognuna con un tag: "stipendio" (tutti dello stesso importo nella riga),
 * "premio" con la voce del catalogo in vigore e il suo importo, oppure
 * "resto" (al massimo una, all'azienda). Con `trattenute` (id di
 * verbali), anche le coppie bruciatura + metà alla polizia di ciascuno.
 * @type {import('./registro.js').RegolaTipo}
 */
export function regolaPayout(riga, stato) {
  const b = /** @type {any} */ (riga.body);
  soloCampi(b, ['azienda', 'in', 'out', 'trattenute'], 'payout');
  preparaStato(stato);
  const az = aziendaDi(stato, b, 'payout');
  const trattenute = b.trattenute ?? [];
  if (!Array.isArray(trattenute) || new Set(trattenute).size !== trattenute.length) throw new Error('payout: trattenute malformate o ripetute');
  const out = controllaUscite(b.out, { tagAmmessi: true, voceAmmessa: true, multeAmmesse: true });
  let stipendio = null;
  let resti = 0;
  let pagati = 0;
  for (const [i, u] of out.entries()) {
    const dove = `payout: uscita ${i}`;
    if (u.addr === null) {
      if (!trattenute.includes(u.reason?.replace(/^multa:/, ''))) throw new Error(`${dove}: bruciatura fuori dalle trattenute`);
      continue;
    }
    if (u.tag === 'multa') {
      if (!trattenute.includes(u.ref)) throw new Error(`${dove}: metà alla polizia fuori dalle trattenute`);
      continue;
    }
    switch (u.tag) {
      case 'stipendio':
        if (u.voce !== undefined) throw new Error(`${dove}: voce solo sui premi`);
        if (stipendio === null) stipendio = u.amount;
        else if (u.amount !== stipendio) throw new Error(`${dove}: gli stipendi di una riga sono tutti uguali (${u.amount} ≠ ${stipendio})`);
        pagati += u.amount;
        break;
      case 'premio': {
        if (u.voce === undefined) throw new Error(`${dove}: premio senza voce`);
        const voce = az.catalogo[u.voce];
        if (!voce) throw new Error(`${dove}: voce ${u.voce} non in catalogo`);
        if (u.amount !== voce.amount) throw new Error(`${dove}: premio ${u.voce} da ${u.amount}, il catalogo dice ${voce.amount}`);
        pagati += u.amount;
        break;
      }
      case 'resto':
        if (u.voce !== undefined) throw new Error(`${dove}: voce solo sui premi`);
        if (++resti > 1) throw new Error(`${dove}: un solo resto per riga`);
        break;
      default:
        throw new Error(`${dove}: tag "${u.tag}" non ammesso nel payout`);
    }
  }
  for (const id of trattenute) pagati += saldaVerbale(stato, id, out, { azienda: b.azienda, come: 'trattenuto' });
  if (pagati === 0) throw new Error('payout: niente stipendi né premi');
  const { totale, firmatari, immagini } = consumaEntrate(stato, b.in, riga);
  if (sommaUscite(out) !== totale) throw new Error(`payout: entrate ${totale} ≠ uscite ${sommaUscite(out)}`);
  creaUscite(stato, riga.hash, out);
  az.pagati_cent += BigInt(pagati);
  return { by: [b.azienda, ...firmatari], img: immagini };
}

/** Le regole delle aziende, pronte per il registro. */
export const tipiAzienda = {
  'company.register': regolaCompanyRegister,
  'police.appoint': regolaPoliceAppoint,
  'catalog.set': regolaCatalogSet,
  'tariff.set': regolaTariffSet,
  payout: regolaPayout,
};
