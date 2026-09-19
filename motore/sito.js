// Il sito pubblico, dal mockup (mockup/index.html, vista "sito"): una
// pagina sola, generata dal registro, senza script. Tutto ciò che c'è
// qui lo ricalcola chiunque dal file; nessun numero è scritto a mano.
//
// Le sezioni, nell'ordine del mockup: testata; hero con il valore, quanto
// è salito, i due prezzi e le quattro card; andamento del valore (un
// punto per riga `day`) e il conto di oggi; catalogo e tariffario per
// azienda con l'equivalente in euro; sentenze; registro riga per riga;
// le tre garanzie; la riga di firma. Se il registro è rotto, un avviso in
// cima e i numeri dell'ultima riga buona.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const qui = dirname(fileURLToPath(import.meta.url));
const STILE = readFileSync(join(qui, 'stile.css'), 'utf8');
const VERSIONE_MOTORE = JSON.parse(readFileSync(join(qui, '..', 'package.json'), 'utf8')).version;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const it = (n, d) => Number(n).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
const euro = (cent) => it(Number(cent) / 100, 2) + ' €';
const manti = (cent) => it(Number(cent) / 100, 2);
const prezzo3 = (dm) => (dm === null || dm === undefined ? '—' : it(Number(dm) / 10000, 3));
const prezzo4 = (dm) => (dm === null || dm === undefined ? '—' : it(Number(dm) / 10000, 4));
const corto = (hex, n = 4) => (typeof hex === 'string' && hex.length >= 8 ? `${hex.slice(0, n)}…${hex.slice(-n)}` : esc(hex));
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const giornoBreve = (data) => (data ? `${Number(data.slice(8, 10))} ${MESI[Number(data.slice(5, 7)) - 1]}` : '—');
const quando = (ts) => `${giornoBreve(ts.slice(0, 10))} ${ts.slice(11, 16)}`;
const SIMBOLO = '<svg class="sym"><use href="#manto"/></svg>';
/** manti (centesimi) in euro (centesimi) al valore del giorno */
const inEuro = (mantiCent, valore) => (valore === null ? '—' : euro((BigInt(mantiCent) * BigInt(valore)) / 10000n));

// ── il registro, riga per riga, come lo descrive il mockup ──

const PILLOLE = {
  genesis: ['genesi', ''], day: ['giorno', ''], 'cap.set': ['tetto', ''], sale: ['vendita', 'warn'],
  'reserve.interest': ['interessi', 'ok'], 'reserve.statement': ['estratto', ''], correction: ['correzione', 'bad'],
  'company.register': ['azienda', ''], 'police.appoint': ['polizia', ''], 'judge.register': ['giudice', ''],
  'catalog.set': ['catalogo', ''], 'tariff.set': ['tariffario', ''], payout: ['fine mese', ''],
  transfer: ['pagamento', ''], 'conversion.request': ['richiesta', 'acc'], 'conversion.execute': ['conversione', 'acc'],
  'conversion.paid': ['pagata', 'acc'], 'fine.issue': ['verbale', 'bad'], 'fine.withdraw': ['ritiro', ''],
  'fine.contest': ['contestazione', 'warn'], 'fine.reply': ['replica', ''], verdict: ['sentenza', 'ok'],
};

/**
 * @param {import('../nucleo/registro.js').Riga} r
 * @param {any} s  lo stato finale, per nomi di aziende e verbali
 */
function dettaglio(r, s) {
  const b = /** @type {any} */ (r.body);
  const nomeAz = (k) => esc(s.aziende?.[k]?.nome ?? corto(k));
  const numero = (id) => esc(s.verbali?.[id]?.numero ?? corto(id));
  const uscite = Array.isArray(b.out) ? b.out : [];
  const chiare = uscite.filter((u) => u.amount !== undefined && u.addr !== null);
  const bruciate = uscite.filter((u) => u.addr === null);
  const riservate = uscite.filter((u) => u.amount === undefined);
  const indirizzi = uscite.filter((u) => u.addr).map((u) => `<span class="mono">${corto(u.addr, 4).slice(0, 5)}</span>`).join(' ');
  switch (r.type) {
    case 'genesis': return `sovrapprezzo ${b.parametri.sovrapprezzo_pct}% · commissione ${b.parametri.commissione_pct}% · multe bruciate ${b.parametri.multe_bruciate_pct}% · tetto ${euro(b.parametri.tetto_cent)} · ${b.parametri.giorni_multa} giorni`;
    case 'day': return `apre il ${esc(b.data)}`;
    case 'cap.set': return `nuovo tetto ${euro(b.tetto_cent)}`;
    case 'sale': return `${euro(b.euro_cent)} a ${prezzo4(b.prezzo)} → ${manti(chiare.reduce((a, u) => a + u.amount, 0))} manti · ${chiare.length} uscit${chiare.length === 1 ? 'a' : 'e'}${r.seq <= 3 && s.venduti_cent !== undefined ? '' : ''}`;
    case 'reserve.interest': return `${esc(b.da)} → ${esc(b.a)} · +${euro(b.euro_cent)} in riserva`;
    case 'reserve.statement': return `${esc(b.mese)} · dichiarato ${euro(b.saldo_cent)}${b.nota ? ` · ${esc(b.nota)}` : ' · coincide'}`;
    case 'correction': return `corregge ${corto(b.ref)} · −${b.euro_cent !== undefined ? euro(b.euro_cent) : 'tutto l\'interesse'} · ${esc(b.motivazione)}`;
    case 'company.register': return `registrata "${esc(b.nome)}" · chiave <span class="mono">${corto(b.chiave)}</span>`;
    case 'police.appoint': return `${nomeAz(b.azienda)} · polizia <span class="mono">${corto(b.chiave)}</span>`;
    case 'judge.register': return `chiave <span class="mono">${corto(b.chiave)}</span> · istruzioni ${esc(b.versione)}`;
    case 'catalog.set': return `${nomeAz(b.azienda)} · ${b.voci.length} voci`;
    case 'tariff.set': return `${nomeAz(b.azienda)} · ${b.voci.length} voci`;
    case 'payout': {
      const stipendi = chiare.filter((u) => u.tag === 'stipendio');
      const premi = chiare.filter((u) => u.tag === 'premio');
      const parti = [];
      if (stipendi.length) parti.push(`stipendi ${stipendi.length} × ${manti(stipendi[0].amount)}`);
      if (premi.length) parti.push(`premi ${manti(premi.reduce((a, u) => a + u.amount, 0))}`);
      if (b.trattenute?.length) parti.push(`trattenute ${b.trattenute.length}`);
      return `${nomeAz(b.azienda)} · ${parti.join(' · ')} in ${chiare.length} uscite`;
    }
    case 'transfer': {
      const anello = b.in[0]?.ring?.length ?? 0;
      if (b.ref) {
        const pol = chiare.find((u) => u.tag === 'multa');
        return `rif. ${numero(b.ref)} · ${b.in.length} entrat${b.in.length === 1 ? 'a' : 'e'} in anello di ${anello} → ${pol ? manti(pol.amount) : '—'} alla polizia · ${manti(bruciate.reduce((a, u) => a + u.amount, 0))} bruciati · resto riservato`;
      }
      return `${b.in.length} entrat${b.in.length === 1 ? 'a' : 'e'} in anello di ${anello} → ${riservate.length} uscite riservate · indirizzi ${indirizzi}`;
    }
    case 'conversion.request': return `conversione · ${b.in.length} entrat${b.in.length === 1 ? 'a' : 'e'} in anello di ${b.in[0]?.ring?.length ?? 0} · ${manti(b.amount)} manti · dati di pagamento cifrati per la banca`;
    case 'conversion.execute': return `eseguita ${corto(b.richiesta)} · bruciati ${manti(s.conversioni?.[b.richiesta]?.amount ?? 0)} · prezzo ${prezzo4(b.prezzo)} · ${euro(b.euro_cent)} dovuti`;
    case 'conversion.paid': return `pagata ${corto(b.richiesta)} · il ${esc(b.data)}`;
    case 'fine.issue': return `${esc(b.numero)} · ${esc(s.aziende?.[b.azienda]?.tariffario?.[b.voce]?.nome ?? b.voce)} · ${manti(b.amount)} · consegna <span class="mono">${corto(b.consegna.addr)}</span>`;
    case 'fine.withdraw': return `${numero(b.verbale)} ritirato · ${esc(b.motivazione)}`;
    case 'fine.contest': return `${numero(b.verbale)} · testo cifrato per giudice e polizia`;
    case 'fine.reply': return `${numero(b.verbale)} · testo cifrato per il giudice`;
    case 'verdict': return `${numero(b.verbale)} ${esc(b.esito)} · istruzioni ${esc(b.versione)} · fascicolo <span class="mono">${corto(b.fascicolo)}</span>`;
    default: return '';
  }
}

function rigaRegistro(r, s) {
  const [nome, classe] = PILLOLE[r.type] ?? [r.type, ''];
  const etichetta = r.type === 'transfer' && r.body.ref ? ['multa pagata', ''] : [nome, classe];
  return `<tr><td class="r">${r.seq}</td><td>${quando(r.ts)}</td><td><span class="pill ${etichetta[1]}">${etichetta[0]}</span></td><td>${dettaglio(r, s)}</td><td class="mono" title="${esc(r.hash)}">${corto(r.hash)}</td></tr>`;
}

// ── il grafico del valore ──

function grafico(serie) {
  const punti = serie.filter((p) => p.valore !== null).map((p) => ({ data: p.data, v: Number(p.valore) / 10000 }));
  if (punti.length < 2) return `<p class="piccolo muto" style="margin-top:8px">Il grafico comincia con la seconda riga di giorno dopo la prima vendita.</p>`;
  const min = Math.floor(Math.min(...punti.map((p) => p.v)) * 100) / 100;
  const max = Math.ceil(Math.max(...punti.map((p) => p.v)) * 100) / 100;
  const [alto, basso] = [max + 0.01, Math.max(0, min - 0.01)];
  const x = (i) => 70 + (i * 340) / (punti.length - 1);
  const y = (v) => 160 - ((v - basso) * 140) / (alto - basso);
  const coords = punti.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`);
  const linee = [0, 1, 2, 3, 4].map((k) => { const yy = 20 + k * 35; const v = alto - (k * (alto - basso)) / 4; return `<line x1="50" y1="${yy}" x2="440" y2="${yy}"/><text x="8" y="${yy + 4}" class="lab">${it(v, 3)}</text>`; });
  const etichette = [0, Math.floor((punti.length - 1) / 3), Math.floor((2 * (punti.length - 1)) / 3), punti.length - 1].filter((v, i, a) => a.indexOf(v) === i);
  const xl = etichette.map((i) => `<text x="${(x(i) - 14).toFixed(0)}" y="186">${i === punti.length - 1 ? 'oggi' : giornoBreve(punti[i].data)}</text>`);
  const ultimo = punti[punti.length - 1];
  return `<svg class="grafico" viewBox="0 0 460 200" aria-label="Valore del manto, un punto per giorno">
        <g class="griglia-l">${linee.map((l) => l.replace(/<text.*?<\/text>/, '')).join('')}</g>
        ${linee.map((l) => l.match(/<text.*?<\/text>/)[0].replace(' class="lab"', '')).join('')}
        <path class="area" d="M${coords[0]} L${coords.slice(1).join(' L')} L${x(punti.length - 1).toFixed(1)},160 L${x(0).toFixed(1)},160 Z"/>
        <polyline class="linea" points="${coords.join(' ')}"/>
        ${punti.length <= 40 ? coords.slice(0, -1).map((c) => `<circle class="punto" cx="${c.split(',')[0]}" cy="${c.split(',')[1]}" r="3"/>`).join('') : ''}
        <circle class="punto-fine" cx="${x(punti.length - 1).toFixed(1)}" cy="${y(ultimo.v).toFixed(1)}" r="6"/>
        ${xl.join('')}
      </svg>`;
}

function voci(titolo, colonna, az, mappa, v, valore, dal, nota) {
  const righe = Object.entries(mappa);
  return `<div>
      <div class="testa" style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px"><h2>${titolo}</h2><span class="piccolo muto">v${v}${dal ? ` · dal ${giornoBreve(dal)}` : ''}</span></div>
      <div class="card scroll">
        <table>
          <thead><tr><th>${colonna} · ${esc(az.nome)}</th><th class="r">Manti</th><th class="r">In euro</th></tr></thead>
          <tbody>
          ${righe.length ? righe.map(([, x]) => `<tr><td><b>${esc(x.nome)}</b>${x.descrizione ? `<br><span class="muto piccolo">${esc(x.descrizione)}</span>` : ''}</td><td class="r">${manti(x.amount)}</td><td class="r">${inEuro(x.amount, valore).replace(' €', '')}</td></tr>`).join('\n          ') : '<tr><td colspan="3" class="muto">ancora vuoto</td></tr>'}
          </tbody>
        </table>
      </div>
      <p class="piccolo muto" style="margin-top:8px">${nota}</p>
    </div>`;
}

/**
 * @param {{ riassunto: any, errore: { seq: number, motivo: string } | null, righe: import('../nucleo/registro.js').Riga[], stato: any, totali?: number }} p
 *   `righe` sono quelle buone; `totali` quante ce n'erano nel file.
 * @returns {string}
 */
export function rendiSito({ riassunto: r, errore, righe, stato: s = {}, totali = righe.length }) {
  const valore = r?.valore ? BigInt(r.valore.decimillesimi) : null;
  const primo = (r?.serie ?? []).find((p) => p.valore !== null);
  const partenza = 10000n;
  const salita = valore === null ? null : Number((valore - partenza) * 10000n / partenza) / 100;
  const corretto = r && Object.keys(r.correzioni).length > 0;
  const delta = valore === null ? 'in attesa della prima vendita'
    : `${salita >= 0 ? '▲' : '▼'} ${it(Math.abs(salita), 1)}% dalla partenza · ${corretto ? `sceso ${Object.keys(r.correzioni).length === 1 ? 'una volta, per una correzione' : `${Object.keys(r.correzioni).length} volte, per correzioni`}` : 'non è mai sceso'}`;
  const ey = errore
    ? `<i style="background:#FF6B6F"></i> Registro rotto alla riga ${errore.seq}: numeri fermi alla riga ${r?.ultima_riga?.seq ?? '—'} su ${totali}`
    : `<i></i> Registro al ${r?.giorno ? giornoBreve(r.giorno) : '—'} · verificato, ${righe.length} righe su ${totali}`;
  const avviso = errore ? `<div class="nota bad avviso"><b>Registro rotto.</b> La riga <b>${errore.seq}</b> non passa la sua regola: <i>${esc(errore.motivo)}</i>. Il motore si è fermato lì. I numeri qui sotto sono quelli dell'ultima riga buona e non vanno presi per correnti finché la catena non è ricostruita, senza cancellare niente, con una riga che spieghi.</div>` : '';

  const bruciatiMulte = r ? BigInt(r.bruciati_cent) - BigInt(r.convertiti_cent) : 0n;
  const hero = `<div class="hero">
    <div>
      <div class="ey">${ey}</div>
      <div class="big">${valore === null ? '—' : prezzo3(valore)}<small>€ per 1 ${SIMBOLO}</small></div>
      <div class="delta">${delta}</div>
      <p class="come">Il valore non lo decide nessuno: è la riserva in euro divisa per i manti in circolazione. Sale a ogni vendita con sovrapprezzo, a ogni conversione, con gli interessi della riserva e con la metà di ogni multa che viene bruciata. Non esiste un'operazione che lo faccia scendere.</p>
      <div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap">
        <div class="kpi" style="flex:1;min-width:140px"><h3>Compri dalla banca a</h3><div class="v">${prezzo3(r?.prezzo_acquisto)}<small> €</small></div><div class="s">${valore === null ? 'prezzo di lancio' : 'valore + 5%'}</div></div>
        <div class="kpi" style="flex:1;min-width:140px"><h3>Converti in euro a</h3><div class="v">${prezzo3(r?.prezzo_conversione)}<small> €</small></div><div class="s">valore − 2%</div></div>
      </div>
    </div>
    <div class="kpis">
      <div class="kpi"><h3>Riserva</h3><div class="v">${it(Number(r?.riserva_cent ?? 0) / 100, 2)}<small> €</small></div><div class="s">tetto ${euro(r?.tetto_cent ?? 0)} · spazio per ${euro(r?.spazio_sotto_tetto_cent ?? 0)}</div></div>
      <div class="kpi"><h3>In circolazione</h3><div class="v">${manti(r?.circolazione_cent ?? 0)}</div><div class="s">manti</div></div>
      <div class="kpi"><h3>Bruciati</h3><div class="v">${manti(r?.bruciati_cent ?? 0)}</div><div class="s">${manti(r?.convertiti_cent ?? 0)} in conversioni, ${manti(bruciatiMulte)} da multe</div></div>
      <div class="kpi"><h3>Interessi in riserva</h3><div class="v">${it(Number(r?.interessi_cent ?? 0) / 100, 2)}<small> €</small></div><div class="s">conto remunerato, tutto in riserva</div></div>
    </div>
  </div>`;

  const ultimoEstratto = r ? Object.entries(r.estratti).sort().at(-1) : null;
  const conto = r ? `<div class="sezione griglia g2">
    <div class="card pad">
      <h3>Andamento del valore</h3>
      ${grafico(r.serie)}
      ${primo ? `<p class="piccolo muto" style="margin-top:6px">${prezzo3(primo.valore)} il ${giornoBreve(primo.data)} · ${prezzo3(valore)} oggi · ${r.n_giorni} giorni di registro.</p>` : ''}
    </div>
    <div class="card pad">
      <h3>Il conto di oggi</h3>
      <div class="conto" style="margin-top:8px">
        <div><span>Euro ricevuti dalle vendite</span><span class="num">${euro(r.incassati_cent)}</span></div>
        <div><span>Interessi del conto di riserva</span><span class="num">+ ${euro(r.interessi_cent)}</span></div>
        <div><span>Pagato per conversioni</span><span class="num">− ${euro(r.restituiti_cent)}</span></div>
        ${corretto ? `<div><span>Correzioni</span><span class="num">− ${euro(Object.values(r.correzioni).reduce((a, c) => a + BigInt(c.euro_cent), 0n))}</span></div>` : ''}
        <div><span>Riserva</span><span class="num">${euro(r.riserva_cent)}</span></div>
        <div><span>Manti venduti</span><span class="num">${manti(r.venduti_cent)}</span></div>
        <div><span>Manti bruciati</span><span class="num">− ${manti(r.bruciati_cent)}</span></div>
        <div class="tot"><span>${it(Number(r.riserva_cent) / 100, 2)} ÷ ${manti(r.circolazione_cent)}</span><span class="num">${valore === null ? '—' : prezzo4(valore) + ' €'}</span></div>
      </div>
      <p class="piccolo muto" style="margin-top:10px">Pagamenti, bonifici e stipendi spostano manti tra indirizzi e non toccano il totale. ${ultimoEstratto ? `L'estratto conto della riserva di ${ultimoEstratto[0]} dichiara ${euro(ultimoEstratto[1].saldo_cent)}: ${ultimoEstratto[1].nota ? `non coincide (${esc(ultimoEstratto[1].nota)})` : 'coincide con il registro'}. L'estratto è un'affermazione firmata dalla banca: è il punto in cui la fiducia entra nel sistema.` : 'Nessun estratto conto ancora pubblicato.'}</p>
    </div>
  </div>` : '';

  const aziende = r ? Object.entries(r.aziende).map(([, az]) => `<div class="sezione griglia g2">
    ${voci('Catalogo dei premi', 'Comportamento', az, az.catalogo, az.catalogo_v, valore, az.catalogo_dal, 'Importi fissi decisi dall\'azienda, pagati dal suo conto a fine mese insieme allo stipendio. Ogni azienda ha il suo catalogo.')}
    ${voci('Tariffario delle multe', 'Infrazione', az, az.tariffario, az.tariffario_v, valore, az.tariffario_dal, 'La polizia non può multare fuori da questa lista. Si paga entro 15 giorni o si contesta. Di ogni multa pagata, metà va alla polizia e metà viene bruciata: alza il valore per tutti.')}
  </div>`).join('') : '';

  const sentenze = r ? `<div class="sezione">
    <div class="testa"><h2>Sentenze del giudice</h2><span class="piccolo muto">${r.giudice ? `Istruzioni del giudice ${esc(r.giudice.versione)}, pubbliche · chiave nel registro` : 'nessun giudice registrato'}</span></div>
    <div class="card">
      ${r.sentenze.length ? r.sentenze.map((x) => `<div class="sentenza">
        <div class="cap"><span class="pill ${x.esito === 'annullata' ? 'ok' : 'bad'}">${esc(x.esito)}</span><b>${esc(x.numero)}</b> · ${esc(r.aziende[x.azienda]?.nome ?? '')} · ${esc(x.voce)} · ${manti(x.amount)} manti · giorno ${x.giorno} · istruzioni ${esc(x.versione)}</div>
        <div class="mot"><b>Decisione:</b> ${esc(x.motivazione)}</div>
      </div>`).join('') : '<div class="sentenza muto">Nessuna sentenza.</div>'}
    </div>
    <p class="piccolo muto" style="margin-top:8px">Contestazione e replica sono cifrate per il giudice: nel registro c'è solo la motivazione pubblica e l'hash del fascicolo. Verbali: ${r.verbali.totale} in tutto · ${r.verbali.aperti} aperti · ${r.verbali.pagati} pagati · ${r.verbali.contestati} contestati · ${r.verbali.annullati} annullati o ritirati · ${r.verbali.definitivi_non_saldati} definitivi non saldati.</p>
  </div>` : '';

  const inversa = [...righe].reverse();
  const tabella = inversa.length <= 250 ? inversa.map((x) => rigaRegistro(x, s)) : [
    ...inversa.slice(0, 200).map((x) => rigaRegistro(x, s)),
    `<tr><td class="r">…</td><td colspan="4" class="muto">righe da ${inversa.length - 201} a ${totali - 200}</td></tr>`,
    ...inversa.slice(-1).map((x) => rigaRegistro(x, s)),
  ];
  const registro = `<div class="sezione">
    <div class="testa"><h2>Registro</h2><span class="piccolo muto">${righe.length} righe${errore ? ` verificate su ${totali}` : ''} · <a href="ledger.jsonl">scarica ledger.jsonl</a> · <a href="stato.json">stato.json</a></span></div>
    <div class="card scroll">
      <table>
        <thead><tr><th class="r">#</th><th>Quando</th><th>Tipo</th><th>Dettaglio</th><th>Hash</th></tr></thead>
        <tbody>
          ${tabella.length ? tabella.join('\n          ') : '<tr><td colspan="5" class="muto">Registro vuoto.</td></tr>'}
        </tbody>
      </table>
    </div>
    <p class="piccolo muto" style="margin-top:8px">Nessun nome, mai. Ogni uscita va a un indirizzo usato una volta sola, che solo il destinatario riconosce. Gli importi tra correntisti non ci sono: al loro posto un impegno che il motore verifica senza leggerlo. Non si può sapere di chi è un indirizzo né sommare il saldo di nessuno.</p>
  </div>`;

  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Manti</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap">
<style>
${STILE}
</style>
</head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <symbol id="manto" viewBox="0 0 100 100">
    <path d="M28 80 V24 L50 52 L72 24 V80" stroke-width="11"/>
    <path d="M50 10 V92" stroke-width="7"/>
  </symbol>
</svg>
<div class="testata-sito">
  <div class="in">
    <div class="nome"><i><svg class="sym sym-tile"><use href="#manto"/></svg></i>Manti <span>${r?.giorno ? `registro al ${esc(r.giorno)}` : 'registro vuoto'}</span></div>
    <div class="link"><a href="ledger.jsonl">registro</a><a href="stato.json">stato</a><a href="https://github.com/ciboandre/messaggi">codice e regole</a></div>
  </div>
</div>
<section class="vista">
  ${avviso}
  ${hero}
  ${conto}
  ${aziende}
  ${sentenze}
  ${registro}

  <div class="sezione garanzie">
    <div class="card"><i></i><strong>Nessuno tocca i numeri</strong><span class="piccolo muto">Questa pagina la genera il motore ogni mattina rileggendo il registro da capo. Nessun numero è scritto a mano.</span></div>
    <div class="card"><i></i><strong>Ogni riga è firmata</strong><span class="piccolo muto">Chi chiede un movimento lo firma con la propria chiave. Ogni riga è agganciata alla precedente: cambiarne una rompe tutte quelle dopo.</span></div>
    <div class="card"><i></i><strong>Puoi rifare i conti</strong><span class="piccolo muto">Scarica registro e motore, esegui <code>node motore/pubblica.js</code>, e ottieni questa stessa pagina, byte per byte. Se non coincide, si vede.</span></div>
  </div>

  <div class="firma">
    <span>registro al <code>${esc(r?.giorno ?? '—')}</code></span><span>motore <code>${esc(VERSIONE_MOTORE)}</code></span><span>giudice <code>${esc(r?.giudice?.versione ?? '—')}</code></span><span>tetto <code>${euro(r?.tetto_cent ?? 0)}</code></span><span>ultima riga <code>${r?.ultima_riga ? `seq ${r.ultima_riga.seq} · ${corto(r.ultima_riga.hash, 6)}` : '—'}</code></span>
  </div>
</section>
</body>
</html>
`;
}
