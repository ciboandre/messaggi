// Il sito statico: una pagina, tutti i numeri con il conto esplicito, il
// registro riga per riga con le uscite anonime. Nessuna dipendenza, nessuno
// script: quello che si vede è quello che c'è nel file.

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const euro = (cent) => (Number(cent) / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const manti = (cent) => (Number(cent) / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' manti';
const prezzo = (dm) => (dm === null ? '—' : (Number(dm) / 10000).toLocaleString('it-IT', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + ' €');

/**
 * Descrizione di una riga per il registro pubblico: tipo, chi firma (ruolo
 * o anello), uscite anonime, mai un nome, mai un importo riservato.
 * @param {import('../nucleo/registro.js').Riga} r
 */
function descriviRiga(r) {
  const b = /** @type {any} */ (r.body);
  const firme = r.sigs.map((s) => ('img' in s ? `anello ${String(s.img).slice(0, 8)}…` : `chiave ${String(s.by).slice(0, 8)}…`)).join(', ');
  const out = Array.isArray(b.out) ? b.out.map((u) => {
    if (u.addr === null) return `bruciati ${manti(u.amount)} (${esc(u.reason)})`;
    if (u.amount !== undefined) return `${manti(u.amount)} → ${String(u.addr).slice(0, 8)}…${u.tag ? ` [${esc(u.tag)}]` : ''}`;
    return `riservata → ${String(u.addr).slice(0, 8)}…`;
  }) : [];
  const dettagli = [];
  if (r.type === 'sale') dettagli.push(`${euro(b.euro_cent)} a ${prezzo(b.prezzo)}`);
  if (r.type === 'reserve.interest') dettagli.push(`+${euro(b.euro_cent)} (${esc(b.da)} → ${esc(b.a)})`);
  if (r.type === 'cap.set') dettagli.push(`tetto ${euro(b.tetto_cent)}`);
  if (r.type === 'day') dettagli.push(esc(b.data));
  if (r.type === 'conversion.request') dettagli.push(`${manti(b.amount)} da convertire`);
  if (r.type === 'conversion.execute') dettagli.push(`${euro(b.euro_cent)} a ${prezzo(b.prezzo)}`);
  if (r.type === 'fine.issue') dettagli.push(`verbale ${esc(b.numero)}, ${esc(b.voce)}, ${manti(b.amount)}`);
  if (r.type === 'verdict') dettagli.push(`${esc(b.esito)}: ${esc(b.motivazione)}`);
  if (r.type === 'correction') dettagli.push(`corregge ${String(b.ref).slice(0, 8)}…: ${esc(b.motivazione)}`);
  if (Array.isArray(b.in)) dettagli.push(`${b.in.length} entrat${b.in.length === 1 ? 'a' : 'e'}${b.in[0]?.ring ? ` in anello di ${b.in[0].ring.length}` : ''}`);
  return `<tr><td>${r.seq}</td><td>${esc(r.ts)}</td><td><code>${esc(r.type)}</code></td><td>${esc(dettagli.join('; '))}${out.length ? '<br>' + out.join('<br>') : ''}</td><td>${esc(firme)}</td><td><code title="${esc(r.hash)}">${esc(r.hash.slice(0, 10))}…</code></td></tr>`;
}

/**
 * @param {{ riassunto: any, errore: { seq: number, motivo: string } | null, righe: import('../nucleo/registro.js').Riga[] }} p
 * @returns {string}
 */
export function rendiSito({ riassunto: r, errore, righe }) {
  const avviso = errore
    ? `<section class="errore"><h2>Registro rotto</h2><p>La riga <strong>${errore.seq}</strong> non passa la sua regola: <em>${esc(errore.motivo)}</em>.</p><p>Il motore si è fermato lì. I numeri qui sotto sono quelli dell'ultima riga buona${r?.ultima_riga ? ` (seq ${r.ultima_riga.seq})` : ''} e non vanno presi per correnti finché la catena non è ricostruita, senza cancellare niente, con una riga che spieghi.</p></section>`
    : '';
  const valore = r?.valore
    ? `<p class="grande">${prezzo(r.valore.decimillesimi)} <small>per manto</small></p>
       <p class="conto">= riserva ${euro(r.valore.riserva_cent)} ÷ circolazione ${manti(r.valore.circolazione_cent)}, arrotondato per difetto</p>`
    : '<p class="grande">— <small>nessun manto in circolazione</small></p>';
  const numeri = r ? `
    <table class="numeri">
      <tr><th>Prezzo di acquisto dalla banca</th><td>${prezzo(r.prezzo_acquisto)}</td><td class="nota">valore + 5%, per eccesso; 1,0000 € alla prima vendita</td></tr>
      <tr><th>Prezzo di conversione</th><td>${prezzo(r.prezzo_conversione)}</td><td class="nota">valore − 2%, per difetto</td></tr>
      <tr><th>Riserva</th><td>${euro(r.riserva_cent)}</td><td class="nota">tetto ${euro(r.tetto_cent)}, spazio ${euro(r.spazio_sotto_tetto_cent)}</td></tr>
      <tr><th>In circolazione</th><td>${manti(r.circolazione_cent)}</td><td class="nota">emessi ${manti(r.emessi_cent)} − bruciati ${manti(r.bruciati_cent)}</td></tr>
      <tr><th>Venduti / convertiti</th><td>${manti(r.venduti_cent)} / ${manti(r.convertiti_cent)}</td><td class="nota">interessi in riserva ${euro(r.interessi_cent)}</td></tr>
      <tr><th>Uscite nel registro</th><td>${r.uscite}</td><td class="nota">${r.disponibili} esche possibili, ${r.immagini_spese} immagini di chiave spese</td></tr>
      <tr><th>Giorno</th><td>${r.giorno ?? '—'}</td><td class="nota">${r.n_giorni} righe di giorno</td></tr>
    </table>` : '';
  const estratti = r && Object.keys(r.estratti).length ? `<h2>Estratti conto della riserva</h2><table>${Object.entries(r.estratti).map(([m, e]) => `<tr><td>${esc(m)}</td><td>dichiarato ${euro(e.saldo_cent)}</td><td>calcolato ${euro(e.riserva_cent)}</td><td>${e.nota ? esc(e.nota) : 'coincide'}</td><td><code title="${esc(e.documento)}">${esc(e.documento.slice(0, 10))}…</code></td></tr>`).join('')}</table><p class="nota">L'estratto conto è un'affermazione firmata dalla banca: il registro sa fare i conti tra le sue righe, non può sapere se gli euro esistono. È il punto in cui la fiducia entra nel sistema.</p>` : '';
  const correzioni = r && Object.keys(r.correzioni).length ? `<h2>Correzioni</h2><table>${Object.entries(r.correzioni).map(([ref, c]) => `<tr><td><code>${esc(ref.slice(0, 10))}…</code></td><td>−${euro(c.euro_cent)}</td><td>valore da ${prezzo(c.valore_prima)} a ${prezzo(c.valore_dopo)}</td><td>${esc(c.motivazione)}</td></tr>`).join('')}</table><p class="nota">Una correzione è l'unica riga in cui il valore può scendere: dichiara che il valore di prima era sbagliato.</p>` : '';
  const aziende = r && Object.keys(r.aziende).length ? `<h2>Aziende</h2>${Object.entries(r.aziende).map(([k, a]) => `<h3>${esc(a.nome)} <small><code>${esc(k.slice(0, 10))}…</code></small></h3><p>Pagati in stipendi, premi e trattenute: ${manti(a.pagati_cent)}. Polizia: ${a.polizia ? `<code>${esc(a.polizia.slice(0, 10))}…</code>` : 'non nominata'}.</p>${voci('Catalogo dei premi', a.catalogo)}${voci('Tariffario delle multe', a.tariffario)}`).join('')}` : '';
  const verbali = r ? `<h2>Verbali</h2><p>${r.verbali.totale} in tutto: ${r.verbali.aperti} aperti, ${r.verbali.pagati} pagati, ${r.verbali.contestati} contestati, ${r.verbali.annullati} annullati o ritirati, ${r.verbali.definitivi_non_saldati} definitivi non saldati.</p>${r.sentenze.length ? `<table>${r.sentenze.map((s) => `<tr><td>${esc(s.numero)}</td><td>${esc(s.voce)}, ${manti(s.amount)}</td><td><strong>${esc(s.esito)}</strong></td><td>${esc(s.motivazione)}</td><td class="nota">istruzioni ${esc(s.versione)}, fascicolo <code>${esc(s.fascicolo.slice(0, 10))}…</code></td></tr>`).join('')}</table>` : ''}` : '';
  const registro = righe.length ? `<h2>Registro</h2><p class="nota">${righe.length} righe. Le uscite sono indirizzi usa e getta: nessun nome, nessun saldo. Gli importi tra correntisti non ci sono: al loro posto un impegno che il motore verifica senza leggerlo.</p><table class="registro"><tr><th>seq</th><th>quando</th><th>tipo</th><th>contenuto</th><th>firme</th><th>hash</th></tr>${righe.map(descriviRiga).join('\n')}</table>` : '';
  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Il manto</title>
<style>
body{font:16px/1.5 system-ui,sans-serif;max-width:64rem;margin:2rem auto;padding:0 1rem;color:#1a1a1a;background:#fbfaf7}
h1{font-weight:600}h2{margin-top:2.5rem;border-bottom:1px solid #ddd}h3{margin-bottom:.2rem}
.grande{font-size:2.6rem;margin:.2rem 0}.grande small{font-size:1rem;color:#666}.conto{color:#555;margin-top:0}
table{border-collapse:collapse;width:100%;font-size:.95rem}td,th{text-align:left;vertical-align:top;padding:.35rem .5rem;border-bottom:1px solid #eee}
.numeri th{width:16rem;font-weight:500}.nota{color:#666;font-size:.9rem}code{font-size:.85em}
.errore{background:#fff1ef;border:1px solid #e0a49c;padding:1rem;margin:1rem 0}
.registro td:nth-child(4){font-size:.85rem}
footer{margin-top:3rem;color:#666;font-size:.9rem}
</style></head><body>
<h1>Il manto</h1>
<p>Moneta privata coperta uno a uno da euro in riserva. Questa pagina è generata dal registro, ogni giorno, rileggendolo da capo. Tutto ciò che c'è qui lo può ricalcolare chiunque dal file.</p>
${avviso}
<h2>Valore ufficiale</h2>
${valore}
${numeri}
${estratti}
${correzioni}
${aziende}
${verbali}
${registro}
<footer>Pubblicato ${r ? esc(r.pubblicato) : ''}${r?.ultima_riga ? `, riga ${r.ultima_riga.seq}, hash <code>${esc(r.ultima_riga.hash)}</code>` : ''}. Lo stato in <a href="stato.json">stato.json</a>.</footer>
</body></html>
`;
}

function voci(titolo, mappa) {
  const e = Object.entries(mappa ?? {});
  if (!e.length) return '';
  return `<p><strong>${titolo}</strong></p><table>${e.map(([c, v]) => `<tr><td><code>${esc(c)}</code></td><td>${esc(v.nome)}</td><td>${manti(v.amount)}</td></tr>`).join('')}</table>`;
}
