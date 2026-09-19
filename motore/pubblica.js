// Il motore giornaliero: rilegge il registro da capo, verifica ogni riga,
// calcola lo stato, scrive il sito statico. Non scrive mai nel registro.
//
// ARCHITETTURA.md, sezioni 11 e 12. Uso:
//   node motore/pubblica.js [ledger.jsonl] [cartella del sito]
//
// La catena è o intera o rotta, mai rammendata. Se una riga non passa la
// sua regola, il motore scrive quale e perché, e il sito mostra l'ultimo
// stato buono con l'avviso al posto dei numeri. Esce con codice 1, così
// chi lo esegue (una GitHub Action) lo vede.
//
// L'uscita è deterministica: dipende solo dal registro. Nessuna data di
// generazione, nessun ordine che venga da fuori. Due esecuzioni sullo
// stesso file danno gli stessi byte, e chiunque può rifare il sito in
// locale e confrontarlo. Un registro assente vale come vuoto.

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Registro } from '../nucleo/registro.js';
import { righeDaJsonl } from '../nucleo/registro-file.js';
import { tipi } from '../nucleo/tipi.js';
import { valore, prezzoAcquisto, prezzoConversione, spazioSottoTetto } from '../nucleo/banca.js';
import { definitivoNonSaldato } from '../nucleo/multe.js';
import { rendiSito } from './sito.js';

/**
 * Rilegge tutte le righe. Restituisce il registro fin dove è buono e,
 * se si è fermato, la riga e il motivo.
 * @param {import('../nucleo/registro.js').Riga[]} righe
 * @returns {{ registro: Registro, errore: { seq: number, motivo: string } | null }}
 */
export function rileggi(righe) {
  const registro = new Registro({ tipi });
  for (const riga of righe) {
    try {
      registro.accoda(riga);
    } catch (e) {
      return { registro, errore: { seq: riga?.seq ?? registro.righe.length, motivo: /** @type {Error} */ (e).message } };
    }
  }
  return { registro, errore: null };
}

/**
 * Il riassunto pubblico dello stato: solo numeri interi e stringhe, niente
 * BigInt, così va in JSON e nella pagina. Il valore con il conto esplicito.
 * @param {Registro} registro
 */
export function riassunto(registro) {
  const s = /** @type {any} */ (registro.stato);
  const ultima = registro.ultima;
  const v = valore(s);
  const verbali = Object.values(s.verbali ?? {});
  const n = (x) => (x === undefined || x === null ? null : String(x));
  return {
    ultima_riga: ultima ? { seq: ultima.seq, hash: ultima.hash, ts: ultima.ts } : null,
    giorno: s.giorno ?? null,
    n_giorni: s.n_giorni ?? 0,
    valore: v === null ? null : { decimillesimi: String(v), riserva_cent: String(s.riserva_cent), circolazione_cent: String(s.circolazione_cent) },
    prezzo_acquisto: String(prezzoAcquisto(s)),
    prezzo_conversione: n(prezzoConversione(s)),
    riserva_cent: String(s.riserva_cent ?? 0n),
    tetto_cent: String(s.tetto_cent ?? 0n),
    spazio_sotto_tetto_cent: String(spazioSottoTetto(s)),
    circolazione_cent: String(s.circolazione_cent ?? 0n),
    emessi_cent: String(s.emessi_cent ?? 0n),
    bruciati_cent: String(s.bruciati_cent ?? 0n),
    venduti_cent: String(s.venduti_cent ?? 0n),
    convertiti_cent: String(s.convertiti_cent ?? 0n),
    interessi_cent: String(s.interessi_cent ?? 0n),
    uscite: Object.keys(s.uscite ?? {}).length,
    disponibili: s.disponibili ?? 0,
    immagini_spese: Object.keys(s.immagini ?? {}).length,
    estratti: Object.fromEntries(Object.entries(s.estratti ?? {}).map(([m, e]) => [m, { saldo_cent: String(e.saldo_cent), riserva_cent: String(e.riserva_cent), documento: e.documento, ...(e.nota ? { nota: e.nota } : {}) }])),
    correzioni: Object.fromEntries(Object.entries(s.correzioni ?? {}).map(([r, c]) => [r, { ...c, euro_cent: String(c.euro_cent), valore_prima: n(c.valore_prima), valore_dopo: n(c.valore_dopo) }])),
    aziende: Object.fromEntries(Object.entries(s.aziende ?? {}).map(([k, a]) => [k, {
      nome: a.nome, polizia: a.polizia?.chiave ?? null, catalogo: a.catalogo, tariffario: a.tariffario, pagati_cent: String(a.pagati_cent),
    }])),
    giudice: s.giudice ?? null,
    verbali: {
      totale: verbali.length,
      aperti: verbali.filter((x) => x.stato === 'aperto' && !definitivoNonSaldato(s, x)).length,
      pagati: verbali.filter((x) => x.stato === 'pagato').length,
      contestati: verbali.filter((x) => x.stato === 'contestato').length,
      annullati: verbali.filter((x) => x.stato === 'annullato' || x.stato === 'ritirato').length,
      definitivi_non_saldati: verbali.filter((x) => definitivoNonSaldato(s, x)).length,
    },
    sentenze: verbali.filter((x) => x.sentenza).map((x) => ({ azienda: x.azienda, numero: x.numero, voce: x.voce, amount: x.amount, ...x.sentenza })),
    conversioni: Object.values(s.conversioni ?? {}).reduce((acc, c) => { acc[c.stato] = (acc[c.stato] ?? 0) + 1; return acc; }, {}),
  };
}

/**
 * Esegue tutto: legge, rilegge, scrive stato.json e index.html.
 * @param {string} percorsoRegistro
 * @param {string} cartellaSito
 * @returns {{ ok: boolean, seq: number, errore: { seq: number, motivo: string } | null }}
 */
export function pubblica(percorsoRegistro, cartellaSito) {
  let righe;
  try {
    righe = existsSync(percorsoRegistro) ? righeDaJsonl(readFileSync(percorsoRegistro, 'utf8')) : [];
  } catch (e) {
    righe = [];
    mkdirSync(cartellaSito, { recursive: true });
    const errore = { seq: -1, motivo: `registro illeggibile: ${/** @type {Error} */ (e).message}` };
    writeFileSync(join(cartellaSito, 'index.html'), rendiSito({ riassunto: null, errore, righe: [] }));
    return { ok: false, seq: -1, errore };
  }
  const { registro, errore } = rileggi(righe);
  const r = riassunto(registro);
  mkdirSync(cartellaSito, { recursive: true });
  writeFileSync(join(cartellaSito, 'stato.json'), JSON.stringify({ ...r, errore }, null, 2) + '\n');
  writeFileSync(join(cartellaSito, 'index.html'), rendiSito({ riassunto: r, errore, righe: registro.righe }));
  return { ok: errore === null, seq: registro.righe.length - 1, errore };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  const [percorso = 'ledger.jsonl', sito = 'sito'] = process.argv.slice(2);
  const esito = pubblica(percorso, sito);
  if (esito.ok) {
    console.log(`Pubblicazione ok: seq ${esito.seq}`);
  } else {
    console.error(`Registro rotto alla riga ${esito.errore.seq}: ${esito.errore.motivo}`);
    process.exitCode = 1;
  }
}
