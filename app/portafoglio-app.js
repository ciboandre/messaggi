// La parte dell'app che parla con il registro: scarica le righe dal server
// una volta e poi solo le nuove, ricostruisce lo stato con le stesse regole
// del motore, riconosce le proprie entrate e ricostruisce i movimenti.
// Niente interfaccia qui: app.js disegna, questo file sa.

import { Registro } from '../nucleo/registro.js';
import { righeDaJsonl } from '../nucleo/registro-file-browser.js';
import { tipi } from '../nucleo/tipi.js';
import { riconosci, chiaveCausale } from '../nucleo/portafoglio.js';
import { decifraCausale } from '../nucleo/causale.js';
import { apriUscita } from '../nucleo/impegni.js';
import { immagineChiave } from '../nucleo/anello.js';
import { mieEntrate } from '../nucleo/pagamento.js';
import { valore, prezzoConversione, euroPerManti } from '../nucleo/banca.js';
import { definitivoNonSaldato } from '../nucleo/multe.js';

export class Conto {
  /** @param {string} server @param {import('../nucleo/portafoglio.js').Portafoglio} portafoglio */
  constructor(server, portafoglio) {
    this.server = server;
    this.portafoglio = portafoglio;
    this.registro = new Registro({ tipi });
    /** @type {Set<string>} le immagini di chiave delle mie uscite: se compaiono in una riga, l'ho spesa io */
    this.immagini = new Set();
    /** @type {Map<string, any>} ref → la mia entrata (anche se poi spesa) */
    this.mie = new Map();
  }

  /** Scarica le righe nuove e le verifica. */
  async aggiorna() {
    const da = this.registro.righe.length;
    let r = await fetch(`${this.server}/registro?da=${da}`, { cache: 'no-store' });
    let nuove;
    if (r.ok) {
      nuove = righeDaJsonl(await r.text());
    } else {
      // senza server (il sito pubblico): il registro intero accanto alla pagina, in sola lettura
      r = await fetch(`${this.server}/ledger.jsonl`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`server: ${r.status}`);
      this.solaLettura = true;
      nuove = righeDaJsonl(await r.text()).slice(da);
    }
    for (const riga of nuove) {
      this.registro.accoda(riga);
      this.#scandaglia(riga);
    }
    return nuove.length;
  }

  /** Per ogni riga nuova: quali uscite sono mie. */
  #scandaglia(riga) {
    const out = riga.body?.out;
    if (!Array.isArray(out)) return;
    const s = this.registro.stato;
    for (const [i, u] of out.entries()) {
      if (!u || u.addr === null) continue;
      const r = riconosci(u, this.portafoglio);
      if (!r) continue;
      let amount = u.amount;
      if (amount === undefined) {
        const aperta = apriUscita(u, r.k);
        if (!aperta) continue;
        amount = Number(aperta.a);
      }
      const img = immagineChiave(r.p);
      this.immagini.add(img);
      this.mie.set(`${riga.hash}:${i}`, { seq: riga.seq, ts: riga.ts, amount, tag: u.tag ?? null, causale: u.memo ? decifraCausale(chiaveCausale(r.k), u.memo) : null, img, tipo: riga.type, azienda: riga.body.azienda ?? null });
    }
  }

  get stato() { return this.registro.stato; }
  get valore() { return valore(this.registro.stato); }

  /** In euro al valore di oggi (null se non c'è valore). */
  inEuro(mantiCent) {
    const v = this.valore;
    return v === null ? null : (BigInt(mantiCent) * v) / 10000n;
  }

  /** Le entrate spendibili e il saldo. */
  disponibili() { return mieEntrate(this.registro, this.portafoglio); }
  saldo() { return this.disponibili().reduce((s, e) => s + e.amount, 0); }

  /**
   * I movimenti, dal più recente: entrate ricevute e righe in cui ho speso.
   * Per una riga in cui ho speso: uscita = somma delle mie entrate consumate
   * − quello che mi è tornato nella stessa riga (il resto).
   */
  movimenti() {
    const s = /** @type {any} */ (this.registro.stato);
    const perRiga = new Map();
    for (const [ref, e] of this.mie) {
      const hash = ref.split(':')[0];
      const m = perRiga.get(hash) ?? { seq: e.seq, ts: e.ts, tipo: e.tipo, ricevuto: 0, speso: 0, voci: [], hash };
      m.ricevuto += e.amount;
      m.voci.push(e);
      perRiga.set(hash, m);
    }
    for (const riga of this.registro.righe) {
      const mieImg = (riga.sigs ?? []).filter((f) => f.img && this.immagini.has(f.img)).map((f) => f.img);
      if (!mieImg.length) continue;
      const m = perRiga.get(riga.hash) ?? { seq: riga.seq, ts: riga.ts, tipo: riga.type, ricevuto: 0, speso: 0, voci: [], hash: riga.hash };
      for (const img of mieImg) {
        const e = [...this.mie.values()].find((x) => x.img === img);
        if (e) m.speso += e.amount;
      }
      m.ref = riga.body.ref ?? null;
      if (riga.type === 'conversion.request') m.conversione = s.conversioni?.[riga.hash] ?? null;
      perRiga.set(riga.hash, m);
    }
    const lista = [...perRiga.values()].map((m) => {
      const netto = m.ricevuto - m.speso;
      const voce = m.voci[0];
      let titolo; let sotto = '';
      if (m.speso > 0 && m.tipo === 'transfer' && m.ref) titolo = `Multa pagata · ${s.verbali?.[m.ref]?.numero ?? ''}`;
      else if (m.speso > 0 && m.tipo === 'transfer') titolo = 'Pagamento';
      else if (m.speso > 0 && m.tipo === 'conversion.request') { titolo = 'Convertiti in euro'; sotto = m.conversione ? (m.conversione.stato === 'richiesta' ? 'in attesa della banca' : m.conversione.stato === 'eseguita' ? `a ${(Number(m.conversione.prezzo) / 10000).toFixed(4)} · in pagamento` : `a ${(Number(m.conversione.prezzo) / 10000).toFixed(4)} · pagata`) : ''; }
      else if (m.speso > 0 && m.tipo === 'payout') titolo = 'Stipendi pagati';
      else if (voce?.tag === 'vendita') titolo = 'Comprati dalla banca';
      else if (voce?.tag === 'stipendio') { titolo = 'Stipendio'; sotto = `da ${s.aziende?.[voce.azienda]?.nome ?? 'azienda'}`; }
      else if (voce?.tag === 'premio') { titolo = 'Premio'; sotto = `da ${s.aziende?.[voce.azienda]?.nome ?? 'azienda'}`; }
      else if (voce?.tag === 'multa') titolo = 'Multa incassata';
      else titolo = 'Ricevuti';
      const causale = m.voci.map((v) => v.causale).find(Boolean);
      return { seq: m.seq, ts: m.ts, titolo, sotto: [sotto, causale ? `"${causale}"` : '', `riga ${m.seq}`].filter(Boolean).join(' · '), netto, hash: m.hash };
    });
    return lista.sort((a, b) => b.seq - a.seq);
  }

  /** I miei verbali: quelli con l'indirizzo di consegna che riconosco. */
  verbali() {
    const s = /** @type {any} */ (this.registro.stato);
    const lista = [];
    for (const [id, v] of Object.entries(s.verbali ?? {})) {
      const r = riconosci(v.consegna, this.portafoglio);
      if (!r) continue;
      const az = s.aziende?.[v.azienda];
      lista.push({
        id, ...v, p: r.p,
        descrizione: decifraCausale(chiaveCausale(r.k), v.consegna.memo),
        nomeVoce: az?.tariffario?.[v.voce]?.nome ?? v.voce, nomeAzienda: az?.nome ?? '',
        giorniRestanti: s.genesi.parametri.giorni_multa - ((s.n_giorni ?? 0) - v.giorno),
        definitivo: definitivoNonSaldato(s, v),
      });
    }
    return lista.sort((a, b) => b.giorno - a.giorno);
  }

  /** Quanto renderebbero oggi dei manti convertiti. */
  euroSeConverto(mantiCent) {
    const p = prezzoConversione(this.registro.stato);
    return p === null ? null : euroPerManti(BigInt(mantiCent), p);
  }
}
