// Multe: verbali, pagamento, contestazioni, repliche, sentenze.
//
// REGOLE_MONETA.md sezioni 10 e 11; ARCHITETTURA.md sezioni 8 e 10.
//
// La polizia di un'azienda emette un verbale da tariffario verso un
// indirizzo di consegna (usa e getta, del dipendente: solo lui lo
// riconosce). Il multato paga con un `transfer` che porta `ref` al verbale
// e due uscite in chiaro: la metà bruciata e la metà alla polizia. La
// metà alla polizia porta lo scalare r del suo indirizzo, così chiunque
// ricalcola l'indirizzo dalle coordinate della polizia e vede che i manti
// sono andati davvero lì. Oppure contesta, firmando con la chiave
// dell'indirizzo di consegna: la polizia replica, il giudice decide.
// Un verbale non pagato né contestato entro il termine, o confermato dal
// giudice e non pagato, è definitivo non saldato: l'azienda lo trattiene
// dallo stipendio con la stessa coppia di uscite dentro un `payout`.
//
// Il tempo si misura in righe di giorno (banca.js): il verbale ricorda in
// quale giorno è nato, e "entro 15 giorni" vuol dire che tra allora e ora
// sono passate al più 15 righe `day`. Nessun timestamp entra nei termini.
//
// Stato:
//   giudice: { chiave, versione }
//   verbali: { "azienda:numero" → { azienda, numero, voce, amount, giorno, data, consegna,
//              stato: aperto | pagato | contestato | annullato | confermato, … } }

import { indirizzoDaR } from './portafoglio.js';
import { formaCausaleValida } from './causale.js';
import { divisioneMulta } from './banca.js';
import { verifica } from './chiavi.js';

const RE_HEX64 = /^[0-9a-f]{64}$/;
const RE_NUMERO = /^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/;
export const MOTIVAZIONE_MAX = 2000;
export const GIORNI_PER_SENTENZA_SENZA_REPLICA = 3;

function soloCampi(b, ammessi, tipo) {
  const extra = Object.keys(b).filter((k) => !ammessi.includes(k));
  if (extra.length) throw new Error(`${tipo}: campi sconosciuti ${extra.join(', ')}`);
}

/** Un testo cifrato per qualcuno: indirizzo usa e getta e memo. */
function testoCifrato(x, dove) {
  if (!x || typeof x !== 'object') throw new Error(`${dove}: manca`);
  soloCampi(x, ['addr', 'eph', 'memo'], dove);
  if (typeof x.addr !== 'string' || !RE_HEX64.test(x.addr) || typeof x.eph !== 'string' || !RE_HEX64.test(x.eph)) throw new Error(`${dove}: indirizzo non valido`);
  if (!formaCausaleValida(x.memo)) throw new Error(`${dove}: testo cifrato malformato`);
  return { addr: x.addr, eph: x.eph, memo: x.memo };
}

/** @param {Record<string, any>} stato @param {string} id @param {string} tipo */
function verbaleDi(stato, id, tipo) {
  if (typeof id !== 'string') throw new Error(`${tipo}: verbale mancante`);
  const v = stato.verbali?.[id];
  if (!v) throw new Error(`${tipo}: verbale sconosciuto ${id}`);
  return v;
}

/** Giorni di registro passati dal giorno `giorno`. */
const giorniDa = (stato, giorno) => (stato.n_giorni ?? 0) - giorno;

/**
 * Definitivo non saldato: scaduto senza contestazione né pagamento, o
 * confermato dal giudice e non pagato.
 * @param {Record<string, any>} stato @param {any} v
 */
export function definitivoNonSaldato(stato, v) {
  const termine = stato.genesi.parametri.giorni_multa;
  return (v.stato === 'aperto' && giorniDa(stato, v.giorno) > termine) || v.stato === 'confermato';
}

/** Un verbale che si può ancora pagare: aperto (anche scaduto) o confermato. */
const saldabile = (v) => v.stato === 'aperto' || v.stato === 'confermato';

/**
 * `judge.register`: la banca registra il giudice, con la versione delle
 * istruzioni. Sostituisce il precedente.
 * @type {import('./registro.js').RegolaTipo}
 */
export function regolaJudgeRegister(riga, stato) {
  const b = /** @type {any} */ (riga.body);
  soloCampi(b, ['chiave', 'versione'], 'judge.register');
  if (typeof b.chiave !== 'string' || !RE_HEX64.test(b.chiave)) throw new Error('judge.register: chiave non valida');
  if (b.chiave === stato.genesi.banca.chiave) throw new Error('judge.register: il giudice ha una chiave propria');
  if (typeof b.versione !== 'string' || !b.versione.trim() || b.versione.length > 64) throw new Error('judge.register: versione mancante');
  stato.giudice = { chiave: b.chiave, versione: b.versione };
  return [stato.genesi.banca.chiave];
}

/**
 * `fine.issue`: la polizia di un'azienda emette un verbale da tariffario.
 * Serve un giorno aperto: il verbale nasce in quel giorno.
 * @type {import('./registro.js').RegolaTipo}
 */
export function regolaFineIssue(riga, stato) {
  const b = /** @type {any} */ (riga.body);
  soloCampi(b, ['azienda', 'numero', 'voce', 'amount', 'consegna'], 'fine.issue');
  if (!stato.giorno) throw new Error('fine.issue: nessun giorno aperto');
  const az = stato.aziende?.[b.azienda];
  if (!az) throw new Error('fine.issue: azienda sconosciuta');
  if (!az.polizia) throw new Error('fine.issue: l\'azienda non ha una polizia');
  if (typeof b.numero !== 'string' || !RE_NUMERO.test(b.numero)) throw new Error('fine.issue: numero del verbale non valido');
  const id = `${b.azienda}:${b.numero}`;
  stato.verbali ??= {};
  if (stato.verbali[id]) throw new Error(`fine.issue: verbale ${b.numero} già emesso`);
  const voce = az.tariffario[b.voce];
  if (!voce) throw new Error(`fine.issue: voce ${b.voce} non in tariffario`);
  if (b.amount !== voce.amount) throw new Error(`fine.issue: importo ${b.amount}, il tariffario dice ${voce.amount}`);
  const consegna = testoCifrato(b.consegna, 'fine.issue: consegna');
  stato.verbali[id] = {
    azienda: b.azienda, numero: b.numero, voce: b.voce, amount: b.amount,
    giorno: stato.n_giorni, data: stato.giorno, consegna, stato: 'aperto',
  };
  return [az.polizia.chiave];
}

/**
 * Le due uscite in chiaro che saldano un verbale: la metà bruciata con
 * reason "multa:id", la metà alla polizia con tag "multa", ref e r.
 * Controlla che ci siano, che gli importi siano quelli, che l'indirizzo
 * sia davvero della polizia dell'azienda. Segna il verbale pagato.
 * @param {Record<string, any>} stato
 * @param {string} id
 * @param {import('./uscite.js').Uscita[]} chiare   tutte le uscite in chiaro della riga
 * @param {{ azienda?: string, come: string }} opz   `azienda`: solo verbali di quella; `come`: "pagato" o "trattenuto"
 * @returns {number} l'importo saldato
 */
export function saldaVerbale(stato, id, chiare, opz) {
  const v = verbaleDi(stato, id, 'multa');
  if (opz.azienda && v.azienda !== opz.azienda) throw new Error(`multa: il verbale ${v.numero} non è di questa azienda`);
  if (!saldabile(v)) throw new Error(`multa: verbale ${v.numero} ${v.stato}, non si paga`);
  if (opz.come === 'trattenuto' && !definitivoNonSaldato(stato, v)) throw new Error(`multa: verbale ${v.numero} non ancora definitivo, non si trattiene`);
  const { bruciati, polizia } = divisioneMulta(stato, v.amount);
  const bruciatura = chiare.filter((u) => u.addr === null && u.reason === `multa:${id}`);
  const allaPolizia = chiare.filter((u) => u.addr !== null && u.ref === id);
  if (bruciatura.length !== 1 || allaPolizia.length !== 1) throw new Error(`multa: per il verbale ${v.numero} servono una bruciatura e una metà alla polizia`);
  if (bruciatura[0].amount !== bruciati) throw new Error(`multa: bruciatura ${bruciatura[0].amount}, dovuta ${bruciati}`);
  if (allaPolizia[0].amount !== polizia) throw new Error(`multa: alla polizia ${allaPolizia[0].amount}, dovuti ${polizia}`);
  const pol = stato.aziende[v.azienda].polizia;
  const atteso = indirizzoDaR(pol.coordinate, allaPolizia[0].r);
  if (!atteso || atteso.addr !== allaPolizia[0].addr || atteso.eph !== allaPolizia[0].eph) {
    throw new Error(`multa: la metà del verbale ${v.numero} non va alla polizia dell'azienda`);
  }
  Object.assign(v, { stato: 'pagato', come: opz.come, saldato_giorno: stato.n_giorni ?? 0 });
  return v.amount;
}

/**
 * `fine.withdraw`: la polizia ritira un verbale ancora aperto (sbagliato
 * nei fatti: persona, voce, giorno). Non è una correzione della banca: è
 * un atto del ruolo che l'ha emesso, con motivazione pubblica.
 * @type {import('./registro.js').RegolaTipo}
 */
export function regolaFineWithdraw(riga, stato) {
  const b = /** @type {any} */ (riga.body);
  soloCampi(b, ['verbale', 'motivazione'], 'fine.withdraw');
  const v = verbaleDi(stato, b.verbale, 'fine.withdraw');
  if (v.stato !== 'aperto') throw new Error(`fine.withdraw: verbale ${v.numero} ${v.stato}, si ritira solo se aperto`);
  if (typeof b.motivazione !== 'string' || !b.motivazione.trim() || b.motivazione.length > MOTIVAZIONE_MAX) throw new Error('fine.withdraw: motivazione mancante');
  Object.assign(v, { stato: 'ritirato', ritiro: { motivazione: b.motivazione, giorno: stato.n_giorni ?? 0 } });
  return [stato.aziende[v.azienda].polizia.chiave];
}

/**
 * `fine.contest`: il multato contesta entro il termine, firmando con la
 * chiave dell'indirizzo di consegna. Testo cifrato per giudice e polizia.
 * @type {import('./registro.js').RegolaTipo}
 */
export function regolaFineContest(riga, stato) {
  const b = /** @type {any} */ (riga.body);
  soloCampi(b, ['verbale', 'giudice', 'polizia'], 'fine.contest');
  const v = verbaleDi(stato, b.verbale, 'fine.contest');
  if (v.stato !== 'aperto') throw new Error(`fine.contest: verbale ${v.numero} ${v.stato}`);
  if (giorniDa(stato, v.giorno) > stato.genesi.parametri.giorni_multa) throw new Error(`fine.contest: termine scaduto per il verbale ${v.numero}`);
  if (!stato.giudice) throw new Error('fine.contest: nessun giudice registrato');
  const giudice = testoCifrato(b.giudice, 'fine.contest: giudice');
  const polizia = testoCifrato(b.polizia, 'fine.contest: polizia');
  Object.assign(v, { stato: 'contestato', contestato_giorno: stato.n_giorni ?? 0, contestazione: { giudice, polizia }, replica: null });
  return [v.consegna.addr];
}

/**
 * `fine.reply`: la polizia replica una volta, per il giudice.
 * @type {import('./registro.js').RegolaTipo}
 */
export function regolaFineReply(riga, stato) {
  const b = /** @type {any} */ (riga.body);
  soloCampi(b, ['verbale', 'giudice'], 'fine.reply');
  const v = verbaleDi(stato, b.verbale, 'fine.reply');
  if (v.stato !== 'contestato') throw new Error(`fine.reply: verbale ${v.numero} ${v.stato}, non contestato`);
  if (v.replica) throw new Error(`fine.reply: replica già data per il verbale ${v.numero}`);
  v.replica = testoCifrato(b.giudice, 'fine.reply: giudice');
  return [stato.aziende[v.azienda].polizia.chiave];
}

/**
 * `verdict`: il giudice decide, dopo la replica o dopo 3 giorni senza.
 * Esito annullata o confermata, motivazione pubblica, hash del fascicolo,
 * versione delle istruzioni uguale a quella registrata.
 * @type {import('./registro.js').RegolaTipo}
 */
export function regolaVerdict(riga, stato) {
  const b = /** @type {any} */ (riga.body);
  soloCampi(b, ['verbale', 'esito', 'motivazione', 'fascicolo', 'versione'], 'verdict');
  if (!stato.giudice) throw new Error('verdict: nessun giudice registrato');
  const v = verbaleDi(stato, b.verbale, 'verdict');
  if (v.stato !== 'contestato') throw new Error(`verdict: verbale ${v.numero} ${v.stato}, non contestato`);
  if (!v.replica && giorniDa(stato, v.contestato_giorno) < GIORNI_PER_SENTENZA_SENZA_REPLICA) {
    throw new Error(`verdict: senza replica servono ${GIORNI_PER_SENTENZA_SENZA_REPLICA} giorni dalla contestazione`);
  }
  if (b.esito !== 'annullata' && b.esito !== 'confermata') throw new Error('verdict: esito ammesso: annullata o confermata');
  if (typeof b.motivazione !== 'string' || !b.motivazione.trim() || b.motivazione.length > MOTIVAZIONE_MAX) throw new Error('verdict: motivazione mancante');
  if (typeof b.fascicolo !== 'string' || !RE_HEX64.test(b.fascicolo)) throw new Error('verdict: hash del fascicolo mancante');
  if (b.versione !== stato.giudice.versione) throw new Error(`verdict: istruzioni ${b.versione}, registrate ${stato.giudice.versione}`);
  Object.assign(v, {
    stato: b.esito === 'annullata' ? 'annullato' : 'confermato',
    sentenza: { esito: b.esito, motivazione: b.motivazione, fascicolo: b.fascicolo, versione: b.versione, giorno: stato.n_giorni ?? 0 },
  });
  return [stato.giudice.chiave];
}

/** Le regole delle multe, pronte per il registro. */
export const tipiMulte = {
  'judge.register': regolaJudgeRegister,
  'fine.issue': regolaFineIssue,
  'fine.withdraw': regolaFineWithdraw,
  'fine.contest': regolaFineContest,
  'fine.reply': regolaFineReply,
  verdict: regolaVerdict,
};
