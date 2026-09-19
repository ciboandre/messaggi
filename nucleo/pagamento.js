// Lato portafoglio: trovare le proprie entrate nel registro e costruire un
// pagamento. È il codice che girerà nell'app; il registro non lo usa.
//
// Due modi di pagare. `costruisciPagamento` spende in chiaro: entrate
// dichiarate, importi visibili, firma Ed25519 per indirizzo; è quello dei
// ruoli. `costruisciPagamentoRiservato` è quello dei correntisti: uscite
// con impegno e importo cifrato, prova di intervallo, un anello di esche
// per ogni entrata e una firma CLSAG per ciascuno.
//
// Come si sa se una propria uscita è già spesa: se in chiaro, lo dice lo
// stato; se in anello, il registro non lo sa, ma il portafoglio calcola
// l'immagine di chiave e la cerca tra quelle spese.

import { firmaScalare } from './chiavi.js';
import { chiaveCausale, creaIndirizzo, riconosci } from './portafoglio.js';
import { cifraCausale, decifraCausale } from './causale.js';
import { impegno, impegnoInChiaro, apriUscita, mascheraDaSegreto, cifraImporto, mascherePseudo, sommaMaschere } from './impegni.js';
import { numberToBytesLE } from '@noble/curves/utils.js';
import { provaIntervalli } from './intervallo.js';
import { firmaAnello, immagineChiave } from './anello.js';
import { dimensioneAnello } from './trasferimento.js';
import { ed25519 } from '@noble/curves/ed25519.js';

const ORDINE = ed25519.Point.Fn.ORDER;

/**
 * @typedef {object} EntrataMia
 * @property {string} ref       "hash:indice"
 * @property {string} addr
 * @property {string} commit    impegno, anche per le uscite in chiaro
 * @property {number} amount
 * @property {bigint} b         maschera (0 se in chiaro)
 * @property {boolean} chiaro   importo visibile nel registro
 * @property {bigint} p         chiave privata dell'indirizzo
 * @property {bigint} k         segreto condiviso (per causale, maschera, importo)
 * @property {string} img       immagine di chiave
 * @property {string | null} causale
 * @property {string} [tag]
 * @property {number} seq       riga che l'ha creata
 */

/**
 * Scorre il registro e restituisce le uscite non spese che appartengono al
 * portafoglio, con la chiave per spenderle e la causale decifrata.
 * @param {import('./registro.js').Registro} registro
 * @param {import('./portafoglio.js').Portafoglio} portafoglio
 * @returns {EntrataMia[]}
 */
export function mieEntrate(registro, portafoglio) {
  const uscite = /** @type {Record<string, any>} */ (registro.stato.uscite ?? {});
  const immagini = /** @type {Record<string, any>} */ (registro.stato.immagini ?? {});
  /** @type {EntrataMia[]} */
  const mie = [];
  for (const riga of registro.righe) {
    const out = /** @type {any} */ (riga.body).out;
    if (!Array.isArray(out)) continue;
    for (const [i, u] of out.entries()) {
      if (u.addr === null) continue;
      const ref = `${riga.hash}:${i}`;
      const s = uscite[ref];
      if (!s || s.spesa) continue;
      const r = riconosci(u, portafoglio);
      if (!r) continue;
      let amount; let b;
      if (s.amount !== null) {
        amount = s.amount; b = 0n;
      } else {
        const aperta = apriUscita(u, r.k);
        if (!aperta) continue; // nostra, ma l'importo cifrato non torna: non spendibile
        amount = Number(aperta.a); b = aperta.b;
      }
      const img = immagineChiave(r.p);
      if (immagini[img]) continue; // già spesa in anello
      mie.push({
        ref, addr: u.addr, commit: s.commit, amount, b, chiaro: s.amount !== null, p: r.p, k: r.k, img, seq: riga.seq,
        causale: u.memo ? decifraCausale(chiaveCausale(r.k), u.memo) : null,
        ...(u.tag ? { tag: u.tag } : {}),
      });
    }
  }
  return mie;
}

/**
 * Saldo: somma delle proprie entrate non spese.
 * @param {EntrataMia[]} entrate
 * @returns {number}
 */
export function saldo(entrate) {
  return entrate.reduce((s, e) => s + e.amount, 0);
}

/**
 * Sceglie le entrate da spendere per coprire un totale: prima le più grandi.
 * @param {EntrataMia[]} entrate
 * @param {number} totale
 * @returns {EntrataMia[]}
 */
export function scegliEntrate(entrate, totale) {
  const ordinate = [...entrate].sort((a, b) => b.amount - a.amount);
  const scelte = [];
  let somma = 0;
  for (const e of ordinate) {
    if (somma >= totale) break;
    scelte.push(e);
    somma += e.amount;
  }
  if (somma < totale) throw new Error(`saldo insufficiente: ${somma} < ${totale}`);
  return scelte;
}

/**
 * @typedef {object} Destinazione
 * @property {string} coordinate
 * @property {number} amount
 * @property {string} [causale]
 * @property {string} [tag]
 * @property {string} [voce]   codice del catalogo, per i premi
 */

/**
 * Costruisce il body di una spesa in chiaro e i firmatari. Le entrate
 * vengono scelte tra quelle disponibili; il resto torna al portafoglio su
 * un indirizzo nuovo. Le causali sono cifrate per ciascun destinatario.
 *
 * Un'entrata riservata viene **rivelata**: importo, maschera e immagine
 * di chiave finiscono nel registro, firmati con un anello di uno. Da quel
 * momento quell'uscita è legata per sempre a chi la rivela: chiunque potrà
 * vedere che quel pagamento riservato era per questo conto e di quanto.
 * L'app deve avvertire prima di farlo. È il modo di spendere dei ruoli.
 * @param {object} p
 * @param {import('./portafoglio.js').Portafoglio} p.portafoglio
 * @param {EntrataMia[]} p.disponibili
 * @param {Destinazione[]} p.destinazioni
 * @param {Array<{ amount: number, reason: string }>} [p.bruciature]
 * @param {string | null} [p.ref]
 * @returns {{ body: Record<string, unknown>, firmatari: Array<{ by: string, firma: (h: string) => string }> }}
 */
export function costruisciPagamento({ portafoglio, disponibili, destinazioni, bruciature = [], ref = null }) {
  if (!destinazioni.length && !bruciature.length) throw new Error('niente da pagare');
  const totale = destinazioni.reduce((s, d) => s + d.amount, 0) + bruciature.reduce((s, b) => s + b.amount, 0);
  const entrate = scegliEntrate(disponibili, totale);
  const somma = saldo(entrate);

  const out = [];
  for (const d of destinazioni) {
    if (!Number.isInteger(d.amount) || d.amount <= 0) throw new Error('importo non valido');
    const ind = creaIndirizzo(d.coordinate);
    out.push({
      addr: ind.addr, eph: ind.eph, amount: d.amount,
      ...(d.causale ? { memo: cifraCausale(chiaveCausale(ind.k), d.causale) } : {}),
      ...(d.tag ? { tag: d.tag } : {}),
      ...(d.voce ? { voce: d.voce } : {}),
    });
  }
  for (const b of bruciature) out.push({ addr: null, amount: b.amount, reason: b.reason });
  const resto = somma - totale;
  if (resto > 0) {
    const mio = creaIndirizzo(portafoglio.coordinate);
    out.push({ addr: mio.addr, eph: mio.eph, amount: resto });
  }

  const body = { in: entrate.map((e) => (e.chiaro ? e.ref : rivelazione(e))), out, ref };
  const firmatari = [];
  const visti = new Set();
  for (const e of entrate) {
    if (e.chiaro) {
      if (visti.has(e.addr)) continue;
      visti.add(e.addr);
      firmatari.push({ by: e.addr, firma: (/** @type {string} */ h) => firmaScalare(e.p, h) });
    } else {
      firmatari.push({
        img: e.img,
        firma: (/** @type {string} */ h) => firmaAnello({
          membri: [{ addr: e.addr, commit: e.commit }], indice: 0, p: e.p, z: e.b, pseudo: impegnoInChiaro(e.amount), messaggio: h,
        }).firma,
      });
    }
  }
  return { body, firmatari };
}

/**
 * L'entrata rivelata di una spesa in chiaro.
 * @param {EntrataMia} e
 */
function rivelazione(e) {
  return { ref: e.ref, amount: e.amount, mask: Buffer.from(numberToBytesLE(e.b, 32)).toString('hex'), img: e.img };
}

/**
 * Sceglie le esche per un'entrata: tutte le uscite disponibili se sono
 * poche, altrimenti l'entrata più altre a caso. In ordine di creazione,
 * come vuole la regola.
 * @param {Record<string, any>} stato
 * @param {string} refVera
 * @param {(n: number) => number} [caso]  solo per i test
 * @returns {{ ring: string[], indice: number }}
 */
export function scegliEsche(stato, refVera, caso = (n) => Math.floor(Math.random() * n)) {
  const uscite = stato.uscite ?? {};
  const disponibili = Object.keys(uscite).filter((ref) => !uscite[ref].spesa);
  const quante = dimensioneAnello(stato);
  const scelte = new Set([refVera]);
  const altre = disponibili.filter((ref) => ref !== refVera);
  while (scelte.size < quante) {
    scelte.add(altre.splice(caso(altre.length), 1)[0]);
  }
  const ring = [...scelte].sort((x, y) => uscite[x].ordine - uscite[y].ordine);
  return { ring, indice: ring.indexOf(refVera) };
}

/**
 * Costruisce il body di un `transfer` riservato e i firmatari ad anello.
 * Le uscite hanno impegno e importo cifrato per il destinatario; una prova
 * di intervallo le copre tutte; ogni entrata ha il suo anello e il suo
 * pseudo-impegno, con le maschere scelte perché il bilancio torni.
 * @param {object} p
 * @param {import('./portafoglio.js').Portafoglio} p.portafoglio
 * @param {EntrataMia[]} p.disponibili
 * @param {Destinazione[]} p.destinazioni   senza tag
 * @param {Record<string, any>} p.stato     lo stato del registro, per le esche
 * @param {(n: number) => number} [p.caso]
 * @returns {{ body: Record<string, unknown>, firmatari: Array<{ img: string, firma: (h: string) => unknown }> }}
 */
export function costruisciPagamentoRiservato({ portafoglio, disponibili, destinazioni, stato, caso }) {
  if (!destinazioni.length) throw new Error('niente da pagare');
  const totale = destinazioni.reduce((s, d) => s + d.amount, 0);
  const entrate = scegliEntrate(disponibili, totale);
  const resto = saldo(entrate) - totale;

  const out = [];
  const valori = [];
  const versa = (coordinate, amount, causale) => {
    if (!Number.isInteger(amount) || amount <= 0) throw new Error('importo non valido');
    const ind = creaIndirizzo(coordinate);
    const b = mascheraDaSegreto(ind.k);
    out.push({
      addr: ind.addr, eph: ind.eph, commit: impegno(amount, b), amt: cifraImporto(ind.k, amount),
      ...(causale ? { memo: cifraCausale(chiaveCausale(ind.k), causale) } : {}),
    });
    valori.push({ a: BigInt(amount), b });
  };
  for (const d of destinazioni) {
    if (d.tag) throw new Error('nessun tag sui pagamenti tra correntisti');
    versa(d.coordinate, d.amount, d.causale);
  }
  if (resto > 0) versa(portafoglio.coordinate, resto);
  const proof = provaIntervalli(valori);

  const maschere = mascherePseudo(valori.map((v) => v.b), entrate.length);
  const ins = [];
  const firmatari = [];
  for (const [i, e] of entrate.entries()) {
    const pseudo = impegno(e.amount, maschere[i]);
    const z = sommaMaschere([e.b, ORDINE - maschere[i]]);
    if (z === 0n) throw new Error('maschera dello pseudo-impegno coincidente: riprova');
    const { ring, indice } = scegliEsche(stato, e.ref, caso);
    const membri = ring.map((ref) => ({ addr: stato.uscite[ref].addr, commit: stato.uscite[ref].commit }));
    ins.push({ ring, img: e.img, pseudo });
    firmatari.push({
      img: e.img,
      firma: (/** @type {string} */ h) => firmaAnello({ membri, indice, p: e.p, z, pseudo, messaggio: h }).firma,
    });
  }
  return { body: { in: ins, out, proof, ref: null }, firmatari };
}

/**
 * Costruisce il body di una `conversion.request` e i firmatari ad anello.
 * L'importo da convertire è in chiaro; il resto è riservato con la sua
 * prova, e c'è sempre, anche da zero, perché lo pseudo-impegno dell'entrata
 * possa avere una maschera a caso. I dati per il pagamento (nome, IBAN, quello che la banca
 * chiede) sono cifrati per le coordinate della banca: nel registro non
 * compaiono. Chi converte viene comunque identificato dalla banca, fuori
 * dal registro.
 * @param {object} p
 * @param {import('./portafoglio.js').Portafoglio} p.portafoglio
 * @param {EntrataMia[]} p.disponibili
 * @param {number} p.amount              manti da convertire, centesimi
 * @param {string} p.dati                testo per la banca, fino a 140 caratteri
 * @param {string} p.coordinateBanca
 * @param {Record<string, any>} p.stato
 * @param {(n: number) => number} [p.caso]
 * @returns {{ body: Record<string, unknown>, firmatari: Array<{ img: string, firma: (h: string) => unknown }> }}
 */
export function costruisciRichiestaConversione({ portafoglio, disponibili, amount, dati, coordinateBanca, stato, caso }) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('importo non valido');
  const entrate = scegliEntrate(disponibili, amount);
  const resto = saldo(entrate) - amount;

  const mio = creaIndirizzo(portafoglio.coordinate);
  const bResto = mascheraDaSegreto(mio.k);
  const out = [{ addr: mio.addr, eph: mio.eph, commit: impegno(resto, bResto), amt: cifraImporto(mio.k, resto) }];
  const valori = [{ a: BigInt(resto), b: bResto }];
  const perBanca = creaIndirizzo(coordinateBanca);
  const body = {
    in: [],
    amount,
    out,
    proof: provaIntervalli(valori),
    dati: { addr: perBanca.addr, eph: perBanca.eph, memo: cifraCausale(chiaveCausale(perBanca.k), dati) },
  };

  const maschere = mascherePseudo(valori.map((v) => v.b), entrate.length);
  const firmatari = [];
  for (const [i, e] of entrate.entries()) {
    const pseudo = impegno(e.amount, maschere[i]);
    const z = sommaMaschere([e.b, ORDINE - maschere[i]]);
    if (z === 0n) throw new Error('maschera dello pseudo-impegno coincidente: riprova');
    const { ring, indice } = scegliEsche(stato, e.ref, caso);
    const membri = ring.map((ref) => ({ addr: stato.uscite[ref].addr, commit: stato.uscite[ref].commit }));
    body.in.push({ ring, img: e.img, pseudo });
    firmatari.push({
      img: e.img,
      firma: (/** @type {string} */ h) => firmaAnello({ membri, indice, p: e.p, z, pseudo, messaggio: h }).firma,
    });
  }
  return { body, firmatari };
}
