// L'app del correntista, dal mockup (mockup/index.html, vista "app").
//
// Schermate: primo avvio (crea il conto / ho già le dodici parole), le
// parole da scrivere e ricontrollare, il PIN, il conto con saldo e
// movimenti, ricevi con QR, inquadra, bonifico, compra, converti, multe,
// contestazione, rubrica, sicurezza. Il nucleo è lo stesso del server e
// del motore: l'app costruisce e firma le righe e le manda al server.
//
// Le dodici parole stanno nel telefono cifrate con il PIN (PBKDF2 +
// AES-GCM di WebCrypto), mai altrove. La banca non ne ha copia.

import qrcode from 'qrcode-generator';
import { generaFrase, fraseValida, normalizzaFrase } from '../nucleo/frase.js';
import { portafoglioDaFrase, creaIndirizzo, chiaveCausale, decodificaCoordinate, coordinateLeggibili } from '../nucleo/portafoglio.js';
import { cifraCausale } from '../nucleo/causale.js';
import { firmaScalare } from '../nucleo/chiavi.js';
import { preparaRiga, firmaRiga } from '../nucleo/registro.js';
import { costruisciPagamentoRiservato, costruisciRichiestaConversione } from '../nucleo/pagamento.js';
import { prezzoAcquisto } from '../nucleo/banca.js';
import { Conto } from './portafoglio-app.js';

const $ = (sel) => document.querySelector(sel);
const corpo = $('#corpo');
const tabbar = $('#tabbar');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const it = (n, d) => Number(n).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
const manti = (cent) => it(Number(cent) / 100, 2);
const euro = (cent) => (cent === null ? '—' : it(Number(cent) / 100, 2) + ' €');
const prezzo = (dm) => (dm === null ? '—' : it(Number(dm) / 10000, 3) + ' €');
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const giornoBreve = (data) => (data ? `${Number(data.slice(8, 10))} ${MESI[Number(data.slice(5, 7)) - 1]}` : '—');
const SIMBOLO = '<svg class="sym"><use href="#manto"/></svg>';
const SERVER = localStorage.getItem('manti.server') ?? location.origin;

// ── cassaforte: le parole cifrate con il PIN ──

const cassaforte = {
  async chiave(pin, sale) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: sale, iterations: 300000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  },
  async salva(frase, pin) {
    const sale = crypto.getRandomValues(new Uint8Array(16));
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const k = await this.chiave(pin, sale);
    const cifrato = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, k, new TextEncoder().encode(frase)));
    localStorage.setItem('manti.conto', JSON.stringify({ sale: [...sale], nonce: [...nonce], cifrato: [...cifrato] }));
  },
  async apri(pin) {
    const c = JSON.parse(localStorage.getItem('manti.conto'));
    const k = await this.chiave(pin, new Uint8Array(c.sale));
    try {
      return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(c.nonce) }, k, new Uint8Array(c.cifrato)));
    } catch {
      return null;
    }
  },
  esiste() { return localStorage.getItem('manti.conto') !== null; },
  cancella() { localStorage.removeItem('manti.conto'); },
};

const rubrica = {
  tutti() { return JSON.parse(localStorage.getItem('manti.rubrica') ?? '[]'); },
  aggiungi(nome, coordinate) { localStorage.setItem('manti.rubrica', JSON.stringify([...this.tutti().filter((c) => c.coordinate !== coordinate), { nome, coordinate }])); },
  togli(coordinate) { localStorage.setItem('manti.rubrica', JSON.stringify(this.tutti().filter((c) => c.coordinate !== coordinate))); },
};

// ── stato dell'app ──

let frase = null;
let portafoglio = null;
/** @type {Conto | null} */
let conto = null;

function mostra(html, { tab = null } = {}) {
  corpo.innerHTML = html;
  corpo.scrollTo(0, 0);
  window.scrollTo(0, 0);
  tabbar.hidden = tab === null;
  for (const d of tabbar.children) d.classList.toggle('on', d.dataset.vai === tab);
  const daPagare = conto ? conto.verbali().filter((v) => v.stato === 'aperto').length : 0;
  tabbar.children[1].classList.toggle('badge', daPagare > 0);
}
const titolo = (t, indietro) => `<div class="titolo-schermo">${indietro ? `<span class="back" data-vai="${indietro}">‹</span>` : ''}<h2>${esc(t)}</h2></div>`;
const errore = (e) => `<div class="nota bad piccolo">${esc(e?.message ?? e)}</div>`;

async function conServer(fn) {
  try {
    return await fn();
  } catch (e) {
    throw new Error(/fetch/i.test(String(e.message)) ? `Il server ${SERVER} non risponde. Controlla la rete o l'indirizzo in Sicurezza.` : e.message);
  }
}

/** Costruisce, firma e manda una riga; rifirma una volta se il registro è cambiato nel frattempo. */
async function invia(costruisci) {
  if (conto.solaLettura) throw new Error('Questo indirizzo mostra solo il registro. Per pagare serve il server della banca: mettilo in Sicurezza.');
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

// ── schermate ──

const schermate = {
  avvio() {
    mostra(`
      <div class="splash" style="margin-top:8px">
        <div class="logo"><svg class="sym sym-tile"><use href="#manto"/></svg></div>
        <h2>Manti</h2>
        <p>La banca dei manti. Il conto lo crei tu, qui.</p>
      </div>
      <div class="form" style="margin-top:14px">
        <div class="blocco">
          <b>Apri il conto</b>
          <p class="piccolo muto">Non serve un'email, un numero, un documento o il permesso di nessuno. Ti mostreremo <b>dodici parole</b>: scrivile su carta. Sono l'unico modo per ritrovare i tuoi manti se cambi telefono. Nessuno ne ha una copia, nemmeno la banca.</p>
          <button class="btn primario largo" data-vai="parole">Crea il conto</button>
          <button class="btn largo" data-vai="recupera">Ho già le dodici parole</button>
        </div>
        <div class="nota info piccolo">Con il conto ricevi manti da chiunque, paghi con QR e fai bonifici. Se lavori in azienda, mostra le tue coordinate all'ufficio: riceverai stipendio e premi, e comparirà la sezione Multe. Per convertire in euro dovrai farti identificare dalla banca, una volta.</p>
      </div>`);
  },

  parole() {
    const nuova = generaFrase();
    const parole = nuova.split(' ');
    mostra(`${titolo('Le tue dodici parole', 'avvio')}
      <div class="form">
        <div class="blocco">
          <p class="piccolo muto">Scrivile su carta, nell'ordine. Non fare uno screenshot: chi ha queste parole ha i tuoi manti.</p>
          <div class="parole">${parole.map((p) => `<span>${esc(p)}</span>`).join('')}</div>
        </div>
        <button class="btn primario largo" id="scritte">Le ho scritte</button>
      </div>`);
    $('#scritte').onclick = () => schermate.controllo(nuova);
  },

  controllo(nuova) {
    const parole = nuova.split(' ');
    const chieste = [2, 6, 11].map((i) => ({ i, p: parole[i] }));
    mostra(`${titolo('Controllo', 'parole')}
      <div class="form">
        <div class="blocco"><p class="piccolo muto">Riscrivi tre parole dal foglio, così siamo sicuri che sia giusto.</p>
          ${chieste.map((c) => `<div class="campo"><label>Parola numero ${c.i + 1}</label><input data-i="${c.i}" autocapitalize="none" autocomplete="off" spellcheck="false"></div>`).join('')}
          <div class="errore" id="err"></div>
        </div>
        <button class="btn primario largo" id="avanti">Avanti</button>
      </div>`);
    $('#avanti').onclick = () => {
      const ok = chieste.every((c) => $(`input[data-i="${c.i}"]`).value.trim().toLowerCase() === c.p);
      if (!ok) { $('#err').textContent = 'Una parola non torna: ricontrolla il foglio.'; return; }
      schermate.pin(nuova, true);
    };
  },

  recupera() {
    mostra(`${titolo('Ho già le dodici parole', 'avvio')}
      <div class="form">
        <div class="blocco">
          <div class="campo"><label>Le dodici parole, separate da spazi</label><textarea id="frase" autocapitalize="none" autocomplete="off" spellcheck="false"></textarea></div>
          <div class="errore" id="err"></div>
        </div>
        <button class="btn primario largo" id="avanti">Avanti</button>
      </div>`);
    $('#avanti').onclick = () => {
      const f = normalizzaFrase($('#frase').value);
      if (!fraseValida(f)) { $('#err').textContent = 'La frase non è valida: dodici parole della lista italiana, e il controllo deve tornare.'; return; }
      schermate.pin(f, true);
    };
  },

  pin(fraseDaSalvare = null, nuovo = false) {
    mostra(`${titolo(nuovo ? 'Scegli un PIN' : 'PIN')}
      <div class="form">
        <div class="blocco">
          <p class="piccolo muto">${nuovo ? "Sei cifre. Serve per aprire l'app su questo telefono: le parole restano cifrate qui dentro con questo PIN." : 'Per aprire il conto.'}</p>
          <div class="pin"><input id="pin" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" style="width:100%;border:0;background:transparent;font:inherit;text-align:center;letter-spacing:.3em;outline:none"></div>
          <div class="errore" id="err"></div>
        </div>
        <button class="btn primario largo" id="apri">${nuovo ? 'Salva' : 'Apri'}</button>
        ${nuovo ? '' : '<button class="btn largo" id="altro">Ho un altro conto: ho le dodici parole</button>'}
      </div>`);
    $('#pin').focus();
    const vai = async () => {
      const pin = $('#pin').value;
      if (!/^\d{6}$/.test(pin)) { $('#err').textContent = 'Sei cifre.'; return; }
      if (nuovo) { await cassaforte.salva(fraseDaSalvare, pin); frase = fraseDaSalvare; } else {
        frase = await cassaforte.apri(pin);
        if (!frase) { $('#err').textContent = 'PIN sbagliato.'; return; }
      }
      await apriConto();
    };
    $('#apri').onclick = vai;
    $('#pin').onkeydown = (e) => { if (e.key === 'Enter') vai(); };
    if ($('#altro')) $('#altro').onclick = () => { if (confirm('Cancella il conto da questo telefono? Con le parole lo ritrovi.')) { cassaforte.cancella(); schermate.avvio(); } };
  },

  async conto() {
    const saldo = conto.saldo();
    const verbali = conto.verbali().filter((v) => v.stato === 'aperto');
    const mov = conto.movimenti();
    const v = conto.valore;
    mostra(`
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0 14px">
        <div class="av me">tu</div>
        <div class="seg" style="width:180px"><span class="on">Manti</span><span id="seg-euro">Euro</span></div>
        <div class="av" data-vai="sicurezza">⚙</div>
      </div>
      <div class="saldo-card">
        <div class="tasso">1 manto = ${prezzo(v)}${conto.stato.serie?.length > 1 ? ' ▲' : ''}</div>
        <div class="l">Saldo</div>
        <div class="m">${SIMBOLO}${manti(saldo)}<small>manti</small></div>
        <div class="e">${conto.euroSeConverto(saldo) === null ? 'nessun valore ancora: manca la prima vendita' : `≈ ${euro(conto.euroSeConverto(saldo))} se converti oggi`} · registro al ${giornoBreve(conto.stato.giorno)}</div>
      </div>
      <div class="azioni">
        <button class="p" data-vai="ricevi"><i>＋</i>Ricevi</button>
        <button data-vai="inquadra"><i>▣</i>Inquadra</button>
        <button data-vai="bonifico"><i>→</i>Bonifico</button>
        <button data-vai="compra"><i>€</i>Compra</button>
      </div>
      ${verbali.length ? `<div class="nota bad piccolo" style="margin-bottom:14px;display:flex;justify-content:space-between;align-items:center"><span><b>${verbali.length} mult${verbali.length === 1 ? 'a' : 'e'} da pagare</b> · ${esc(verbali[0].numero)} · ${manti(verbali[0].amount)} manti · ${verbali[0].giorniRestanti > 0 ? `${verbali[0].giorniRestanti} giorni` : 'scaduta'}</span><a data-vai="multe">Apri</a></div>` : ''}
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px"><h3>Movimenti</h3><a class="piccolo" data-vai="converti">Converti in euro</a></div>
      <div class="lista">
        ${mov.length ? mov.map((m) => `<div class="voce"><div class="av ${m.netto >= 0 ? (m.titolo.startsWith('Stipendio') || m.titolo.startsWith('Premio') ? 'premio' : 'ok') : (m.titolo.startsWith('Multa') ? 'multa' : '')}">${m.netto >= 0 ? '↓' : m.titolo.startsWith('Multa') ? '!' : m.titolo.startsWith('Convertiti') ? '€' : '↑'}</div><div class="t"><b>${esc(m.titolo)}</b><span>${esc(giornoBreve(m.ts.slice(0, 10)))} · ${esc(m.sotto)}</span></div><div class="imp ${m.netto >= 0 ? 'piu' : ''}">${m.netto >= 0 ? '+' : '−'}${manti(Math.abs(m.netto))}<small>${euro(conto.inEuro(Math.abs(m.netto)))}</small></div></div>`).join('') : '<div class="voce"><div class="t muto piccolo">Ancora nessun movimento. Per avere manti: fatti pagare da qualcuno, o compra dalla banca.</div></div>'}
      </div>`, { tab: 'conto' });
  },

  ricevi() {
    const ind = creaIndirizzo(portafoglio.coordinate); // solo per il QR: le coordinate bastano, l'indirizzo lo fa chi paga
    let importo = ''; let causale = '';
    const disegna = () => {
      const testo = `manti:${portafoglio.coordinate}${importo || causale ? `?${importo ? `i=${Math.round(Number(importo.replace(',', '.')) * 100)}` : ''}${importo && causale ? '&' : ''}${causale ? `c=${encodeURIComponent(causale)}` : ''}` : ''}`;
      const qr = qrcode(0, 'M');
      qr.addData(testo, 'Byte');
      qr.make();
      $('#qr').innerHTML = qr.createSvgTag({ scalable: true, margin: 0 });
      $('#link').value = testo;
    };
    mostra(`${titolo('Ricevi', 'conto')}
      <div class="form">
        <div class="blocco" style="gap:12px;text-align:center">
          <div class="qr" id="qr"></div>
          <div class="coord">${esc(coordinateLeggibili(portafoglio.coordinate).slice(0, 34))} …</div>
          <div class="piccolo muto">Chi inquadra paga a te, su un indirizzo nuovo che solo tu riconosci. Nessun altro potrà collegarlo a te.</div>
        </div>
        <div class="campo"><label style="text-align:center">Importo richiesto, facoltativo</label><div class="importo-in"><input id="imp" inputmode="decimal" placeholder="0,00"></div></div>
        <div class="campo"><label for="cau">Causale, la legge solo chi paga</label><input id="cau" type="text" maxlength="140"></div>
        <input id="link" type="text" readonly class="mono" style="width:100%;padding:10px;border:0;border-radius:12px;background:var(--surface-2);color:var(--ink-2)">
        <button class="btn primario largo" id="condividi">Condividi link di pagamento</button>
        <button class="btn largo" id="copia">Copia le mie coordinate</button>
        <p class="piccolo muto" style="text-align:center">Le coordinate sono come un IBAN: chi le ha può inviarti manti, anche se non lavora in azienda. Non può vedere il tuo saldo.</p>
      </div>`, { tab: 'conto' });
    disegna();
    $('#imp').oninput = (e) => { importo = e.target.value; disegna(); };
    $('#cau').oninput = (e) => { causale = e.target.value; disegna(); };
    $('#condividi').onclick = async () => { const t = $('#link').value; if (navigator.share) await navigator.share({ text: t }).catch(() => {}); else { await navigator.clipboard.writeText(t); $('#condividi').textContent = 'Copiato'; } };
    $('#copia').onclick = async () => { await navigator.clipboard.writeText(portafoglio.coordinate); $('#copia').textContent = 'Copiate'; };
    void ind;
  },

  inquadra() {
    mostra(`${titolo('Inquadra', 'conto')}
      <div class="form">
        <video id="video" class="video" playsinline muted></video>
        <p class="piccolo muto" style="text-align:center">Inquadra il QR di chi vuoi pagare.</p>
        <div class="campo"><label>Oppure incolla il link o le coordinate</label><input id="testo" type="text" autocapitalize="none"></div>
        <button class="btn largo" id="usa">Usa</button>
        <div class="errore" id="err"></div>
      </div>`, { tab: 'conto' });
    let fermo = false;
    const video = $('#video');
    const canvas = document.createElement('canvas');
    const leggi = (testo) => {
      const m = String(testo).trim().match(/^(?:manti:)?(mnt1[a-z0-9]+)(?:\?(.*))?$/i);
      if (!m) { $('#err').textContent = 'Non è un QR dei manti.'; return; }
      const q = new URLSearchParams(m[2] ?? '');
      fermo = true;
      if (video.srcObject) video.srcObject.getTracks().forEach((t) => t.stop());
      schermate.bonifico({ coordinate: m[1].toLowerCase(), importo: q.get('i') ? (Number(q.get('i')) / 100).toFixed(2).replace('.', ',') : '', causale: q.get('c') ?? '' });
    };
    $('#usa').onclick = () => leggi($('#testo').value);
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' } }).then((stream) => {
      video.srcObject = stream;
      video.play();
      const ciclo = () => {
        if (fermo || !video.videoWidth) { if (!fermo) requestAnimationFrame(ciclo); return; }
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const codice = globalThis.jsQR?.(img.data, img.width, img.height);
        if (codice?.data) leggi(codice.data); else requestAnimationFrame(ciclo);
      };
      requestAnimationFrame(ciclo);
    }).catch(() => { video.remove(); $('#err').textContent = 'Fotocamera non disponibile: incolla il link.'; });
    corpo.addEventListener('click', (e) => { if (e.target.closest('[data-vai]')) { fermo = true; video.srcObject?.getTracks().forEach((t) => t.stop()); } }, { once: true });
  },

  bonifico(pre = {}) {
    const saldo = conto.saldo();
    const contatti = rubrica.tutti();
    mostra(`${titolo('Bonifico', 'conto')}
      <div class="form">
        <div class="campo"><label for="dest">A chi</label>
          ${contatti.length ? `<select id="rub"><option value="">— dalla rubrica —</option>${contatti.map((c) => `<option value="${esc(c.coordinate)}">${esc(c.nome)}</option>`).join('')}</select>` : ''}
          <input id="dest" type="text" placeholder="coordinate mnt1…" autocapitalize="none" value="${esc(pre.coordinate ?? '')}"></div>
        <div class="campo"><div class="importo-in"><input id="imp" inputmode="decimal" placeholder="0,00" value="${esc(pre.importo ?? '')}"></div><div class="piccolo muto" style="text-align:center;margin-top:-6px" id="ineuro">ne hai ${manti(saldo)}</div></div>
        <div class="chip-row"><button class="btn" data-imp="5">5</button><button class="btn" data-imp="10">10</button><button class="btn" data-imp="20">20</button><button class="btn" data-imp="${(saldo / 100).toFixed(2)}">Tutto</button></div>
        <div class="campo"><label for="cau">Causale, la legge solo chi riceve</label><input id="cau" type="text" maxlength="140" value="${esc(pre.causale ?? '')}"></div>
        <div class="conto"><div><span>Invii</span><span class="num" id="r-invii">0,00</span></div><div><span>Commissione</span><span class="num">0,00</span></div><div class="tot"><span>Saldo dopo</span><span class="num" id="r-dopo">${manti(saldo)}</span></div></div>
        <div class="nota piccolo">Definitivo. Se sbagli destinatario, devi chiedergli di restituire.</div>
        <label class="piccolo muto" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="salva"> salva in rubrica come <input id="nome" type="text" placeholder="nome" style="flex:1;padding:6px 10px;border:0;border-radius:8px;background:var(--surface-2);color:var(--ink)"></label>
        <div class="errore" id="err"></div>
        <button class="btn primario largo" id="invia">Invia</button>
      </div>`, { tab: 'conto' });
    const aggiorna = () => {
      const cent = Math.round(Number(($('#imp').value || '0').replace(',', '.')) * 100);
      $('#r-invii').textContent = manti(cent);
      $('#r-dopo').textContent = manti(saldo - cent);
      $('#ineuro').textContent = `≈ ${euro(conto.inEuro(cent))} · ne hai ${manti(saldo)}`;
    };
    $('#imp').oninput = aggiorna; aggiorna();
    for (const b of document.querySelectorAll('[data-imp]')) b.onclick = () => { $('#imp').value = b.dataset.imp.replace('.', ','); aggiorna(); };
    if ($('#rub')) $('#rub').onchange = (e) => { $('#dest').value = e.target.value; };
    $('#invia').onclick = async () => {
      const dest = $('#dest').value.trim().toLowerCase();
      const cent = Math.round(Number(($('#imp').value || '0').replace(',', '.')) * 100);
      try { decodificaCoordinate(dest); } catch { $('#err').textContent = 'Coordinate non valide: servono intere, mnt1… e circa 110 caratteri.'; return; }
      if (!(cent > 0)) { $('#err').textContent = 'Importo?'; return; }
      if (cent > saldo) { $('#err').textContent = 'Non hai abbastanza manti.'; return; }
      if (dest === portafoglio.coordinate) { $('#err').textContent = 'Sono le tue coordinate.'; return; }
      $('#invia').textContent = 'Firmo…'; $('#invia').classList.add('attesa');
      try {
        await conServer(() => invia((reg) => {
          const { body, firmatari } = costruisciPagamentoRiservato({ portafoglio, disponibili: conto.disponibili(), destinazioni: [{ coordinate: dest, amount: cent, ...($('#cau').value.trim() ? { causale: $('#cau').value.trim() } : {}) }], stato: reg.stato });
          return { type: 'transfer', body, firmatari };
        }));
        if ($('#salva').checked && $('#nome').value.trim()) rubrica.aggiungi($('#nome').value.trim(), dest);
        schermate.conto();
      } catch (e) { $('#err').textContent = e.message; $('#invia').textContent = 'Invia'; $('#invia').classList.remove('attesa'); }
    };
  },

  compra() {
    const p = prezzoAcquisto(conto.stato);
    mostra(`${titolo('Compra dalla banca', 'conto')}
      <div class="form">
        <div class="blocco">
          <div class="cifra" style="font-size:1.6rem">${prezzo(p)} <span class="muto" style="font-size:.9rem;font-family:var(--body);font-weight:500">per manto oggi</span></div>
          <p class="piccolo muto">Valore ufficiale + 5%. Il sovrapprezzo va in riserva e alza il valore per tutti quelli che già hanno manti.</p>
        </div>
        <div class="blocco">
          <b>Come si fa</b>
          <p class="piccolo muto">Paghi la banca in euro fuori dall'app (bonifico o contanti, come vi accordate) e le dai le tue coordinate. La banca registra la vendita e i manti compaiono qui, con la scritta "Comprati dalla banca".</p>
          <span class="mono" style="word-break:break-all">${esc(coordinateLeggibili(portafoglio.coordinate))}</span>
          <button class="btn largo" id="copia">Copia le coordinate</button>
        </div>
        <div class="nota piccolo">La banca vende finché la riserva è sotto il tetto (${euro(conto.stato.tetto_cent ?? 0n)}). Oggi c'è spazio per ${euro((conto.stato.tetto_cent ?? 0n) - (conto.stato.riserva_cent ?? 0n))}.</div>
      </div>`, { tab: 'conto' });
    $('#copia').onclick = async () => { await navigator.clipboard.writeText(portafoglio.coordinate); $('#copia').textContent = 'Copiate'; };
  },

  converti() {
    const saldo = conto.saldo();
    mostra(`${titolo('Converti in euro', 'conto')}
      <div class="form">
        <div class="campo"><div class="importo-in"><input id="imp" inputmode="decimal" placeholder="0,00"></div><div class="piccolo muto" style="text-align:center;margin-top:-6px" id="ineuro">ne hai ${manti(saldo)}</div></div>
        <div class="campo"><label for="dati">Nome e IBAN, li legge solo la banca</label><textarea id="dati" maxlength="140" placeholder="Mario Rossi, IT60 X054 2811 1010 0000 0123 456"></textarea></div>
        <div class="nota info piccolo">La banca paga al prezzo di conversione del giorno in cui esegue (valore − 2%), e siccome il valore non scende mai non ci perdi se aspetta. Paga solo chi ha identificato: se non l'hai ancora fatto, contattala prima. I manti chiesti restano fermi finché non esegue.</div>
        <div class="errore" id="err"></div>
        <button class="btn primario largo" id="invia">Chiedi la conversione</button>
      </div>`, { tab: 'conto' });
    $('#imp').oninput = () => { const cent = Math.round(Number(($('#imp').value || '0').replace(',', '.')) * 100); $('#ineuro').textContent = `${euro(conto.euroSeConverto(cent))} se la banca esegue oggi · ne hai ${manti(saldo)}`; };
    $('#invia').onclick = async () => {
      const cent = Math.round(Number(($('#imp').value || '0').replace(',', '.')) * 100);
      const dati = $('#dati').value.trim();
      if (!(cent > 0) || cent > saldo) { $('#err').textContent = 'Importo non valido.'; return; }
      if (!dati) { $('#err').textContent = 'Servono nome e IBAN.'; return; }
      $('#invia').classList.add('attesa');
      try {
        await conServer(() => invia((reg) => {
          const { body, firmatari } = costruisciRichiestaConversione({ portafoglio, disponibili: conto.disponibili(), amount: cent, dati, coordinateBanca: reg.stato.genesi.banca.coordinate, stato: reg.stato });
          return { type: 'conversion.request', body, firmatari };
        }));
        schermate.conto();
      } catch (e) { $('#err').textContent = e.message; $('#invia').classList.remove('attesa'); }
    };
  },

  multe() {
    const tutti = conto.verbali();
    const aperti = tutti.filter((v) => v.stato === 'aperto' || v.stato === 'contestato' || v.stato === 'confermato');
    const chiusi = tutti.filter((v) => !aperti.includes(v));
    const pill = (v) => v.stato === 'aperto' ? (v.definitivo ? '<span class="pill bad">definitiva, non pagata</span>' : '<span class="pill bad">da pagare</span>') : v.stato === 'contestato' ? '<span class="pill warn">contestata, in attesa del giudice</span>' : '<span class="pill bad">confermata dal giudice, da pagare</span>';
    mostra(`${titolo('Multe')}
      <div class="form">
        ${aperti.length ? aperti.map((v) => `<div class="blocco">
          <div style="display:flex;justify-content:space-between;align-items:center">${pill(v)}<span class="piccolo muto">${v.stato === 'aperto' && !v.definitivo ? `${v.giorniRestanti} giorni per pagare o contestare` : ''}</span></div>
          <div class="cifra" style="font-size:1.3rem">${esc(v.numero)} · ${esc(v.nomeVoce)}</div>
          <div class="piccolo muto">${esc(giornoBreve(v.data))} · ${esc(v.nomeAzienda)} · ${v.descrizione ? `"${esc(v.descrizione)}"` : ''}</div>
          <div class="cifra" style="font-size:2rem">${manti(v.amount)} <span class="muto" style="font-size:.9rem;font-family:var(--body);font-weight:500">manti ≈ ${euro(conto.inEuro(v.amount))}</span></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <button class="btn primario" data-paga="${esc(v.id)}" ${v.stato === 'contestato' ? 'disabled' : ''}>Paga ora</button>
            <button class="btn" data-contesta="${esc(v.id)}" ${v.stato !== 'aperto' || v.definitivo ? 'disabled' : ''}>Contesta</button>
          </div>
          <p class="piccolo muto">Paghi dal verbale: metà va alla polizia e metà viene bruciata, e alza il valore di tutti i manti, anche i tuoi. Se non fai nulla entro il termine, la multa viene trattenuta dal prossimo stipendio e non puoi convertire finché non è saldata.</p>
          <div class="errore" id="err-${esc(v.numero)}"></div>
        </div>`).join('') : '<div class="blocco muto piccolo">Nessuna multa. Questa sezione conta solo se un\'azienda ti ha registrato come dipendente.</div>'}
        ${chiusi.length ? `<h3>Chiuse</h3><div class="lista">${chiusi.map((v) => `<div class="voce"><div class="av ${v.stato === 'annullato' || v.stato === 'ritirato' ? 'ok' : ''}">✓</div><div class="t"><b>${esc(v.numero)} · ${esc(v.nomeVoce)}</b><span>${v.stato === 'pagato' ? (v.come === 'trattenuto' ? 'trattenuta dallo stipendio' : 'pagata') : v.stato === 'annullato' ? 'annullata dal giudice' : v.stato}</span></div><div class="imp muto">${manti(v.amount)}</div></div>`).join('')}</div>` : ''}
      </div>`, { tab: 'multe' });
    for (const b of document.querySelectorAll('[data-paga]')) b.onclick = async () => {
      const id = b.dataset.paga; const v = tutti.find((x) => x.id === id);
      if (conto.saldo() < v.amount) { $(`#err-${v.numero}`).textContent = 'Non hai abbastanza manti.'; return; }
      b.classList.add('attesa');
      try {
        await conServer(() => invia((reg) => {
          const { body, firmatari } = costruisciPagamentoRiservato({ portafoglio, disponibili: conto.disponibili(), destinazioni: [], stato: reg.stato, multa: id });
          return { type: 'transfer', body, firmatari };
        }));
        schermate.multe();
      } catch (e) { $(`#err-${v.numero}`).textContent = e.message; b.classList.remove('attesa'); }
    };
    for (const b of document.querySelectorAll('[data-contesta]')) b.onclick = () => schermate.contesta(tutti.find((x) => x.id === b.dataset.contesta));
  },

  contesta(v) {
    mostra(`${titolo(`Contesta ${v.numero}`, 'multe')}
      <div class="form">
        <div class="conto"><div><span>Infrazione</span><span>${esc(v.nomeVoce)}</span></div><div><span>Importo</span><span class="num">${manti(v.amount)} manti</span></div><div><span>Data</span><span>${esc(giornoBreve(v.data))}</span></div></div>
        <div class="campo"><label for="txt">Le tue ragioni (fino a 140 caratteri)</label><textarea id="txt" maxlength="140"></textarea></div>
        <div class="nota info piccolo">Decide il giudice, un'intelligenza artificiale con istruzioni pubbliche. Legge il verbale, il tariffario, le tue ragioni e l'eventuale replica della polizia. Non sa chi sei. La sentenza è definitiva e la motivazione viene pubblicata.</div>
        <div class="errore" id="err"></div>
        <button class="btn primario largo" id="invia">Invia la contestazione</button>
      </div>`, { tab: 'multe' });
    $('#invia').onclick = async () => {
      const testo = $('#txt').value.trim();
      if (!testo) { $('#err').textContent = 'Scrivi le tue ragioni.'; return; }
      $('#invia').classList.add('attesa');
      try {
        await conServer(() => invia((reg) => {
          const s = reg.stato;
          if (!s.giudice) throw new Error('nessun giudice registrato: non si può contestare');
          const per = (coord) => { const i = creaIndirizzo(coord); return { addr: i.addr, eph: i.eph, memo: cifraCausale(chiaveCausale(i.k), testo) }; };
          return { type: 'fine.contest', body: { verbale: v.id, giudice: per(s.giudice.coordinate), polizia: per(s.aziende[v.azienda].polizia.coordinate) }, firmatari: [{ by: v.consegna.addr, firma: (h) => firmaScalare(v.p, h) }] };
        }));
        schermate.multe();
      } catch (e) { $('#err').textContent = e.message; $('#invia').classList.remove('attesa'); }
    };
  },

  rubrica() {
    const contatti = rubrica.tutti();
    mostra(`${titolo('Rubrica')}
      <div class="form">
        <div class="lista">${contatti.length ? contatti.map((c) => `<div class="voce"><div class="av">${esc(c.nome[0].toUpperCase())}</div><div class="t"><b>${esc(c.nome)}</b><span class="mono">${esc(c.coordinate.slice(0, 18))}…</span></div><a class="piccolo" data-paga="${esc(c.coordinate)}">paga</a> <a class="piccolo muto" data-togli="${esc(c.coordinate)}">togli</a></div>`).join('') : '<div class="voce"><div class="t muto piccolo">Vuota. Aggiungi qualcuno dal bonifico, o qui sotto.</div></div>'}</div>
        <div class="blocco"><b>Aggiungi</b><div class="campo"><input id="nome" placeholder="nome"></div><div class="campo"><input id="coord" placeholder="coordinate mnt1…" autocapitalize="none"></div><button class="btn largo" id="agg">Salva</button><div class="errore" id="err"></div></div>
        <p class="piccolo muto">La rubrica sta solo in questo telefono. Le coordinate non rivelano il saldo di nessuno.</p>
      </div>`, { tab: 'rubrica' });
    for (const a of document.querySelectorAll('[data-paga]')) a.onclick = () => schermate.bonifico({ coordinate: a.dataset.paga });
    for (const a of document.querySelectorAll('[data-togli]')) a.onclick = () => { rubrica.togli(a.dataset.togli); schermate.rubrica(); };
    $('#agg').onclick = () => {
      const coord = $('#coord').value.trim().toLowerCase();
      try { decodificaCoordinate(coord); } catch { $('#err').textContent = 'Coordinate non valide.'; return; }
      if (!$('#nome').value.trim()) { $('#err').textContent = 'Nome?'; return; }
      rubrica.aggiungi($('#nome').value.trim(), coord); schermate.rubrica();
    };
  },

  sicurezza() {
    mostra(`${titolo('Sicurezza')}
      <div class="form">
        <div class="blocco"><b>Frase di recupero</b><p class="piccolo muto">Dodici parole scritte al primo avvio. Sono l'unico modo per ritrovare il conto su un altro telefono. Non esiste una copia presso la banca.</p><button class="btn largo" id="mostra">Mostra con il PIN</button><div id="parole"></div></div>
        <div class="blocco"><b>Le tue coordinate</b><span class="mono" style="word-break:break-all">${esc(coordinateLeggibili(portafoglio.coordinate))}</span><p class="piccolo muto">Dalle a chi deve farti un bonifico. Non rivelano il saldo. Ogni pagamento che ricevi va comunque a un indirizzo diverso.</p></div>
        <div class="blocco"><b>Chi sa cosa</b><p class="piccolo muto">Nessun altro correntista sa che esisti. Nessuno, nemmeno la banca, sa il tuo saldo: lo calcola solo questa app dalle tue entrate. L'azienda sa quanto ti ha pagato. La polizia sa le multe che ti ha fatto. La banca sa chi si è identificato per convertire.</p><p class="piccolo muto">Registro: ${conto.registro.righe.length} righe, verificate una per una da questa app, fino alla riga <span class="mono">${esc(conto.registro.ultima?.hash.slice(0, 12) ?? '')}</span>.</p></div>
        <div class="blocco"><b>Server</b><div class="campo"><input id="server" value="${esc(SERVER)}"></div><button class="btn largo" id="salva-server">Salva e ricarica</button></div>
        <button class="btn largo" id="chiudi">Chiudi il conto su questo telefono</button>
      </div>`, { tab: 'sicurezza' });
    $('#mostra').onclick = async () => {
      const pin = prompt('PIN');
      if (pin === null) return;
      const f = await cassaforte.apri(pin);
      $('#parole').innerHTML = f ? `<div class="parole" style="margin-top:8px">${f.split(' ').map((p) => `<span>${esc(p)}</span>`).join('')}</div>` : '<div class="errore">PIN sbagliato.</div>';
    };
    $('#salva-server').onclick = () => { localStorage.setItem('manti.server', $('#server').value.trim().replace(/\/$/, '')); location.reload(); };
    $('#chiudi').onclick = () => { if (confirm('Cancella le parole da questo telefono? Le hai su carta?')) { cassaforte.cancella(); location.reload(); } };
  },
};

async function apriConto() {
  portafoglio = portafoglioDaFrase(frase);
  conto = new Conto(SERVER, portafoglio);
  mostra('<div class="caricamento">Leggo il registro…</div>');
  try {
    await conServer(() => conto.aggiorna());
  } catch (e) {
    mostra(`<div class="form" style="margin-top:40px">${errore(e)}<button class="btn largo" data-vai="sicurezza">Sicurezza</button><button class="btn largo" id="riprova">Riprova</button></div>`, { tab: 'conto' });
    $('#riprova').onclick = apriConto;
    return;
  }
  schermate.conto();
  setInterval(async () => { try { if (await conto.aggiorna()) if (tabbar.children[0].classList.contains('on')) schermate.conto(); } catch {} }, 20000);
}

document.body.addEventListener('click', (e) => {
  const t = e.target.closest('[data-vai]');
  if (t && schermate[t.dataset.vai]) { e.preventDefault(); schermate[t.dataset.vai](); }
});

if (cassaforte.esiste()) schermate.pin(); else schermate.avvio();
