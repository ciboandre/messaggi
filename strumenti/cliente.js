// Parlare con il server (server/server.js) da un programma: leggere il
// registro, costruire una riga sulla posizione proposta, mandarla, e
// rifirmarla una volta se nel frattempo è entrata un'altra riga.

import { request as richiestaHttps } from 'node:https';
import { request as richiestaHttp } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Registro } from '../nucleo/registro.js';
import { righeDaJsonl } from '../nucleo/registro-file.js';
import { preparaRiga, firmaRiga } from '../nucleo/registro.js';
import { tipi } from '../nucleo/tipi.js';

/**
 * L'autorità di casa (mkcert), se c'è: Node non usa il portachiavi del
 * sistema, quindi gliela passiamo noi. MANTI_CA la indica a mano.
 */
function autoritaDiCasa() {
  const candidati = [process.env.MANTI_CA, process.env.NODE_EXTRA_CA_CERTS,
    join(homedir(), 'Library', 'Application Support', 'mkcert', 'rootCA.pem'),
    join(homedir(), '.local', 'share', 'mkcert', 'rootCA.pem')].filter(Boolean);
  const f = candidati.find((c) => existsSync(c));
  return f ? readFileSync(f) : undefined;
}
const CA = autoritaDiCasa();

/**
 * Una richiesta al server, http o https, con l'autorità di casa se serve.
 * @param {string} url @param {{ method?: string, body?: string }} [opz]
 * @returns {Promise<{ status: number, text: string }>}
 */
export function richiesta(url, opz = {}) {
  const u = new URL(url);
  const fai = u.protocol === 'https:' ? richiestaHttps : richiestaHttp;
  return new Promise((ok, no) => {
    const req = fai(u, { method: opz.method ?? 'GET', headers: opz.body ? { 'content-type': 'application/json' } : {}, ...(CA && u.protocol === 'https:' ? { ca: CA } : {}) }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => ok({ status: res.statusCode ?? 0, text: b }));
    });
    req.on('error', (e) => no(new Error(`il server ${u.origin} non risponde (${/** @type {any} */ (e).code ?? e.message})`)));
    if (opz.body) req.write(opz.body);
    req.end();
  });
}

/** Il registro intero dal server, verificato in locale. */
export async function registroDalServer(url) {
  const r = await richiesta(`${url}/registro`);
  if (r.status !== 200) throw new Error(`server: ${r.status}`);
  return Registro.daRighe(righeDaJsonl(r.text), { tipi });
}

/**
 * Costruisce, firma e manda una riga. `costruisci(registro)` restituisce
 * { type, body, firmatari }; viene richiamato se il server risponde 409,
 * perché il body può dipendere dallo stato (esche, prezzo del giorno).
 * @param {string} url
 * @param {(reg: Registro) => { type: string, body: Record<string, unknown>, firmatari: any[] }} costruisci
 * @param {number} [tentativi]
 */
export async function inviaRiga(url, costruisci, tentativi = 2) {
  let ultimoErrore = null;
  for (let i = 0; i < tentativi; i++) {
    const reg = await registroDalServer(url);
    const { type, body, firmatari } = costruisci(reg);
    const p = JSON.parse((await richiesta(`${url}/prossima`)).text);
    if (p.prev !== (reg.ultima ? reg.ultima.hash : '0'.repeat(64))) continue; // il registro è cambiato mentre lo leggevamo
    const riga = firmaRiga(preparaRiga(reg.ultima, { type, body, ts: p.ts }), firmatari);
    const r = await richiesta(`${url}/righe`, { method: 'POST', body: JSON.stringify(riga) });
    const esito = JSON.parse(r.text);
    if (r.status === 201) return { riga, ...esito };
    if (r.status === 409) { ultimoErrore = esito.errore; continue; }
    throw new Error(esito.errore ?? `server: ${r.status}`);
  }
  throw new Error(ultimoErrore ?? 'il registro cambia troppo in fretta: riprova');
}
