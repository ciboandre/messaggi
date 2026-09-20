// Cose comuni ai pannelli: la frase del ruolo cifrata con il PIN, l'invio
// delle righe al server con rifirma, l'anagrafica dei dipendenti nel
// browser, i formati.

import { preparaRiga, firmaRiga } from '../nucleo/registro.js';
import { Conto } from '../app/portafoglio-app.js';

export const $ = (sel) => document.querySelector(sel);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const it = (n, d) => Number(n).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
export const manti = (cent) => it(Number(cent) / 100, 2);
export const euro = (cent) => (cent === null || cent === undefined ? '—' : it(Number(cent) / 100, 2) + ' €');
export const prezzo = (dm) => (dm === null || dm === undefined ? '—' : it(Number(dm) / 10000, 4) + ' €');
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
export const giornoBreve = (data) => (data ? `${Number(data.slice(8, 10))} ${MESI[Number(data.slice(5, 7)) - 1]}` : '—');
export const centesimi = (testo) => { const m = String(testo).trim().match(/^(\d+)(?:[.,](\d{1,2}))?$/); if (!m) throw new Error(`importo non valido: ${testo}`); return Number(m[1]) * 100 + Number((m[2] ?? '0').padEnd(2, '0')); };
export const SERVER = localStorage.getItem('manti.server') ?? location.origin;
export const SIMBOLO = '<svg class="sym"><use href="#manto"/></svg>';

/** Le parole di un ruolo, cifrate con il PIN, in questo browser. Una per ruolo. */
export const cassaforte = {
  async chiave(pin, sale) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: sale, iterations: 300000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  },
  async salva(ruolo, frase, pin) {
    const sale = crypto.getRandomValues(new Uint8Array(16));
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const k = await this.chiave(pin, sale);
    const cifrato = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, k, new TextEncoder().encode(frase)));
    localStorage.setItem(`manti.${ruolo}`, JSON.stringify({ sale: [...sale], nonce: [...nonce], cifrato: [...cifrato] }));
  },
  async apri(ruolo, pin) {
    const c = JSON.parse(localStorage.getItem(`manti.${ruolo}`));
    const k = await this.chiave(pin, new Uint8Array(c.sale));
    try { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(c.nonce) }, k, new Uint8Array(c.cifrato))); } catch { return null; }
  },
  esiste(ruolo) { return localStorage.getItem(`manti.${ruolo}`) !== null; },
  cancella(ruolo) { localStorage.removeItem(`manti.${ruolo}`); },
};

/**
 * L'anagrafica dei dipendenti: sta nel browser dell'azienda (e in quello
 * della polizia, importata), mai nel registro.
 * @typedef {{ nome: string, coordinate: string, dal: string, attivo: boolean }} Dipendente
 */
export const anagrafica = {
  tutti() { return /** @type {Dipendente[]} */ (JSON.parse(localStorage.getItem('manti.dipendenti') ?? '[]')); },
  salva(lista) { localStorage.setItem('manti.dipendenti', JSON.stringify(lista)); },
  attivi() { return this.tutti().filter((d) => d.attivo); },
};

/** Le bozze (premi, verbali ↔ dipendenti) del pannello, nel browser. */
export const bozze = {
  leggi(nome, vuoto) { return JSON.parse(localStorage.getItem(`manti.bozza.${nome}`) ?? JSON.stringify(vuoto)); },
  scrivi(nome, valore) { localStorage.setItem(`manti.bozza.${nome}`, JSON.stringify(valore)); },
};

/** Costruisce, firma e manda una riga; rifirma una volta se il registro è cambiato nel frattempo. */
export async function invia(conto, costruisci) {
  if (conto.solaLettura) throw new Error('Questo indirizzo mostra solo il registro. Serve il server della banca.');
  for (let tentativo = 0; tentativo < 2; tentativo++) {
    await conto.aggiorna();
    const { type, body, firmatari } = costruisci(conto.registro);
    const p = await (await fetch(`${SERVER}/prossima`)).json();
    if (p.prev !== (conto.registro.ultima ? conto.registro.ultima.hash : '0'.repeat(64))) continue;
    const riga = firmaRiga(preparaRiga(conto.registro.ultima, { type, body, ts: p.ts }), firmatari);
    const r = await fetch(`${SERVER}/righe`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(riga) });
    const esito = await r.json();
    if (r.status === 201) { await conto.aggiorna(); return esito; }
    if (r.status !== 409) throw new Error(esito.errore ?? `server: ${r.status}`);
  }
  throw new Error('il registro è cambiato mentre firmavi: riprova');
}

/** Il conto del ruolo (portafoglio) collegato al server. */
export function apriConto(portafoglio) {
  return new Conto(SERVER, portafoglio);
}

/** Il menu laterale del mockup: sezioni con àncora, la prima attiva. */
export function menu(voci) {
  return `<nav class="menu">${voci.map((v) => (typeof v === 'string' ? `<div class="cap">${esc(v)}</div>` : `<a href="#${esc(v.id)}">${esc(v.nome)}${v.pill ? ` <span class="pill warn">${esc(v.pill)}</span>` : ''}</a>`)).join('')}</nav>`;
}
