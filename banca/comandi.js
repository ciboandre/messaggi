// La banca da riga di comando: le sue righe, firmate sulla sua macchina.
//
// ARCHITETTURA.md, sezione 1 (pannello banca) e 12 (cosa può fare la
// banca). Nella fase di test il pannello è questo: funzioni che prendono
// la frase di dodici parole, costruiscono una riga, la verificano contro
// il registro e la accodano a ledger.jsonl. Il push lo fa git; il sito lo
// rifà l'Action. La chiave non lascia mai la macchina: dalla frase si
// derivano ogni volta la chiave di firma (Ed25519, per firmare le righe)
// e il portafoglio (coordinate, per ricevere e per leggere i dati cifrati
// delle conversioni), e si buttano via.
//
// Derivazione, dalla frase al seme BIP39 di 64 byte:
//   chiave di firma  = SHA-512("manti/banca/firma/v1" ‖ seme)[0..32]
//   portafoglio      = portafoglioDaSeme(seme), come per i correntisti
//
// Qui non c'è I/O di terminale: cli.js chiede la frase, questo file fa.

import { sha512 } from '@noble/hashes/sha2.js';
import { concatBytes } from '@noble/curves/utils.js';
import { existsSync, readFileSync } from 'node:fs';
import { coppiaDaSeme, firma } from '../nucleo/chiavi.js';
import { fraseValida, semeDaFrase, generaFrase } from '../nucleo/frase.js';
import { portafoglioDaSeme, decodificaCoordinate, creaIndirizzo } from '../nucleo/portafoglio.js';
import { preparaRiga, firmaRiga } from '../nucleo/registro.js';
import { apriRegistro, accodaSuFile } from '../nucleo/registro-file.js';
import { tipi } from '../nucleo/tipi.js';
import { valore, prezzoAcquisto, prezzoConversione, mantiPerEuro, euroPerManti, spazioSottoTetto } from '../nucleo/banca.js';
import { apriDatiConversione } from '../nucleo/conversione.js';

const codifica = new TextEncoder();
const RE_HEX64 = /^[0-9a-f]{64}$/;

/** I parametri delle regole (REGOLE_MONETA.md, sezione 2). */
export const PARAMETRI = { sovrapprezzo_pct: 5, commissione_pct: 2, multe_bruciate_pct: 50, tetto_cent: 400000, giorni_multa: 15 };

/**
 * Dalla frase, chiave di firma e portafoglio della banca.
 * @param {string} frase
 */
export function identitaBanca(frase) {
  if (!fraseValida(frase)) throw new Error('frase non valida');
  const seme = semeDaFrase(frase);
  const chiave = coppiaDaSeme(sha512(concatBytes(codifica.encode('manti/banca/firma/v1'), seme)).subarray(0, 32));
  const portafoglio = portafoglioDaSeme(seme);
  return { chiave, portafoglio, firmatario: { by: chiave.pubblica, firma: (/** @type {string} */ h) => firma(chiave.privata, h) } };
}

/** Una frase nuova per la banca: si scrive su carta, non su disco. */
export function nuovaFrase() {
  const frase = generaFrase();
  const { chiave, portafoglio } = identitaBanca(frase);
  return { frase, pubblica: chiave.pubblica, coordinate: portafoglio.coordinate };
}

/** "12,50" o "12.50" o "1250c" → centesimi. */
export function centesimiDa(testo) {
  const s = String(testo).trim().replace(/\s/g, '');
  if (/^\d+c$/.test(s)) return Number(s.slice(0, -1));
  const m = s.match(/^(\d+)(?:[.,](\d{1,2}))?$/);
  if (!m) throw new Error(`importo non valido: ${testo} (usa 12,50 oppure 1250c)`);
  return Number(m[1]) * 100 + Number((m[2] ?? '0').padEnd(2, '0'));
}

const oggiUtc = () => new Date().toISOString().slice(0, 10);
const adesso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * Apre il registro, costruisce una riga firmata dalla banca, la accoda.
 * @param {string} percorso
 * @param {string} frase
 * @param {string} type
 * @param {Record<string, unknown>} body
 * @param {string} [ts]
 */
function accodaBanca(percorso, frase, type, body, ts = adesso()) {
  const { firmatario } = identitaBanca(frase);
  const reg = apriRegistro(percorso, { tipi });
  if (reg.righe.length && /** @type {any} */ (reg.stato).genesi.banca.chiave !== firmatario.by) {
    throw new Error('questa frase non è quella della banca di questo registro');
  }
  const riga = firmaRiga(preparaRiga(reg.ultima, { type, ts, body }), [firmatario]);
  accodaSuFile(reg, percorso, riga);
  return { riga, stato: reg.stato };
}

/**
 * La genesi: solo su un registro vuoto o assente.
 * @param {string} percorso @param {string} frase @param {Partial<typeof PARAMETRI>} [parametri]
 */
export function genesi(percorso, frase, parametri = {}) {
  if (existsSync(percorso) && readFileSync(percorso, 'utf8').trim() !== '') throw new Error('il registro non è vuoto: la genesi c\'è già');
  const { chiave, portafoglio } = identitaBanca(frase);
  return accodaBanca(percorso, frase, 'genesis', {
    banca: { chiave: chiave.pubblica, coordinate: portafoglio.coordinate },
    parametri: { ...PARAMETRI, ...parametri },
  });
}

/** Apre un giorno. */
export function giorno(percorso, frase, data = oggiUtc()) {
  return accodaBanca(percorso, frase, 'day', { data });
}

/** Vende manti: euro ricevuti fuori dal sistema, al prezzo del giorno, a delle coordinate. */
export function vendita(percorso, frase, euro, coordinate, pagamento) {
  const euroCent = centesimiDa(euro);
  decodificaCoordinate(coordinate);
  const reg = apriRegistro(percorso, { tipi });
  const prezzo = prezzoAcquisto(reg.stato);
  const manti = mantiPerEuro(BigInt(euroCent), prezzo);
  const i = creaIndirizzo(coordinate);
  const esito = accodaBanca(percorso, frase, 'sale', {
    euro_cent: euroCent, prezzo: Number(prezzo), pagamento,
    out: [{ addr: i.addr, eph: i.eph, amount: Number(manti), tag: 'vendita' }],
  });
  return { ...esito, prezzo, manti };
}

export function tetto(percorso, frase, euro) {
  return accodaBanca(percorso, frase, 'cap.set', { tetto_cent: centesimiDa(euro) });
}

export function interessi(percorso, frase, euro, da, a) {
  return accodaBanca(percorso, frase, 'reserve.interest', { euro_cent: centesimiDa(euro), da, a });
}

export function estratto(percorso, frase, mese, saldo, documento, nota) {
  return accodaBanca(percorso, frase, 'reserve.statement', { mese, saldo_cent: centesimiDa(saldo), documento, ...(nota ? { nota } : {}) });
}

export function correzione(percorso, frase, ref, euro, motivazione) {
  return accodaBanca(percorso, frase, 'correction', { ref, ...(euro ? { euro_cent: centesimiDa(euro) } : {}), motivazione });
}

export function azienda(percorso, frase, chiave, coordinate, nome) {
  if (!RE_HEX64.test(chiave)) throw new Error('chiave dell\'azienda: 64 esadecimali');
  decodificaCoordinate(coordinate);
  return accodaBanca(percorso, frase, 'company.register', { chiave, coordinate, nome });
}

export function giudice(percorso, frase, chiave, versione) {
  if (!RE_HEX64.test(chiave)) throw new Error('chiave del giudice: 64 esadecimali');
  return accodaBanca(percorso, frase, 'judge.register', { chiave, versione });
}

/** Le richieste di conversione in attesa, con i dati aperti dalla banca. */
export function conversioniInAttesa(percorso, frase) {
  const { portafoglio } = identitaBanca(frase);
  const reg = apriRegistro(percorso, { tipi });
  const s = /** @type {any} */ (reg.stato);
  const prezzo = prezzoConversione(s);
  return Object.entries(s.conversioni ?? {}).filter(([, c]) => c.stato === 'richiesta').map(([hash, c]) => {
    const riga = reg.righe.find((r) => r.hash === hash);
    return {
      hash, amount: c.amount, seq: c.seq,
      euro: prezzo === null ? null : euroPerManti(BigInt(c.amount), prezzo),
      dati: riga ? apriDatiConversione(/** @type {any} */ (riga.body).dati, portafoglio) : null,
    };
  });
}

/** Esegue una richiesta al prezzo del giorno. */
export function esegui(percorso, frase, hash) {
  const reg = apriRegistro(percorso, { tipi });
  const c = /** @type {any} */ (reg.stato).conversioni?.[hash];
  if (!c) throw new Error('richiesta sconosciuta');
  const prezzo = prezzoConversione(reg.stato);
  if (prezzo === null) throw new Error('nessun valore');
  const euro = euroPerManti(BigInt(c.amount), prezzo);
  const esito = accodaBanca(percorso, frase, 'conversion.execute', { richiesta: hash, prezzo: Number(prezzo), euro_cent: Number(euro) });
  return { ...esito, euro, prezzo };
}

export function pagata(percorso, frase, hash, data = oggiUtc()) {
  return accodaBanca(percorso, frase, 'conversion.paid', { richiesta: hash, data });
}

/** Lo stato in due righe, per il terminale. Non serve la frase. */
export function stato(percorso) {
  const reg = apriRegistro(percorso, { tipi });
  const s = /** @type {any} */ (reg.stato);
  return {
    righe: reg.righe.length, giorno: s.giorno ?? null, valore: valore(s), prezzo_acquisto: prezzoAcquisto(s), prezzo_conversione: prezzoConversione(s),
    riserva_cent: s.riserva_cent ?? 0n, tetto_cent: s.tetto_cent ?? 0n, spazio_cent: spazioSottoTetto(s), circolazione_cent: s.circolazione_cent ?? 0n,
    in_attesa: Object.values(s.conversioni ?? {}).filter((c) => c.stato === 'richiesta').length,
  };
}
