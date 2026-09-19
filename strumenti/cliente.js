// Parlare con il server (server/server.js) da un programma: leggere il
// registro, costruire una riga sulla posizione proposta, mandarla, e
// rifirmarla una volta se nel frattempo è entrata un'altra riga.

import { Registro } from '../nucleo/registro.js';
import { righeDaJsonl } from '../nucleo/registro-file.js';
import { preparaRiga, firmaRiga } from '../nucleo/registro.js';
import { tipi } from '../nucleo/tipi.js';

/** Il registro intero dal server, verificato in locale. */
export async function registroDalServer(url) {
  const r = await fetch(`${url}/registro`);
  if (!r.ok) throw new Error(`server: ${r.status}`);
  return Registro.daRighe(righeDaJsonl(await r.text()), { tipi });
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
    const p = await (await fetch(`${url}/prossima`)).json();
    if (p.prev !== (reg.ultima ? reg.ultima.hash : '0'.repeat(64))) continue; // il registro è cambiato mentre lo leggevamo
    const riga = firmaRiga(preparaRiga(reg.ultima, { type, body, ts: p.ts }), firmatari);
    const r = await fetch(`${url}/righe`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(riga) });
    const esito = await r.json();
    if (r.status === 201) return { riga, ...esito };
    if (r.status === 409) { ultimoErrore = esito.errore; continue; }
    throw new Error(esito.errore ?? `server: ${r.status}`);
  }
  throw new Error(ultimoErrore ?? 'il registro cambia troppo in fretta: riprova');
}
