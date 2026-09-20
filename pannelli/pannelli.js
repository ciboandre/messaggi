// I pannelli di azienda e polizia, dal mockup (mockup/index.html, viste
// "azienda" e "polizia"). Un solo file per l'ingresso: scegli il ruolo,
// le dodici parole (nuove o già tue), il PIN; poi il pannello del ruolo.
//
// L'azienda: conto e fine mese, premi da assegnare, compra manti,
// catalogo, tariffario, dipendenti, polizia. La polizia: nuovo verbale,
// verbali, contestazioni, conto polizia. Ogni azione è una riga firmata
// con la chiave del ruolo, mandata al server. L'anagrafica dei dipendenti
// sta nel browser e non entra mai nel registro.

import qrcode from 'qrcode-generator';
import { generaFrase, fraseValida, normalizzaFrase } from '../nucleo/frase.js';
import { identitaRuolo } from '../nucleo/ruoli.js';
import { creaIndirizzo, chiaveCausale, decodificaCoordinate, riconosci, coordinateLeggibili } from '../nucleo/portafoglio.js';
import { cifraCausale, decifraCausale } from '../nucleo/causale.js';
import { costruisciPagamento } from '../nucleo/pagamento.js';
import { prezzoAcquisto, mantiPerEuro, spazioSottoTetto, divisioneMulta } from '../nucleo/banca.js';
import { definitivoNonSaldato } from '../nucleo/multe.js';
import { $, esc, manti, euro, prezzo, giornoBreve, centesimi, cassaforte, anagrafica, bozze, invia, apriConto, menu, SIMBOLO } from './comune.js';

const vista = $('#vista');
let ruolo = null;       // 'azienda' | 'polizia'
let identita = null;    // { chiave, portafoglio, firmatario }
let conto = null;       // il conto del ruolo sul server
const mostra = (html) => { vista.innerHTML = html; window.scrollTo(0, 0); };
const errore = (id, e) => { const el = $(id); if (el) el.textContent = e?.message ?? String(e); };
const stato = () => /** @type {any} */ (conto.registro.stato);

// ── ingresso ──

function scegliRuolo() {
  $('#chi').textContent = 'pannelli';
  mostra(`<h1>Pannelli</h1><p class="muto" style="margin-top:6px;max-width:62ch">L'azienda paga stipendi e premi, scrive catalogo e tariffario, registra i dipendenti, nomina la polizia. La polizia emette verbali e replica alle contestazioni. Ogni azione è una riga firmata nel registro pubblico, senza nomi.</p>
    <div class="griglia g2" style="margin-top:20px">
      <div class="card pad form"><h2>Azienda</h2><p class="piccolo muto">${cassaforte.esiste('azienda') ? 'Le parole dell\'azienda sono in questo browser.' : 'Nessuna azienda in questo browser.'}</p><button class="btn primario largo" data-ruolo="azienda">Entra come azienda</button></div>
      <div class="card pad form"><h2>Polizia</h2><p class="piccolo muto">${cassaforte.esiste('polizia') ? 'Le parole della polizia sono in questo browser.' : 'Nessuna polizia in questo browser.'}</p><button class="btn primario largo" data-ruolo="polizia">Entra come polizia</button></div>
    </div>`);
  for (const b of document.querySelectorAll('[data-ruolo]')) b.onclick = () => { ruolo = b.dataset.ruolo; cassaforte.esiste(ruolo) ? pin() : parole(); };
}

function parole() {
  mostra(`<h1>${ruolo === 'azienda' ? 'Azienda' : 'Polizia'}: le dodici parole</h1>
    <div class="griglia g2" style="margin-top:16px">
      <div class="card pad form"><h2>Nuove</h2><p class="piccolo muto">Le parole sono la chiave del ruolo: chi le ha firma al posto tuo. Scrivile su carta.</p><button class="btn primario largo" id="nuove">Genera</button><div id="nuove-qui"></div></div>
      <div class="card pad form"><h2>Le ho già</h2><div class="campo"><textarea id="frase" autocapitalize="none" spellcheck="false" placeholder="dodici parole separate da spazi"></textarea></div><div class="errore" id="err"></div><button class="btn largo" id="usa">Avanti</button></div>
    </div>`);
  $('#nuove').onclick = () => {
    const f = generaFrase();
    $('#nuove-qui').innerHTML = `<div class="parole" style="margin-top:10px">${f.split(' ').map((p) => `<span>${esc(p)}</span>`).join('')}</div><button class="btn largo" style="margin-top:10px" id="scritte">Le ho scritte</button>`;
    $('#scritte').onclick = () => pin(f);
  };
  $('#usa').onclick = () => { const f = normalizzaFrase($('#frase').value); if (!fraseValida(f)) { errore('#err', 'Frase non valida.'); return; } pin(f); };
}

function pin(fraseNuova = null) {
  mostra(`<div class="card pad form" style="max-width:420px;margin:40px auto"><h2>${fraseNuova ? 'Scegli un PIN' : `PIN ${ruolo}`}</h2><p class="piccolo muto">Sei cifre: cifrano le parole in questo browser.</p><div class="campo"><input id="pin" inputmode="numeric" maxlength="6" type="password"></div><div class="errore" id="err"></div><button class="btn primario largo" id="apri">${fraseNuova ? 'Salva' : 'Apri'}</button>${fraseNuova ? '' : '<button class="btn largo" id="altre">Ho altre parole</button>'}</div>`);
  $('#pin').focus();
  const vai = async () => {
    const p = $('#pin').value;
    if (!/^\d{6}$/.test(p)) { errore('#err', 'Sei cifre.'); return; }
    let frase = fraseNuova;
    if (fraseNuova) await cassaforte.salva(ruolo, fraseNuova, p);
    else { frase = await cassaforte.apri(ruolo, p); if (!frase) { errore('#err', 'PIN sbagliato.'); return; } }
    identita = identitaRuolo(frase, ruolo);
    conto = apriConto(identita.portafoglio);
    mostra('<div class="muto" style="padding:40px;text-align:center">Leggo il registro…</div>');
    try { await conto.aggiorna(); } catch (e) { mostra(`<div class="nota bad">${esc(e.message)}</div>`); return; }
    (ruolo === 'azienda' ? pannelloAzienda : pannelloPolizia)();
    setInterval(async () => { try { if (await conto.aggiorna()) (ruolo === 'azienda' ? pannelloAzienda : pannelloPolizia)(); } catch {} }, 30000);
  };
  $('#apri').onclick = vai;
  $('#pin').onkeydown = (e) => { if (e.key === 'Enter') vai(); };
  if ($('#altre')) $('#altre').onclick = () => { if (confirm('Cancella le parole di questo ruolo da questo browser?')) { cassaforte.cancella(ruolo); parole(); } };
}
$('#esci').onclick = () => location.reload();

// ── azienda ──

function laMiaAzienda() { return stato().aziende?.[identita.chiave.pubblica] ?? null; }

function pannelloAzienda() {
  const az = laMiaAzienda();
  const s = stato();
  $('#chi').textContent = az ? az.nome : 'azienda non registrata';
  const saldo = conto.saldo();
  const v = conto.valore;
  const dip = anagrafica.attivi();
  const stipendio = bozze.leggi('stipendio', 0);
  const premi = bozze.leggi('premi', []);
  const trattenibili = az ? Object.entries(s.verbali ?? {}).filter(([, x]) => x.azienda === identita.chiave.pubblica && definitivoNonSaldato(s, x)) : [];
  const totPremi = premi.reduce((a, p) => a + p.amount, 0);
  const totTratt = trattenibili.reduce((a, [, x]) => a + x.amount, 0);
  const totale = dip.length * stipendio + totPremi + totTratt;
  const acquisti = conto.registro.righe.filter((r) => r.type === 'sale' && r.body.out.some((u) => conto.mie.has(`${r.hash}:${r.body.out.indexOf(u)}`)));

  mostra(`<div class="pann">${menu(['Il conto', { id: 'az-mese', nome: 'Conto e fine mese' }, { id: 'az-premi', nome: 'Premi da assegnare' }, { id: 'az-riserva', nome: 'Compra manti' }, 'Quando serve', { id: 'az-catalogo', nome: 'Catalogo' }, { id: 'az-tariffario', nome: 'Tariffario' }, 'Raramente', { id: 'az-dip', nome: 'Dipendenti' }, { id: 'az-polizia', nome: 'Polizia' }, { id: 'az-chiavi', nome: 'Chiavi' }])}
  <main>
    ${az ? '' : `<div class="nota" style="margin-bottom:16px"><b>Questa azienda non è ancora nel registro.</b> Dai alla banca la chiave e le coordinate qui sotto (sezione Chiavi): la banca la registra con <code>company.register</code>. Fino ad allora qui si prepara soltanto.</div>`}
    <div id="az-mese">
      <div class="testata">
        <div class="who"><i></i><div><div class="piccolo muto">${esc(az?.nome ?? 'Azienda')} · chiave <span class="mono">${esc(identita.chiave.pubblica.slice(0, 4))}…${esc(identita.chiave.pubblica.slice(-4))}</span></div><h1 style="font-size:1.6rem">Conto azienda</h1></div></div>
        <button class="btn primario" id="fine-mese" ${!az || totale === 0 || totale > saldo ? 'disabled' : ''}>Paga il fine mese</button>
      </div>
      <div class="saldo-card" style="margin-top:14px"><div class="tasso">1 manto = ${prezzo(v)}</div><div class="l">Saldo</div><div class="m">${SIMBOLO}${manti(saldo)}<small>manti</small></div><div class="e">≈ ${euro(conto.inEuro(saldo))} · pagati finora ${az ? manti(az.pagati_cent) : '—'} in stipendi, premi e trattenute</div></div>
      <div class="griglia g3" style="margin-top:16px">
        <div class="card stat"><h3>Stipendi</h3><div class="v">${manti(dip.length * stipendio)}<small> = ${dip.length} × ${manti(stipendio)}</small></div><div class="s">stipendio base uguale per tutti: <input id="stip" value="${(stipendio / 100).toFixed(2).replace('.', ',')}" style="width:80px;padding:4px 8px;border:0;border-radius:8px;background:var(--surface-2);color:var(--ink)"> manti</div></div>
        <div class="card stat"><h3>Premi preparati</h3><div class="v">${manti(totPremi)}</div><div class="s">${new Set(premi.map((p) => p.coordinate)).size} dipendenti · dal catalogo</div></div>
        <div class="card stat"><h3>Trattenute</h3><div class="v">${manti(totTratt)}</div><div class="s">${trattenibili.length ? trattenibili.map(([, x]) => `${esc(x.numero)} definitivo`).join(', ') : 'nessun verbale definitivo non saldato'}</div></div>
        <div class="card stat"><h3>Totale del fine mese</h3><div class="v">${manti(totale)}</div><div class="s">dal tuo conto · ${totale > saldo ? `<b class="errore">mancano ${manti(totale - saldo)}</b>` : `restano ${manti(saldo - totale)}`}</div></div>
        <div class="card stat"><h3>Ti bastano per</h3><div class="v">${totale > 0 ? Math.floor(saldo / totale) : '—'}<small> mesi</small></div><div class="s">a questo ritmo. Poi ricompri dalla banca</div></div>
        <div class="card stat"><h3>Valore dei tuoi manti</h3><div class="v">${v === null ? '—' : `+${((Number(v) - 10000) / 100).toFixed(1)}%`}</div><div class="s">dal lancio. Non può scendere</div></div>
      </div>
      <div class="errore" id="err-mese" style="margin-top:8px"></div>
    </div>

    <div class="sezione" id="az-premi">
      <div class="testa"><h2>Premi da assegnare</h2><span class="piccolo muto">catalogo v${az?.catalogo_v ?? 0} · importi fissi in manti</span></div>
      <div class="griglia g2">
        <div class="card pad form">
          <div class="campo"><label>Dipendente</label><select id="p-dip">${dip.map((d) => `<option value="${esc(d.coordinate)}">${esc(d.nome)}</option>`).join('')}</select></div>
          <div class="campo"><label>Comportamento</label><select id="p-voce">${Object.entries(az?.catalogo ?? {}).map(([c, x]) => `<option value="${esc(c)}">${esc(x.nome)} · ${manti(x.amount)}</option>`).join('')}</select></div>
          <div><button class="btn acc" id="p-agg" ${dip.length && Object.keys(az?.catalogo ?? {}).length ? '' : 'disabled'}>Aggiungi alla lista</button></div>
          <p class="piccolo muto">Le assegnazioni restano in bozza in questo browser fino alla firma del fine mese.</p>
        </div>
        <div class="card pad"><h3>Lista preparata</h3><div class="scroll" style="margin-top:8px"><table><thead><tr><th>Dipendente</th><th>Premio</th><th class="r">Manti</th><th></th></tr></thead><tbody>
          ${premi.length ? premi.map((p, i) => `<tr><td>${esc(anagrafica.tutti().find((d) => d.coordinate === p.coordinate)?.nome ?? '?')}</td><td class="muto piccolo">${esc(az?.catalogo?.[p.voce]?.nome ?? p.voce)}</td><td class="r">${manti(p.amount)}</td><td><a data-togli-premio="${i}" class="piccolo">togli</a></td></tr>`).join('') : '<tr><td colspan="4" class="muto">nessun premio in lista</td></tr>'}
        </tbody><tfoot><tr><td colspan="2">${premi.length} premi</td><td class="r">${manti(totPremi)}</td><td></td></tr></tfoot></table></div></div>
      </div>
    </div>

    <div class="sezione" id="az-riserva">
      <div class="testa"><h2>Compra manti dalla banca</h2><span class="piccolo muto">prezzo di oggi ${prezzo(prezzoAcquisto(s))} · spazio sotto il tetto ${euro(spazioSottoTetto(s))}</span></div>
      <div class="griglia g2">
        <div class="card pad form">
          <div class="campo"><label>Euro da spendere</label><input id="r-eur" value="500,00"></div>
          <div class="conto"><div><span>Prezzo di acquisto</span><span class="num">${prezzo(prezzoAcquisto(s))}</span></div><div><span>Ricevi</span><span class="num" id="r-manti">—</span></div><div class="tot"><span>Saldo dopo</span><span class="num" id="r-dopo">—</span></div></div>
          <p class="piccolo muto">Paghi gli euro alla banca fuori dal sistema e le dai le coordinate dell'azienda (sezione Chiavi). Quando li riceve, la banca firma la vendita e i manti arrivano qui. Il sovrapprezzo entra in riserva e alza il valore anche dei manti che hai già.</p>
        </div>
        <div class="card pad"><h3>I tuoi acquisti</h3><table style="margin-top:8px"><thead><tr><th>Quando</th><th class="r">Euro</th><th class="r">Prezzo</th><th class="r">Manti</th></tr></thead><tbody>
          ${acquisti.length ? acquisti.map((r) => `<tr><td>${giornoBreve(r.ts.slice(0, 10))}</td><td class="r">${euro(r.body.euro_cent)}</td><td class="r">${prezzo(r.body.prezzo)}</td><td class="r">${manti(r.body.out.reduce((a, u) => a + u.amount, 0))}</td></tr>`).join('') : '<tr><td colspan="4" class="muto">nessuno</td></tr>'}
        </tbody></table></div>
      </div>
    </div>

    ${vociSezione('az-catalogo', 'Catalogo dei premi', 'Comportamento', az?.catalogo ?? {}, az?.catalogo_v ?? 0, az?.catalogo_dal, 'vale da subito; i premi già assegnati non cambiano')}
    ${vociSezione('az-tariffario', 'Tariffario delle multe', 'Infrazione', az?.tariffario ?? {}, az?.tariffario_v ?? 0, az?.tariffario_dal, 'vale da subito; i verbali già emessi non cambiano. Metà di ogni multa viene bruciata')}

    <div class="sezione" id="az-dip">
      <div class="testa"><h2>Dipendenti</h2><span class="piccolo muto">solo in questo browser · <a id="esporta">esporta per la polizia</a></span></div>
      <div class="card scroll"><table><thead><tr><th>Nome</th><th>Coordinate</th><th>Dal</th><th>Stato</th><th></th></tr></thead><tbody>
        ${anagrafica.tutti().length ? anagrafica.tutti().map((d, i) => `<tr><td>${esc(d.nome)}</td><td class="mono">${esc(coordinateLeggibili(d.coordinate).slice(0, 14))}…</td><td>${esc(d.dal)}</td><td>${d.attivo ? '<span class="pill ok">attivo</span>' : '<span class="pill">cessato</span>'}</td><td><a data-dip-toggle="${i}" class="piccolo">${d.attivo ? 'cessa' : 'riattiva'}</a></td></tr>`).join('') : '<tr><td colspan="5" class="muto">nessuno</td></tr>'}
      </tbody></table></div>
      <div class="card pad form" style="margin-top:12px;max-width:640px"><b>Registra un dipendente</b><div class="campo"><input id="d-nome" placeholder="nome"></div><div class="campo"><input id="d-coord" placeholder="coordinate mnt1… (dall'app del dipendente: Compra → copia)" autocapitalize="none"></div><div class="errore" id="err-dip"></div><button class="btn acc" id="d-agg">Registra</button></div>
      <p class="piccolo muto" style="margin-top:8px">Vedi quanto hai pagato a ciascuno. <b>Non vedi il saldo</b>: dopo che i manti sono arrivati, cosa ne hanno fatto non lo sa nessuno. Da qui non si toglie nulla a nessuno.</p>
    </div>

    <div class="sezione" id="az-polizia">
      <div class="testa"><h2>Polizia</h2></div>
      <div class="card pad form" style="max-width:560px">
        <div class="conto"><div><span>In carica</span><span class="mono">${az?.polizia ? esc(az.polizia.chiave.slice(0, 8)) + '…' : 'nessuna'}</span></div></div>
        <div class="campo"><label>Chiave pubblica della nuova polizia</label><input id="pol-chiave" placeholder="64 esadecimali (dal pannello polizia, Chiavi)" autocapitalize="none"></div>
        <div class="campo"><label>Coordinate della polizia (il suo conto)</label><input id="pol-coord" placeholder="mnt1…" autocapitalize="none"></div>
        <div class="errore" id="err-pol"></div>
        <div><button class="btn" id="pol-nomina" ${az ? '' : 'disabled'}>Firma la nomina</button></div>
        <p class="piccolo muto">La polizia in carica smette di poter emettere verbali dal momento della nomina. Il suo conto resta il conto della polizia.</p>
      </div>
    </div>

    <div class="sezione" id="az-chiavi">
      <div class="testa"><h2>Chiavi</h2></div>
      <div class="card pad form" style="max-width:640px">
        <div><b>Chiave pubblica dell'azienda</b><br><span class="mono" style="word-break:break-all">${esc(identita.chiave.pubblica)}</span></div>
        <div><b>Coordinate dell'azienda</b> (il conto: qui arrivano i manti comprati)<br><span class="mono" style="word-break:break-all">${esc(coordinateLeggibili(identita.portafoglio.coordinate))}</span></div>
        <p class="piccolo muto">La banca registra l'azienda con chiave, coordinate e nome: <code>node banca/cli.js azienda &lt;chiave&gt; &lt;coordinate&gt; "Nome"</code>.</p>
      </div>
    </div>
    <div class="firma"><span>Pannello dell'azienda · ogni azione qui è una transazione firmata con la chiave azienda e finisce nel registro pubblico, senza nomi.</span></div>
  </main></div>`);

  // stipendio e compra: calcoli
  $('#stip').onchange = () => { try { bozze.scrivi('stipendio', centesimi($('#stip').value)); pannelloAzienda(); } catch (e) { errore('#err-mese', e); } };
  const compra = () => { try { const e = centesimi($('#r-eur').value); const m = mantiPerEuro(BigInt(e), prezzoAcquisto(s)); $('#r-manti').textContent = manti(m) + ' manti'; $('#r-dopo').textContent = manti(BigInt(saldo) + m) + ' manti'; } catch { $('#r-manti').textContent = '—'; } };
  $('#r-eur').oninput = compra; compra();
  // premi
  if ($('#p-agg')) $('#p-agg').onclick = () => { const voce = $('#p-voce').value; premi.push({ coordinate: $('#p-dip').value, voce, amount: az.catalogo[voce].amount }); bozze.scrivi('premi', premi); pannelloAzienda(); };
  for (const a of document.querySelectorAll('[data-togli-premio]')) a.onclick = () => { premi.splice(Number(a.dataset.togliPremio), 1); bozze.scrivi('premi', premi); pannelloAzienda(); };
  // dipendenti
  $('#d-agg').onclick = () => {
    const coord = $('#d-coord').value.trim().replace(/\s+/g, '').toLowerCase();
    try { decodificaCoordinate(coord); } catch { errore('#err-dip', 'Coordinate non valide.'); return; }
    if (!$('#d-nome').value.trim()) { errore('#err-dip', 'Nome?'); return; }
    anagrafica.salva([...anagrafica.tutti().filter((d) => d.coordinate !== coord), { nome: $('#d-nome').value.trim(), coordinate: coord, dal: new Date().toISOString().slice(0, 10), attivo: true }]);
    pannelloAzienda();
  };
  for (const a of document.querySelectorAll('[data-dip-toggle]')) a.onclick = () => { const l = anagrafica.tutti(); l[Number(a.dataset.dipToggle)].attivo = !l[Number(a.dataset.dipToggle)].attivo; anagrafica.salva(l); pannelloAzienda(); };
  $('#esporta').onclick = async () => { await navigator.clipboard.writeText(JSON.stringify(anagrafica.tutti())); $('#esporta').textContent = 'copiato: incolla nel pannello polizia'; };
  // catalogo e tariffario
  legaVoci('az-catalogo', 'catalog.set', az);
  legaVoci('az-tariffario', 'tariff.set', az);
  // polizia
  $('#pol-nomina').onclick = async () => {
    const chiave = $('#pol-chiave').value.trim().toLowerCase(); const coord = $('#pol-coord').value.trim().replace(/\s+/g, '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(chiave)) { errore('#err-pol', 'Chiave: 64 esadecimali.'); return; }
    try { decodificaCoordinate(coord); } catch { errore('#err-pol', 'Coordinate non valide.'); return; }
    try { await invia(conto, () => ({ type: 'police.appoint', body: { azienda: identita.chiave.pubblica, chiave, coordinate: coord }, firmatari: [identita.firmatario] })); pannelloAzienda(); } catch (e) { errore('#err-pol', e); }
  };
  // fine mese
  $('#fine-mese').onclick = async () => {
    if (!confirm(`Paghi ${manti(totale)} manti: ${dip.length} stipendi, ${premi.length} premi, ${trattenibili.length} trattenute. Definitivo.`)) return;
    $('#fine-mese').classList.add('attesa');
    try {
      await invia(conto, (reg) => {
        const destinazioni = [
          ...dip.map((d) => ({ coordinate: d.coordinate, amount: stipendio, tag: 'stipendio', causale: `stipendio ${reg.stato.giorno?.slice(0, 7) ?? ''}` })),
          ...premi.map((p) => ({ coordinate: p.coordinate, amount: p.amount, tag: 'premio', voce: p.voce, causale: az.catalogo[p.voce]?.nome })),
        ].filter((d) => d.amount > 0);
        const { body, firmatari } = costruisciPagamento({ portafoglio: identita.portafoglio, disponibili: conto.disponibili(), destinazioni, trattenute: trattenibili.map(([id]) => id), stato: reg.stato });
        const out = body.out.map((u) => (u.tag === undefined && u.addr !== null ? { ...u, tag: 'resto' } : u));
        return { type: 'payout', body: { azienda: identita.chiave.pubblica, in: body.in, out, ...(body.trattenute ? { trattenute: body.trattenute } : {}) }, firmatari: [identita.firmatario, ...firmatari] };
      });
      bozze.scrivi('premi', []);
      pannelloAzienda();
    } catch (e) { errore('#err-mese', e); $('#fine-mese').classList.remove('attesa'); }
  };
}

/** Catalogo o tariffario: tabella modificabile, "Firma e pubblica" manda la lista completa. */
function vociSezione(id, titolo, colonna, mappa, v, dal, nota) {
  const righe = Object.entries(mappa);
  return `<div class="sezione" id="${id}">
    <div class="testa"><h2>${titolo}</h2><span class="piccolo muto">v${v}${dal ? ` · dal ${giornoBreve(dal)}` : ''}</span></div>
    <div class="card pad"><div class="scroll"><table><thead><tr><th>Codice</th><th>${colonna}</th><th>Regola</th><th class="r">Manti</th><th></th></tr></thead><tbody id="${id}-righe">
      ${righe.map(([c, x]) => rigaVoce(c, x.nome, x.descrizione ?? '', x.amount)).join('')}
    </tbody></table></div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-top:14px">
      <button class="btn" data-aggiungi="${id}">+ Aggiungi</button>
      <div><button class="btn primario" data-firma="${id}">Firma e pubblica</button> <span class="piccolo muto" style="margin-left:8px">${nota}</span></div>
    </div><div class="errore" id="err-${id}"></div></div></div>`;
}
const rigaVoce = (c, nome, desc, amount) => `<tr><td><input class="cat-in" data-c value="${esc(c)}" placeholder="codice" style="width:110px"></td><td><input class="cat-in" data-n value="${esc(nome)}" placeholder="nome"></td><td><input class="cat-in muto piccolo" data-d value="${esc(desc)}" placeholder="regola, facoltativa"></td><td class="r"><input class="cat-q" data-a value="${amount ? (amount / 100).toFixed(2).replace('.', ',') : ''}"></td><td><a class="piccolo" data-togli-riga>togli</a></td></tr>`;
function legaVoci(id, type, az) {
  const corpo = $(`#${id}-righe`);
  const lega = () => { for (const a of corpo.querySelectorAll('[data-togli-riga]')) a.onclick = () => { a.closest('tr').remove(); }; };
  lega();
  $(`[data-aggiungi="${id}"]`).onclick = () => { corpo.insertAdjacentHTML('beforeend', rigaVoce('', '', '', 0)); lega(); };
  $(`[data-firma="${id}"]`).onclick = async () => {
    if (!az) { errore(`#err-${id}`, 'Prima la banca deve registrare l\'azienda.'); return; }
    try {
      const voci = [...corpo.querySelectorAll('tr')].map((tr) => ({ codice: tr.querySelector('[data-c]').value.trim().toLowerCase(), nome: tr.querySelector('[data-n]').value.trim(), ...(tr.querySelector('[data-d]').value.trim() ? { descrizione: tr.querySelector('[data-d]').value.trim() } : {}), amount: centesimi(tr.querySelector('[data-a]').value) }));
      await invia(conto, () => ({ type, body: { azienda: identita.chiave.pubblica, voci }, firmatari: [identita.firmatario] }));
      pannelloAzienda();
    } catch (e) { errore(`#err-${id}`, e); }
  };
}

// ── polizia ──

function laMiaAziendaDiPolizia() {
  return Object.entries(stato().aziende ?? {}).find(([, a]) => a.polizia?.chiave === identita.chiave.pubblica) ?? null;
}

function pannelloPolizia() {
  const s = stato();
  const trovata = laMiaAziendaDiPolizia();
  const [azChiave, az] = trovata ?? [null, null];
  $('#chi').textContent = az ? `polizia di ${az.nome}` : 'polizia non nominata';
  const dip = anagrafica.attivi();
  const legami = bozze.leggi('verbali', {}); // numero → coordinate del dipendente, solo qui
  const miei = az ? Object.values(s.verbali ?? {}).filter((v) => v.azienda === azChiave).sort((a, b) => b.giorno - a.giorno) : [];
  const nomeDi = (numero) => anagrafica.tutti().find((d) => d.coordinate === legami[numero])?.nome ?? '—';
  const contestati = miei.filter((v) => v.stato === 'contestato' && !v.replica);
  const mese = s.giorno?.slice(0, 7);
  const delMese = miei.filter((v) => v.data?.slice(0, 7) === mese);
  const saldo = conto.saldo();
  const pillStato = (v) => v.stato === 'aperto' ? (definitivoNonSaldato(s, v) ? '<span class="pill bad">definitivo, non pagato</span>' : '<span class="pill warn">in attesa</span>') : v.stato === 'pagato' ? `<span class="pill ok">${v.come === 'trattenuto' ? 'trattenuto' : 'pagato'}</span>` : v.stato === 'contestato' ? '<span class="pill acc">contestato</span>' : v.stato === 'confermato' ? '<span class="pill bad">confermato, da pagare</span>' : `<span class="pill">${esc(v.stato)}</span>`;

  mostra(`<div class="pann">${menu(['Ogni giorno', { id: 'po-nuovo', nome: 'Nuovo verbale' }, { id: 'po-verbali', nome: 'Verbali' }, { id: 'po-cont', nome: 'Contestazioni', pill: contestati.length || null }, 'Il conto', { id: 'po-conto', nome: 'Conto polizia' }, { id: 'po-chiavi', nome: 'Chiavi' }])}
  <main>
    ${az ? '' : '<div class="nota" style="margin-bottom:16px"><b>Nessuna azienda ti ha nominato.</b> Dai all\'azienda la chiave e le coordinate qui sotto (sezione Chiavi).</div>'}
    <div id="po-nuovo">
      <div class="testata"><div class="who"><i style="background:linear-gradient(135deg,var(--bad),#FF8A5B)"></i><div><div class="piccolo muto">Polizia${az ? ` di ${esc(az.nome)}` : ''} · chiave <span class="mono">${esc(identita.chiave.pubblica.slice(0, 4))}…${esc(identita.chiave.pubblica.slice(-4))}</span></div><h1 style="font-size:1.6rem">Nuovo verbale</h1></div></div></div>
      <div class="griglia g2" style="margin-top:16px">
        <div class="card pad form">
          <div class="campo"><label>Dipendente</label><select id="v-dip">${dip.map((d) => `<option value="${esc(d.coordinate)}">${esc(d.nome)}</option>`).join('')}</select>${dip.length ? '' : '<span class="piccolo muto">nessun dipendente: importa l\'elenco dall\'azienda (Chiavi)</span>'}</div>
          <div class="campo"><label>Infrazione, dal tariffario</label><select id="v-voce">${Object.entries(az?.tariffario ?? {}).map(([c, x]) => `<option value="${esc(c)}">${esc(x.nome)} · ${manti(x.amount)}</option>`).join('')}</select></div>
          <div class="campo"><label>Descrizione, la legge il multato e, se contesta, il giudice</label><textarea id="v-desc" maxlength="140"></textarea></div>
          <div class="conto"><div><span>Importo</span><span class="num" id="v-imp">—</span></div><div><span>Giorni per pagare o contestare</span><span>${s.genesi?.parametri.giorni_multa ?? 15}</span></div><div class="tot"><span>Da pagare a</span><span>conto polizia</span></div></div>
          <div class="errore" id="err-v"></div>
          <button class="btn pericolo" id="v-emetti" ${az && dip.length && Object.keys(az.tariffario).length && s.giorno ? '' : 'disabled'}>Firma ed emetti il verbale</button>
          <p class="piccolo muto">Il multato lo vede subito nell'app. Nel registro pubblico compare numero, infrazione e importo, non il nome. Non puoi cambiare l'importo: lo fissa il tariffario.${s.giorno ? '' : ' Serve un giorno aperto dalla banca.'}</p>
        </div>
        <div class="card pad"><h3>${mese ?? 'Questo mese'} finora</h3>
          <div class="griglia g2" style="margin-top:10px">
            <div class="stat" style="padding:0"><div class="v">${delMese.length}</div><div class="s">verbali emessi</div></div>
            <div class="stat" style="padding:0"><div class="v">${manti(delMese.reduce((a, v) => a + v.amount, 0))}</div><div class="s">manti multati · metà bruciati se pagati</div></div>
            <div class="stat" style="padding:0"><div class="v">${delMese.filter((v) => v.stato === 'pagato').length}</div><div class="s">pagati</div></div>
            <div class="stat" style="padding:0"><div class="v">${delMese.filter((v) => v.stato === 'aperto').length} · ${delMese.filter((v) => v.stato === 'contestato').length} · ${delMese.filter((v) => v.stato === 'annullato' || v.stato === 'ritirato').length}</div><div class="s">in attesa · contestati · annullati</div></div>
          </div>
          <div class="nota piccolo" style="margin-top:14px">Puoi multare solo da tariffario. Ogni verbale è pubblico e contestabile. Se il giudice ti annulla troppi verbali, l'azienda può nominare un'altra polizia.</div>
        </div>
      </div>
    </div>

    <div class="sezione" id="po-verbali"><div class="testa"><h2>Verbali</h2></div>
      <div class="card scroll"><table><thead><tr><th>N.</th><th>Quando</th><th>Dipendente</th><th>Infrazione</th><th class="r">Manti</th><th>Stato</th><th></th></tr></thead><tbody>
        ${miei.length ? miei.map((v) => `<tr><td>${esc(v.numero)}</td><td>${giornoBreve(v.data)}</td><td>${esc(nomeDi(v.numero))}</td><td>${esc(az.tariffario[v.voce]?.nome ?? v.voce)}</td><td class="r">${manti(v.amount)}</td><td>${pillStato(v)}</td><td>${v.stato === 'aperto' ? `<a class="piccolo" data-ritira="${esc(v.numero)}">ritira</a>` : ''}</td></tr>`).join('') : '<tr><td colspan="7" class="muto">nessun verbale</td></tr>'}
      </tbody></table></div>
      <div class="errore" id="err-verbali"></div>
      <p class="piccolo muto" style="margin-top:8px">Un verbale scaduto senza pagamento né contestazione è definitivo: l'azienda lo trattiene dallo stipendio, metà al conto polizia e metà bruciata, e il multato non può convertire finché non è saldato.</p>
    </div>

    <div class="sezione" id="po-cont"><div class="testa"><h2>Contestazioni aperte</h2></div>
      ${contestati.length ? contestati.map((v) => {
        const r = riconosci(v.contestazione.polizia, identita.portafoglio);
        const testo = r ? decifraCausale(chiaveCausale(r.k), v.contestazione.polizia.memo) : null;
        return `<div class="card pad form" style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><b class="cifra" style="font-size:1.15rem">${esc(v.numero)} · ${esc(az.tariffario[v.voce]?.nome ?? v.voce)} · ${manti(v.amount)} manti</b><span class="piccolo muto">${esc(nomeDi(v.numero))} · contestato il giorno ${v.contestato_giorno}</span></div>
          <div class="conto"><div><span>La contestazione</span><span style="text-align:right;max-width:60%">${testo ? `"${esc(testo)}"` : '<i class="muto">non leggibile con queste chiavi</i>'}</span></div></div>
          <div class="campo"><label>La tua replica, facoltativa. La legge solo il giudice</label><textarea data-rep="${esc(v.numero)}" maxlength="140"></textarea></div>
          <div><button class="btn primario" data-replica="${esc(v.numero)}">Invia la replica</button></div>
          <div class="errore" id="err-rep-${esc(v.numero)}"></div>
          <div class="nota info piccolo">Il giudice decide dopo la replica o dopo 3 giorni senza. Non sa chi è il multato né chi sei tu: legge solo verbale, tariffario, contestazione e replica.</div>
        </div>`;
      }).join('') : '<div class="card pad muto">Nessuna contestazione in attesa di replica.</div>'}
    </div>

    <div class="sezione" id="po-conto"><div class="testa"><h2>Conto polizia</h2></div>
      <div class="griglia g2">
        <div class="card pad"><div class="saldo-card" style="background:linear-gradient(135deg,#3A1518,var(--bad) 60%,#FF8A5B)"><div class="l">Saldo</div><div class="m">${SIMBOLO}${manti(saldo)}<small>manti</small></div><div class="e">≈ ${euro(conto.inEuro(saldo))} · metà delle multe pagate; l'altra metà è bruciata</div></div>
          <p class="piccolo muto" style="margin-top:12px">È un conto come gli altri: le stesse dodici parole nell'<a href="../app/">app</a> lo aprono, per bonifici e conversioni. Anche qui, nessuno vede il saldo dal registro.</p></div>
        <div class="card pad"><h3>Ultime entrate</h3><div class="lista" style="margin-top:8px;box-shadow:none;background:var(--surface-2)">
          ${conto.movimenti().slice(0, 8).map((m) => `<div class="voce"><div class="av ${m.netto >= 0 ? 'multa' : ''}">${m.netto >= 0 ? '!' : '↑'}</div><div class="t"><b>${esc(m.titolo)}</b><span>${giornoBreve(m.ts.slice(0, 10))} · ${esc(m.sotto)}</span></div><div class="imp ${m.netto >= 0 ? 'piu' : ''}">${m.netto >= 0 ? '+' : '−'}${manti(Math.abs(m.netto))}</div></div>`).join('') || '<div class="voce"><div class="t muto piccolo">nessuna</div></div>'}
        </div></div>
      </div>
    </div>

    <div class="sezione" id="po-chiavi"><div class="testa"><h2>Chiavi</h2></div>
      <div class="card pad form" style="max-width:640px">
        <div><b>Chiave pubblica della polizia</b><br><span class="mono" style="word-break:break-all">${esc(identita.chiave.pubblica)}</span></div>
        <div><b>Coordinate della polizia</b> (il conto)<br><span class="mono" style="word-break:break-all">${esc(coordinateLeggibili(identita.portafoglio.coordinate))}</span></div>
        <p class="piccolo muto">L'azienda le mette nella nomina (pannello azienda → Polizia).</p>
        <div class="campo"><label>Elenco dei dipendenti, esportato dal pannello azienda</label><textarea id="importa" placeholder='[{"nome":…}]'></textarea></div><button class="btn" id="importa-btn">Importa</button><div class="errore" id="err-imp"></div>
      </div>
    </div>
    <div class="firma"><span>Pannello della polizia · verbali e repliche sono firmati con la chiave polizia. Il conto è un conto normale.</span></div>
  </main></div>`);

  const importo = () => { const x = az?.tariffario?.[$('#v-voce').value]; $('#v-imp').textContent = x ? manti(x.amount) + ' manti' : '—'; };
  $('#v-voce').onchange = importo; importo();
  $('#v-emetti').onclick = async () => {
    const coord = $('#v-dip').value; const voce = $('#v-voce').value; const desc = $('#v-desc').value.trim();
    if (!desc) { errore('#err-v', 'Serve una descrizione.'); return; }
    $('#v-emetti').classList.add('attesa');
    try {
      const numero = `V-${miei.length + 1}`;
      await invia(conto, (reg) => {
        const c = creaIndirizzo(coord);
        return { type: 'fine.issue', body: { azienda: azChiave, numero, voce, amount: reg.stato.aziende[azChiave].tariffario[voce].amount, consegna: { addr: c.addr, eph: c.eph, memo: cifraCausale(chiaveCausale(c.k), desc) } }, firmatari: [identita.firmatario] };
      });
      legami[numero] = coord; bozze.scrivi('verbali', legami);
      pannelloPolizia();
    } catch (e) { errore('#err-v', e); $('#v-emetti').classList.remove('attesa'); }
  };
  for (const a of document.querySelectorAll('[data-ritira]')) a.onclick = async () => {
    const motivazione = prompt(`Ritiri ${a.dataset.ritira}. Motivazione pubblica:`); if (!motivazione) return;
    try { await invia(conto, () => ({ type: 'fine.withdraw', body: { verbale: `${azChiave}:${a.dataset.ritira}`, motivazione }, firmatari: [identita.firmatario] })); pannelloPolizia(); } catch (e) { errore('#err-verbali', e); }
  };
  for (const b of document.querySelectorAll('[data-replica]')) b.onclick = async () => {
    const numero = b.dataset.replica; const testo = $(`[data-rep="${numero}"]`).value.trim();
    if (!testo) { errore(`#err-rep-${numero}`, 'Scrivi la replica, o lascia decidere il giudice dopo 3 giorni.'); return; }
    try {
      await invia(conto, (reg) => { const i = creaIndirizzo(reg.stato.giudice.coordinate); return { type: 'fine.reply', body: { verbale: `${azChiave}:${numero}`, giudice: { addr: i.addr, eph: i.eph, memo: cifraCausale(chiaveCausale(i.k), testo) } }, firmatari: [identita.firmatario] }; });
      pannelloPolizia();
    } catch (e) { errore(`#err-rep-${numero}`, e); }
  };
  $('#importa-btn').onclick = () => { try { const l = JSON.parse($('#importa').value); if (!Array.isArray(l)) throw new Error('x'); anagrafica.salva(l); pannelloPolizia(); } catch { errore('#err-imp', 'Incolla l\'elenco esportato dal pannello azienda.'); } };
}

scegliRuolo();
