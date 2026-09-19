// Il registro: righe concatenate, firmate, verificabili da capo.
//
// ARCHITETTURA.md, sezione 7. Ogni riga è
//   { seq, ts, type, body, prev, hash, sigs: [{ by, sig }] }
// dove hash = SHA-256 della forma canonica di { seq, ts, type, body, prev } e
// ogni firma è una firma Ed25519 dell'hash. Chi firma, firma la riga completa,
// posizione compresa: una firma non si può riusare altrove.
//
// Il registro non sa niente di manti. Sa tre cose: che la catena regge, che
// le firme sono valide, e che ogni riga rispetta le regole del suo tipo.
// Due forme di firma: { by, sig } è Ed25519 di una chiave, e la verifica
// qui; { img, sig } è una firma ad anello legata a un'immagine di chiave, e
// la verifica la regola del tipo, che sola conosce l'anello. La regola dice
// poi quali `by` e quali `img` devono esserci, né uno di più né uno di meno.
// Le regole dei tipi arrivano dall'esterno (`tipi`), una per tipo, e ricevono
// lo stato accumulato fino alla riga precedente. Un tipo sconosciuto è
// invalido: il codice non lo riconosce, e basta.
//
// Qui dentro non c'è I/O. Leggere e scrivere il file è in registro-file.js.

import { hashCanonico } from './canonico.js';
import { verifica } from './chiavi.js';

export const PREV_GENESI = '0'.repeat(64);
const RE_HEX64 = /^[0-9a-f]{64}$/;
const RE_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/**
 * @typedef {object} Firma
 * @property {string} [by]   chiave pubblica esadecimale di chi firma (Ed25519)
 * @property {string} [img]  immagine di chiave (firma ad anello)
 * @property {unknown} sig   firma: base64 se Ed25519, oggetto se ad anello
 */

/**
 * Cosa una regola richiede: le chiavi che devono aver firmato e le
 * immagini di chiave delle firme ad anello che ha verificato.
 * @typedef {string[] | { by: string[], img: string[] }} Richieste
 */

/**
 * @typedef {object} Riga
 * @property {number} seq
 * @property {string} ts
 * @property {string} type
 * @property {Record<string, unknown>} body
 * @property {string} prev
 * @property {string} hash
 * @property {Firma[]} sigs
 */

/**
 * Una regola di tipo: riceve la riga e lo stato fino alla riga precedente,
 * lancia se la riga non è valida, restituisce le firme richieste, e aggiorna
 * lo stato. Una lista di stringhe vale come { by: lista, img: [] }.
 * @typedef {(riga: Riga, stato: Record<string, unknown>) => Richieste} RegolaTipo
 */

/**
 * @typedef {object} Opzioni
 * @property {Record<string, RegolaTipo>} tipi   regole per tipo, oltre a `genesis`
 */

/**
 * Hash della riga: sui cinque campi che contano, in forma canonica.
 * @param {{ seq: number, ts: string, type: string, body: unknown, prev: string }} r
 * @returns {string}
 */
export function hashRiga(r) {
  return hashCanonico({ seq: r.seq, ts: r.ts, type: r.type, body: r.body, prev: r.prev });
}

/**
 * Prepara la riga successiva, senza firme: il server la propone, chi chiede
 * il movimento la firma. `ultima` è l'ultima riga del registro, o null.
 * @param {Riga | null} ultima
 * @param {{ type: string, body: Record<string, unknown>, ts: string }} dati
 * @returns {Omit<Riga, 'sigs'>}
 */
export function preparaRiga(ultima, dati) {
  const seq = ultima ? ultima.seq + 1 : 0;
  const prev = ultima ? ultima.hash : PREV_GENESI;
  const base = { seq, ts: dati.ts, type: dati.type, body: dati.body, prev };
  return { ...base, hash: hashRiga(base) };
}

/**
 * Aggiunge le firme a una riga preparata.
 * @param {Omit<Riga, 'sigs'>} riga
 * @param {Array<{ by: string, firma: (hash: string) => string }>} firmatari
 * @returns {Riga}
 */
export function firmaRiga(riga, firmatari) {
  return {
    ...riga,
    sigs: firmatari.map((f) => ('img' in f ? { img: f.img, sig: f.firma(riga.hash) } : { by: f.by, sig: f.firma(riga.hash) })),
  };
}

/**
 * Genesi: regola incorporata. Una sola, a seq 0, firmata dalla chiave banca
 * dichiarata nel body, con i parametri delle regole.
 * @type {RegolaTipo}
 */
function regolaGenesi(riga, stato) {
  if (riga.seq !== 0) throw new Error('genesi solo a seq 0');
  if (stato.genesi) throw new Error('genesi già presente');
  const b = /** @type {any} */ (riga.body);
  const banca = b?.banca;
  if (!banca || !RE_HEX64.test(banca.chiave ?? '')) throw new Error('genesi: chiave banca mancante');
  if (typeof banca.coordinate !== 'string' || !banca.coordinate.startsWith('mnt1')) throw new Error('genesi: coordinate banca mancanti');
  const p = b.parametri;
  const interi = ['sovrapprezzo_pct', 'commissione_pct', 'multe_bruciate_pct', 'tetto_cent', 'giorni_multa'];
  for (const k of interi) {
    if (!Number.isInteger(p?.[k]) || p[k] < 0) throw new Error(`genesi: parametro ${k} mancante o non intero`);
  }
  if (p.sovrapprezzo_pct > 100 || p.commissione_pct > 100 || p.multe_bruciate_pct > 100) throw new Error('genesi: percentuale oltre 100');
  stato.genesi = { banca: { chiave: banca.chiave, coordinate: banca.coordinate }, parametri: { ...p } };
  stato.tetto_cent = p.tetto_cent;
  return [banca.chiave];
}

/**
 * Un registro in memoria: righe verificate una per una, stato accumulato.
 */
export class Registro {
  /** @param {Opzioni} opzioni */
  constructor(opzioni) {
    /** @type {Riga[]} */
    this.righe = [];
    /** @type {Record<string, unknown>} */
    this.stato = {};
    /** @type {Record<string, RegolaTipo>} */
    this.tipi = { genesis: regolaGenesi, ...(opzioni?.tipi ?? {}) };
    if (opzioni?.tipi?.genesis) throw new Error('la regola genesis è incorporata e non si sostituisce');
  }

  /** @returns {Riga | null} */
  get ultima() {
    return this.righe.length ? this.righe[this.righe.length - 1] : null;
  }

  /**
   * Verifica una riga contro l'ultima del registro e la accoda. Lancia con
   * il motivo se non è valida; in quel caso il registro non cambia.
   * @param {Riga} riga
   */
  accoda(riga) {
    const stato = strutturaCopia(this.stato);
    verificaRiga(riga, this.ultima, stato, this.tipi);
    this.righe.push(riga);
    this.stato = stato;
  }

  /**
   * Ricostruisce un registro da righe già scritte, verificandole tutte da capo.
   * Al primo errore lancia indicando seq e motivo.
   * @param {Riga[]} righe
   * @param {Opzioni} opzioni
   * @returns {Registro}
   */
  static daRighe(righe, opzioni) {
    const r = new Registro(opzioni);
    for (const riga of righe) {
      try {
        r.accoda(riga);
      } catch (e) {
        throw new Error(`riga ${riga?.seq ?? '?'}: ${/** @type {Error} */ (e).message}`);
      }
    }
    return r;
  }
}

/**
 * Verifica strutturale e di regola di una riga. Aggiorna `stato` se valida.
 * @param {Riga} riga
 * @param {Riga | null} precedente
 * @param {Record<string, unknown>} stato
 * @param {Record<string, RegolaTipo>} tipi
 */
export function verificaRiga(riga, precedente, stato, tipi) {
  if (!riga || typeof riga !== 'object') throw new Error('riga mancante');
  const attesoSeq = precedente ? precedente.seq + 1 : 0;
  if (riga.seq !== attesoSeq) throw new Error(`seq ${riga.seq}, atteso ${attesoSeq}`);
  const attesoPrev = precedente ? precedente.hash : PREV_GENESI;
  if (riga.prev !== attesoPrev) throw new Error('prev non corrisponde alla riga precedente');
  if (typeof riga.ts !== 'string' || !RE_TS.test(riga.ts) || Number.isNaN(Date.parse(riga.ts))) {
    throw new Error('ts non è una data ISO 8601 in UTC');
  }
  if (precedente && riga.ts < precedente.ts) throw new Error('ts precedente all\'ultima riga');
  if (typeof riga.type !== 'string' || !riga.type) throw new Error('type mancante');
  if (!riga.body || typeof riga.body !== 'object' || Array.isArray(riga.body)) throw new Error('body deve essere un oggetto');
  if (riga.hash !== hashRiga(riga)) throw new Error('hash non corrisponde al contenuto');
  if (!Array.isArray(riga.sigs) || riga.sigs.length === 0) throw new Error('nessuna firma');
  const firmatari = new Set();
  const immagini = new Set();
  for (const f of riga.sigs) {
    if (!f || typeof f !== 'object') throw new Error('firma malformata');
    if ('img' in f) {
      if ('by' in f || !RE_HEX64.test(f.img ?? '')) throw new Error('firma ad anello malformata');
      if (immagini.has(f.img)) throw new Error(`firma ad anello duplicata per ${f.img.slice(0, 8)}`);
      immagini.add(f.img);
      continue;
    }
    if (!RE_HEX64.test(f.by ?? '')) throw new Error('firma con chiave malformata');
    if (firmatari.has(f.by)) throw new Error(`firma duplicata di ${f.by.slice(0, 8)}`);
    if (!verifica(f.by, riga.hash, /** @type {string} */ (f.sig))) throw new Error(`firma non valida di ${f.by.slice(0, 8)}`);
    firmatari.add(f.by);
  }
  if (riga.seq === 0 && riga.type !== 'genesis') throw new Error('la riga 0 deve essere la genesi');
  const regola = tipi[riga.type];
  if (!regola) throw new Error(`tipo sconosciuto: ${riga.type}`);
  const esito = regola(riga, stato);
  const richieste = Array.isArray(esito) ? { by: esito, img: [] } : esito;
  for (const k of richieste.by) {
    if (!firmatari.has(k)) throw new Error(`manca la firma di ${k.slice(0, 8)}`);
  }
  for (const k of firmatari) {
    if (!richieste.by.includes(k)) throw new Error(`firma non richiesta di ${k.slice(0, 8)}`);
  }
  for (const i of richieste.img) {
    if (!immagini.has(i)) throw new Error(`manca la firma ad anello per ${i.slice(0, 8)}`);
  }
  for (const i of immagini) {
    if (!richieste.img.includes(i)) throw new Error(`firma ad anello non richiesta per ${i.slice(0, 8)}`);
  }
}

/**
 * Copia profonda dello stato, per non sporcarlo se la riga fallisce.
 * @param {Record<string, unknown>} s
 * @returns {Record<string, unknown>}
 */
function strutturaCopia(s) {
  return structuredClone(s);
}
