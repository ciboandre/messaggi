// Il servizio giudice: legge le contestazioni, costruisce il fascicolo,
// interroga il modello con le istruzioni pubbliche, firma la sentenza.
//
// ARCHITETTURA.md, sezione 10. Uso:
//   node giudice/servizio.js nuova-frase        le parole del giudice, in una finestra
//   node giudice/servizio.js chiavi             chiave e coordinate da dare alla banca
//   node giudice/servizio.js prova              un fascicolo di esempio al modello, senza registro
//   node giudice/servizio.js [--una-volta]      il servizio: un giro ogni 5 minuti, o uno solo
// con MANTI_SERVER (il server della banca), la frase del giudice chiesta
// a video o in MANTI_FRASE, e la chiave API di Anthropic in
// ANTHROPIC_API_KEY (o un profilo di `ant auth login`). La chiave API non
// va mai scritta in un file del repository né incollata da nessuna parte:
// si esporta nella finestra del terminale.
//
// Il giudice ha una chiave (firma le sentenze) e un portafoglio (legge i
// testi cifrati per lui), da una frase come gli altri ruoli. Decide su un
// verbale contestato quando la polizia ha replicato o sono passati 3
// giorni di registro senza replica. Il fascicolo contiene solo verbale,
// tariffario, contestazione e replica: nessun nome, nessun indirizzo. La
// descrizione del verbale è cifrata per il multato, non per il giudice:
// la polizia, se vuole che il giudice la legga, la ripete nella replica.
// L'hash del fascicolo va nella sentenza; il fascicolo no.
//
// Le istruzioni sono in giudice/istruzioni.md e la loro `versione` deve
// essere quella registrata con judge.register: il registro rifiuta una
// sentenza con una versione diversa. Modello e versione del modello sono
// parametri pubblici (in fondo a questo file).
//
// Se il modello non risponde, o risponde fuori schema, nessuna sentenza:
// la contestazione resta aperta e si riprova al giro dopo.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { identitaRuolo } from '../nucleo/ruoli.js';
import { riconosci, chiaveCausale } from '../nucleo/portafoglio.js';
import { decifraCausale } from '../nucleo/causale.js';
import { sha256, canonico } from '../nucleo/canonico.js';
import { GIORNI_PER_SENTENZA_SENZA_REPLICA } from '../nucleo/multe.js';
import { consegna, leggiRegistro } from '../banca/comandi.js';

const qui = dirname(fileURLToPath(import.meta.url));
export const MODELLO = 'claude-opus-5';
const ISTRUZIONI = readFileSync(join(qui, 'istruzioni.md'), 'utf8');
export const VERSIONE = /^versione:\s*(\S+)/m.exec(ISTRUZIONI)?.[1] ?? 'istruzioni-?';

const SCHEMA = {
  type: 'object',
  properties: {
    esito: { type: 'string', enum: ['annullata', 'confermata'] },
    motivazione: { type: 'string' },
  },
  required: ['esito', 'motivazione'],
  additionalProperties: false,
};

/**
 * I verbali su cui il giudice può decidere adesso.
 * @param {Record<string, any>} stato
 */
export function daDecidere(stato) {
  return Object.entries(stato.verbali ?? {})
    .filter(([, v]) => v.stato === 'contestato' && (v.replica || (stato.n_giorni ?? 0) - v.contestato_giorno >= GIORNI_PER_SENTENZA_SENZA_REPLICA))
    .map(([id, v]) => ({ id, ...v }));
}

/**
 * Il fascicolo: solo ciò che serve a decidere, decifrato con la chiave
 * di vista del giudice. Null se un testo non è leggibile.
 * @param {Record<string, any>} stato @param {any} v @param {import('../nucleo/portafoglio.js').Portafoglio} portafoglio
 */
export function costruisciFascicolo(stato, v, portafoglio) {
  const leggi = (x) => { if (!x) return null; const r = riconosci(x, portafoglio); return r ? decifraCausale(chiaveCausale(r.k), x.memo) : null; };
  const contestazione = leggi(v.contestazione?.giudice);
  const replica = v.replica ? leggi(v.replica) : null;
  if (contestazione === null || (v.replica && replica === null)) return null;
  const az = stato.aziende?.[v.azienda];
  const voce = az?.tariffario?.[v.voce];
  return {
    verbale: { numero: v.numero, voce: v.voce, infrazione: voce?.nome ?? v.voce, regola: voce?.descrizione ?? null, importo_cent: v.amount, giorno: v.giorno },
    tariffario: Object.entries(az?.tariffario ?? {}).map(([codice, x]) => ({ codice, nome: x.nome, regola: x.descrizione ?? null, importo_cent: x.amount })),
    contestazione,
    replica,
  };
}

/**
 * Chiede al modello. Sostituibile nei test.
 * @param {ReturnType<typeof costruisciFascicolo>} fascicolo
 * @returns {Promise<{ esito: 'annullata' | 'confermata', motivazione: string }>}
 */
export async function chiediAlModello(fascicolo) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODELLO,
    max_tokens: 4000,
    system: [{ type: 'text', text: ISTRUZIONI, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `Fascicolo:\n${JSON.stringify(fascicolo, null, 2)}\n\nDecidi secondo le istruzioni.` }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
  });
  if (response.stop_reason === 'refusal') throw new Error(`il modello ha rifiutato: ${response.stop_details?.category ?? ''}`);
  const testo = response.content.find((b) => b.type === 'text')?.text;
  if (!testo) throw new Error('nessuna risposta dal modello');
  const d = JSON.parse(testo);
  if (!['annullata', 'confermata'].includes(d.esito) || typeof d.motivazione !== 'string' || !d.motivazione.trim()) throw new Error('risposta fuori schema');
  return { esito: d.esito, motivazione: d.motivazione.trim().slice(0, 2000) };
}

/**
 * Un giro: per ogni verbale decidibile, fascicolo → modello → sentenza.
 * @param {{ dest: import('../banca/comandi.js').Destinazione, frase: string, chiedi?: typeof chiediAlModello, log?: (m: string) => void }} p
 * @returns {Promise<Array<{ id: string, esito?: string, errore?: string }>>}
 */
export async function giro({ dest, frase, chiedi = chiediAlModello, log = () => {} }) {
  const giudice = identitaRuolo(frase, 'giudice');
  const reg = await leggiRegistro(dest);
  const s = /** @type {any} */ (reg.stato);
  if (!s.giudice) throw new Error('nessun giudice registrato');
  if (s.giudice.chiave !== giudice.chiave.pubblica) throw new Error('questa frase non è quella del giudice registrato');
  if (s.giudice.versione !== VERSIONE) throw new Error(`istruzioni ${VERSIONE}, registrate ${s.giudice.versione}: la banca deve registrare la versione nuova`);
  const esiti = [];
  for (const v of daDecidere(s)) {
    const fascicolo = costruisciFascicolo(s, v, giudice.portafoglio);
    if (!fascicolo) { esiti.push({ id: v.id, errore: 'testi non leggibili con questa chiave' }); continue; }
    let decisione;
    try {
      decisione = await chiedi(fascicolo);
    } catch (e) {
      log(`${v.numero}: nessuna sentenza (${/** @type {Error} */ (e).message})`);
      esiti.push({ id: v.id, errore: /** @type {Error} */ (e).message });
      continue;
    }
    const hashFascicolo = sha256(canonico(fascicolo));
    try {
      await consegna(dest, () => ({ type: 'verdict', body: { verbale: v.id, esito: decisione.esito, motivazione: decisione.motivazione, fascicolo: hashFascicolo, versione: VERSIONE }, firmatari: [giudice.firmatario] }));
      log(`${v.numero}: ${decisione.esito}`);
      esiti.push({ id: v.id, esito: decisione.esito });
    } catch (e) {
      esiti.push({ id: v.id, errore: /** @type {Error} */ (e).message });
    }
  }
  return esiti;
}

/** Un fascicolo di esempio, per provare il modello senza registro. */
export const FASCICOLO_DI_PROVA = {
  verbale: { numero: 'V-27', voce: 'parolaccia', infrazione: 'Parolaccia in sala', regola: 'davanti a clienti o colleghi', importo_cent: 200, giorno: 40 },
  tariffario: [{ codice: 'parolaccia', nome: 'Parolaccia in sala', regola: 'davanti a clienti o colleghi', importo_cent: 200 }, { codice: 'ritardo', nome: 'Ritardo oltre 10 minuti', regola: "sull'orario di turno", importo_cent: 500 }],
  contestazione: 'Stavo citando il cliente che l\'aveva appena detta, tra virgolette, per chiedere al collega come rispondere. Il collega può confermare.',
  replica: 'Confermo che il cliente l\'aveva detta prima. La ripetizione è avvenuta a voce alta, con altri due clienti al banco.',
};

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  const { chiediFrase, mostraFrase } = await import('../strumenti/terminale.js');
  const comando = process.argv[2];
  if (comando === 'nuova-frase') {
    const { generaFrase } = await import('../nucleo/frase.js');
    const f = generaFrase();
    const g = identitaRuolo(f, 'giudice');
    console.log(mostraFrase(f, 'Frase del giudice'));
    console.log('chiave pubblica del giudice: ' + g.chiave.pubblica);
    console.log('coordinate del giudice:      ' + g.portafoglio.coordinate);
    console.log('versione delle istruzioni:   ' + VERSIONE);
    process.exit(0);
  }
  if (comando === 'prova') {
    console.log(`modello ${MODELLO}, istruzioni ${VERSIONE}. Fascicolo di prova:\n${JSON.stringify(FASCICOLO_DI_PROVA, null, 2)}\n`);
    const d = await chiediAlModello(FASCICOLO_DI_PROVA);
    console.log(`esito: ${d.esito}\nmotivazione: ${d.motivazione}`);
    process.exit(0);
  }
  const dest = process.env.MANTI_SERVER ? { server: process.env.MANTI_SERVER } : (process.env.MANTI_LEDGER ?? 'ledger.jsonl');
  const frase = await chiediFrase('Frase del giudice');
  if (comando === 'chiavi') {
    const g = identitaRuolo(frase, 'giudice');
    console.log('chiave pubblica del giudice: ' + g.chiave.pubblica);
    console.log('coordinate del giudice:      ' + g.portafoglio.coordinate);
    console.log('versione delle istruzioni:   ' + VERSIONE);
    process.exit(0);
  }
  const unaVolta = process.argv.includes('--una-volta');
  const log = (m) => console.log(`${new Date().toISOString()} ${m}`);
  log(`giudice: modello ${MODELLO}, istruzioni ${VERSIONE}`);
  do {
    try {
      const esiti = await giro({ dest, frase, log });
      if (!esiti.length) log('niente da decidere');
    } catch (e) { log(`errore: ${/** @type {Error} */ (e).message}`); }
    if (!unaVolta) await new Promise((r) => setTimeout(r, 5 * 60 * 1000));
  } while (!unaVolta);
}
