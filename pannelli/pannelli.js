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
import { prezzoAcquisto, prezzoConversione, mantiPerEuro, euroPerManti, spazioSottoTetto, valore } from '../nucleo/banca.js';
import { definitivoNonSaldato } from '../nucleo/multe.js';
import { apriDatiConversione } from '../nucleo/conversione.js';
import { sha256 } from '../nucleo/canonico.js';
import { $, esc, manti, euro, prezzo, giornoBreve, centesimi, cassaforte, anagrafica, bozze, invia, apriConto, menu, SIMBOLO } from './comune.js';

const vista = $('#vista');
let ruolo = null;       // 'azienda' | 'polizia' | 'banca'
let identita = null;    // { chiave, portafoglio, firmatario }
let conto = null;       // il conto del ruolo sul server
const mostra = (html) => { vista.innerHTML = html; window.scrollTo(0, 0); };
const errore = (id, e) => { const el = $(id); if (el) el.textContent = e?.message ?? String(e); };
const stato = () => /** @type {any} */ (conto.registro.stato);

// ── ingresso ──

function scegliRuolo() {
  $('#chi').textContent = 'pannelli';
  mostra(`<h1>Pannelli</h1><p class="muto" style="margin-top:6px;max-width:62ch">L'azienda paga stipendi e premi, scrive catalogo e tariffario, registra i dipendenti, nomina la polizia. La polizia emette verbali e replica alle contestazioni. Ogni azione è una riga firmata nel registro pubblico, senza nomi.</p>
    <div class="griglia g3" style="margin-top:20px">
      <div class="card pad form"><h2>Azienda</h2><p class="piccolo muto">${cassaforte.esiste('azienda') ? 'Le parole dell\'azienda sono in questo browser.' : 'Nessuna azienda in questo browser.'}</p><button class="btn primario largo" data-ruolo="azienda">Entra come azienda</button></div>
      <div class="card pad form"><h2>Polizia</h2><p class="piccolo muto">${cassaforte.esiste('polizia') ? 'Le parole della polizia sono in questo browser.' : 'Nessuna polizia in questo browser.'}</p><button class="btn primario largo" data-ruolo="polizia">Entra come polizia</button></div>
      <div class="card pad form"><h2>Banca</h2><p class="piccolo muto">${cassaforte.esiste('banca') ? 'Le parole della banca sono in questo browser.' : 'Solo sul dispositivo dedicato della banca.'}</p><button class="btn largo" data-ruolo="banca">Entra come banca</button></div>
    </div>`);
  for (const b of document.querySelectorAll('[data-ruolo]')) b.onclick = () => { ruolo = b.dataset.ruolo; cassaforte.esiste(ruolo) ? pin() : parole(); };
}

function parole() {
  mostra(`<h1>${{ azienda: 'Azienda', polizia: 'Polizia', banca: 'Banca' }[ruolo]}: le dodici parole</h1>
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
    pannello();
    setInterval(async () => { try { if (await conto.aggiorna()) pannello(); } catch {} }, 30000);
  };
  $('#apri').onclick = vai;
  $('#pin').onkeydown = (e) => { if (e.key === 'Enter') vai(); };
  if ($('#altre')) $('#altre').onclick = () => { if (confirm('Cancella le parole di questo ruolo da questo browser?')) { cassaforte.cancella(ruolo); parole(); } };
}
const pannello = () => ({ azienda: pannelloAzienda, polizia: pannelloPolizia, banca: pannelloBanca })[ruolo]();
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

    ${sezioneChiavi("Chiave pubblica dell'azienda", "Coordinate dell'azienda (il conto: qui arrivano i manti comprati)")}
    <p class="piccolo muto" style="margin-top:8px">La banca registra l'azienda con chiave, coordinate e nome, dal suo pannello (Aziende e giudice).</p>
    <div class="firma"><span>Pannello dell'azienda · ogni azione qui è una transazione firmata con la chiave azienda e finisce nel registro pubblico, senza nomi.</span></div>
  </main></div>`);

  legaParole();
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

    ${sezioneChiavi('Chiave pubblica della polizia', 'Coordinate della polizia (il conto)')}
    <div class="card pad form" style="max-width:640px;margin-top:12px"><p class="piccolo muto">L'azienda le mette nella nomina (pannello azienda → Polizia).</p><div class="campo"><label>Elenco dei dipendenti, esportato dal pannello azienda</label><textarea id="importa" placeholder='[{"nome":…}]'></textarea></div><button class="btn" id="importa-btn">Importa</button><div class="errore" id="err-imp"></div></div>
    <div class="firma"><span>Pannello della polizia · verbali e repliche sono firmati con la chiave polizia. Il conto è un conto normale.</span></div>
  </main></div>`);

  legaParole();
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

/** Chiavi del ruolo e le parole, mostrate solo con il PIN. Vale per tutti i ruoli. */
function sezioneChiavi(titoloChiave, titoloCoord) {
  return `<div class="sezione" id="${ruolo === 'banca' ? 'ba' : ruolo === 'azienda' ? 'az' : 'po'}-chiavi"><div class="testa"><h2>Chiavi e parole</h2></div>
    <div class="card pad form" style="max-width:640px">
      <div><b>${titoloChiave}</b><br><span class="mono" style="word-break:break-all">${esc(identita.chiave.pubblica)}</span></div>
      <div><b>${titoloCoord}</b><br><span class="mono" style="word-break:break-all">${esc(coordinateLeggibili(identita.portafoglio.coordinate))}</span></div>
      <div><b>Le dodici parole</b><p class="piccolo muto">Sono in questo browser, cifrate con il PIN. Il foglio resta l'unica copia che sopravvive al browser.</p><button class="btn" id="mostra-parole">Mostra con il PIN</button><div id="parole-qui"></div></div>
    </div></div>`;
}
function legaParole() {
  const b = $('#mostra-parole');
  if (!b) return;
  b.onclick = async () => {
    const p = prompt('PIN'); if (p === null) return;
    const f = await cassaforte.apri(ruolo, p);
    $('#parole-qui').innerHTML = f ? `<div class="parole" style="margin-top:8px">${f.split(' ').map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : '<div class="errore">PIN sbagliato.</div>';
  };
}

// ── banca ──

const identificati = {
  tutti() { return JSON.parse(localStorage.getItem('manti.identificati') ?? '[]'); },
  salva(l) { localStorage.setItem('manti.identificati', JSON.stringify(l)); },
};
/** Le vendite fatte da questo pannello: a chi, per ricordarlo (nel registro c'è solo l'indirizzo). */
const vendite = { tutte() { return bozze.leggi('vendite', {}); }, nota(hash, chi) { const v = this.tutte(); v[hash] = chi; bozze.scrivi('vendite', v); } };

function pannelloBanca() {
  const s = stato();
  const sonoLaBanca = !s.genesi || s.genesi.banca.chiave === identita.chiave.pubblica;
  if (!s.genesi) {
    $('#chi').textContent = 'banca · registro vuoto';
    mostra(`<div class="card pad form" style="max-width:560px;margin:30px auto"><h2>Registro vuoto: la genesi</h2><p class="piccolo muto">La riga 0: la chiave e le coordinate di questa banca, e i parametri delle regole (sovrapprezzo 5%, commissione 2%, multe bruciate 50%, 15 giorni). Una volta sola.</p><div class="campo"><label>Tetto della riserva, in euro</label><input id="ge-tetto" value="4000,00"></div><div class="errore" id="err-ge"></div><button class="btn primario largo" id="ge-firma">Firma la genesi</button></div>`);
    $('#ge-firma').onclick = async () => { try { await invia(conto, () => ({ type: 'genesis', body: { banca: { chiave: identita.chiave.pubblica, coordinate: identita.portafoglio.coordinate }, parametri: { sovrapprezzo_pct: 5, commissione_pct: 2, multe_bruciate_pct: 50, tetto_cent: centesimi($('#ge-tetto').value), giorni_multa: 15 } }, firmatari: [identita.firmatario] })); pannelloBanca(); } catch (e) { errore('#err-ge', e); } };
    return;
  }
  $('#chi').textContent = sonoLaBanca ? 'banca' : 'chiave non della banca';
  const v = valore(s);
  const riserva = s.riserva_cent ?? 0n; const tetto = s.tetto_cent ?? 0n;
  const oggi = new Date().toISOString().slice(0, 10);
  const giornoAperto = s.giorno === oggi;
  const conversioni = Object.entries(s.conversioni ?? {}).map(([hash, c]) => ({ hash, ...c, riga: conto.registro.righe.find((r) => r.hash === hash) })).sort((a, b) => b.seq - a.seq);
  const inAttesa = conversioni.filter((c) => c.stato === 'richiesta');
  const dati = (c) => (c.riga ? apriDatiConversione(c.riga.body.dati, identita.portafoglio) : null);
  const eIdentificato = (testo) => identificati.tutti().some((i) => testo && testo.includes(i.nome));
  const righeVendite = conto.registro.righe.filter((r) => r.type === 'sale').reverse();
  const interessi = conto.registro.righe.filter((r) => r.type === 'reserve.interest');
  const aziende = Object.entries(s.aziende ?? {});
  const pct = tetto > 0n ? Number((riserva * 100n) / tetto) : 0;

  mostra(`<div class="pann">${menu(['Ogni giorno', { id: 'ba-riserva', nome: 'Riserva' }, { id: 'ba-vendite', nome: 'Vendite' }, { id: 'ba-conv', nome: 'Conversioni', pill: inAttesa.length || null }, 'Ogni mese', { id: 'ba-interessi', nome: 'Interessi ed estratto' }, 'Raramente', { id: 'ba-tetto', nome: 'Tetto' }, { id: 'ba-ident', nome: 'Identificazioni' }, { id: 'ba-aziende', nome: 'Aziende e giudice' }, { id: 'ba-chiavi', nome: 'Chiavi e parole' }])}
  <main>
    ${sonoLaBanca ? '' : '<div class="nota bad" style="margin-bottom:16px"><b>Queste parole non sono quelle della banca di questo registro.</b> Le righe verrebbero rifiutate.</div>'}
    <div id="ba-riserva">
      <div class="testata">
        <div class="who"><i style="background:linear-gradient(135deg,#0F0F14,#3B5BFF)"></i><div><div class="piccolo muto">Banca · chiave <span class="mono">${esc(identita.chiave.pubblica.slice(0, 4))}…${esc(identita.chiave.pubblica.slice(-4))}</span> · registro al ${esc(s.giorno ?? '—')}</div><h1 style="font-size:1.6rem">Riserva</h1></div></div>
        <button class="btn ${giornoAperto ? '' : 'primario'}" id="apri-giorno" ${giornoAperto || !sonoLaBanca ? 'disabled' : ''}>${giornoAperto ? `Giorno ${oggi} aperto` : `Apri il giorno ${oggi}`}</button>
      </div>
      <div class="saldo-card" style="margin-top:14px;background:linear-gradient(135deg,#0F0F14 0%,#1B1F3A 50%,#3B5BFF 100%)">
        <div class="tasso">tetto ${euro(tetto)}</div><div class="l">Euro in riserva, conto dedicato</div>
        <div class="m">${euro(riserva).replace(' €', '')}<small>€</small></div>
        <div class="e">copre ${manti(s.circolazione_cent ?? 0n)} manti a ${prezzo(v)} · spazio sotto il tetto ${euro(spazioSottoTetto(s))}</div>
        <div class="budget-barra" style="background:rgba(255,255,255,.2);margin-top:12px"><i style="width:${Math.min(100, pct)}%;background:#fff"></i></div>
      </div>
      <div class="griglia g3" style="margin-top:16px">
        <div class="card stat"><h3>Valore ufficiale</h3><div class="v">${prezzo(v)}</div><div class="s">${euro(riserva)} ÷ ${manti(s.circolazione_cent ?? 0n)}</div></div>
        <div class="card stat"><h3>Vendi a</h3><div class="v">${prezzo(prezzoAcquisto(s))}</div><div class="s">+5%, in riserva</div></div>
        <div class="card stat"><h3>Riconverti a</h3><div class="v">${prezzo(prezzoConversione(s))}</div><div class="s">−2%, resta in riserva</div></div>
        <div class="card stat"><h3>Entrate totali</h3><div class="v">${euro((s.incassati_cent ?? 0n) + (s.interessi_cent ?? 0n))}</div><div class="s">${euro(s.incassati_cent ?? 0n)} vendite + ${euro(s.interessi_cent ?? 0n)} interessi</div></div>
        <div class="card stat"><h3>Uscite totali</h3><div class="v">${euro(s.restituiti_cent ?? 0n)}</div><div class="s">${conversioni.filter((c) => c.stato !== 'richiesta').length} conversioni eseguite</div></div>
        <div class="card stat"><h3>Tuo guadagno</h3><div class="v">0,00<small> €</small></div><div class="s">tutto va in riserva. Un canone alle aziende è fuori dal sistema</div></div>
      </div>
      <div class="errore" id="err-giorno"></div>
    </div>

    <div class="sezione" id="ba-vendite">
      <div class="testa"><h2>Vendite</h2><span class="piccolo muto">firmi quando gli euro sono arrivati sul conto di riserva</span></div>
      <div class="griglia g2">
        <div class="card pad form">
          <div class="campo"><label>Euro ricevuti</label><input id="ve-eur" placeholder="500,00"></div>
          <div class="campo"><label>A chi</label><select id="ve-az"><option value="">— coordinate qui sotto —</option>${aziende.map(([k, a]) => `<option value="${esc(a.coordinate)}">${esc(a.nome)}</option>`).join('')}</select><input id="ve-coord" placeholder="coordinate mnt1… del compratore" autocapitalize="none"></div>
          <div class="campo"><label>Nome, solo per te</label><input id="ve-chi" placeholder="es. Mario Rossi, bonifico del 20/9"></div>
          <div class="campo"><label>Riferimento del pagamento in euro (pubblico)</label><input id="ve-rif" placeholder="es. bonifico 20/9 CRO 1234"></div>
          <div class="conto"><div><span>Prezzo di oggi</span><span class="num">${prezzo(prezzoAcquisto(s))}</span></div><div class="tot"><span>Manti da consegnare</span><span class="num" id="ve-manti">—</span></div></div>
          <div class="errore" id="err-ve"></div>
          <button class="btn primario" id="ve-firma" ${sonoLaBanca && spazioSottoTetto(s) > 0n ? '' : 'disabled'}>Firma la vendita</button>
          <p class="piccolo muto">Il prezzo lo calcola il motore al momento della firma. Non puoi vendere se la riserva è al tetto: il pulsante si disattiva da solo. Firmata, è definitiva.</p>
        </div>
        <div class="card scroll"><table><thead><tr><th>Quando</th><th>Chi</th><th class="r">Euro</th><th class="r">Prezzo</th><th class="r">Manti</th><th>Rif.</th></tr></thead><tbody>
          ${righeVendite.length ? righeVendite.map((r) => `<tr><td>${giornoBreve(r.ts.slice(0, 10))}</td><td>${esc(vendite.tutte()[r.hash] ?? 'privato')} <span class="mono">${esc(r.body.out[0].addr.slice(0, 6))}…</span></td><td class="r">${euro(r.body.euro_cent)}</td><td class="r">${prezzo(r.body.prezzo)}</td><td class="r">${manti(r.body.out.reduce((a, u) => a + u.amount, 0))}</td><td class="piccolo muto">${esc(r.body.pagamento)}</td></tr>`).join('') : '<tr><td colspan="6" class="muto">nessuna</td></tr>'}
        </tbody></table></div>
      </div>
    </div>

    <div class="sezione" id="ba-conv">
      <div class="testa"><h2>Conversioni</h2><span class="piccolo muto">esegui, paga gli euro fuori dal sistema, segna pagata</span></div>
      <div class="card pad"><div class="scroll"><table><thead><tr><th>Richiesta</th><th>Chi</th><th class="r">Manti</th><th class="r">Prezzo</th><th class="r">Euro</th><th>Stato</th><th></th></tr></thead><tbody>
        ${conversioni.length ? conversioni.map((c) => { const d = dati(c); const ident = eIdentificato(d); return `<tr><td>riga ${c.seq}</td><td>${d ? esc(d) : '<i class="muto">non leggibili</i>'}${d && !ident ? ' <span class="pill warn">non identificato</span>' : ''}</td><td class="r">${manti(c.amount)}</td><td class="r">${c.stato === 'richiesta' ? prezzo(prezzoConversione(s)) + ' oggi' : prezzo(c.prezzo)}</td><td class="r"><b>${c.stato === 'richiesta' ? (prezzoConversione(s) === null ? '—' : euro(euroPerManti(BigInt(c.amount), prezzoConversione(s)))) : euro(c.euro_cent)}</b></td><td>${c.stato === 'richiesta' ? '<span class="pill warn">da eseguire</span>' : c.stato === 'eseguita' ? '<span class="pill acc">eseguita, da pagare</span>' : `<span class="pill ok">pagata ${esc(c.pagata)}</span>`}</td><td>${c.stato === 'richiesta' ? `<button class="btn mini primario" data-esegui="${c.hash}" ${sonoLaBanca && ident ? '' : 'disabled'} title="${ident ? '' : 'prima identifica il richiedente'}">Esegui</button>` : c.stato === 'eseguita' ? `<button class="btn mini" data-pagata="${c.hash}" ${sonoLaBanca ? '' : 'disabled'}>Segna pagata</button>` : ''}</td></tr>`; }).join('') : '<tr><td colspan="7" class="muto">nessuna</td></tr>'}
      </tbody></table></div><div class="errore" id="err-conv"></div>
      <div class="nota piccolo" style="margin-top:14px">Vedi nome e IBAN perché il richiedente li ha cifrati per te. Esegui solo chi hai identificato (sezione Identificazioni) e senza multe definitive non saldate. Nel registro pubblico ci sono solo manti bruciati ed euro dovuti.</div></div>
    </div>

    <div class="sezione" id="ba-interessi">
      <div class="testa"><h2>Interessi ed estratto conto</h2></div>
      <div class="griglia g2">
        <div class="card pad form">
          <h3>Interessi del conto di riserva</h3>
          <div class="campo"><label>Euro accreditati</label><input id="in-eur" placeholder="6,25"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div class="campo"><label>Dal</label><input id="in-da" type="date"></div><div class="campo"><label>Al</label><input id="in-a" type="date"></div></div>
          <div class="errore" id="err-in"></div>
          <button class="btn primario" id="in-firma" ${sonoLaBanca ? '' : 'disabled'}>Firma gli interessi</button>
          <h3 style="margin-top:12px">Estratto conto del mese</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div class="campo"><label>Mese</label><input id="es-mese" type="month" value="${esc((s.giorno ?? oggi).slice(0, 7))}"></div><div class="campo"><label>Saldo dell'estratto</label><input id="es-saldo" placeholder="3454,44"></div></div>
          <div class="campo"><label>Il documento (PDF o immagine): ne viene calcolato l'hash</label><input id="es-file" type="file"></div>
          <div class="conto"><div><span>Riserva calcolata dal registro</span><span class="num">${euro(riserva)}</span></div><div class="tot"><span>Differenza</span><span class="num" id="es-diff">—</span></div></div>
          <div class="campo" id="es-nota-campo" hidden><label>Nota: perché non coincide (pubblica)</label><input id="es-nota"></div>
          <div class="errore" id="err-es"></div>
          <button class="btn primario" id="es-firma" ${sonoLaBanca ? '' : 'disabled'}>Firma l'estratto</button>
          <p class="piccolo muto">L'estratto è l'unica prova che il registro non può dare da solo: è un'affermazione firmata. Il documento va pubblicato dove il sito lo indica, con lo stesso hash.</p>
        </div>
        <div class="card pad"><h3>Storico</h3><table style="margin-top:8px"><thead><tr><th>Mese</th><th class="r">Estratto</th><th class="r">Registro</th><th>Esito</th></tr></thead><tbody>
          ${Object.entries(s.estratti ?? {}).sort().reverse().map(([m, e]) => `<tr><td>${esc(m)}</td><td class="r">${euro(e.saldo_cent)}</td><td class="r">${euro(e.riserva_cent)}</td><td>${e.nota ? `<span class="pill warn" title="${esc(e.nota)}">nota</span>` : '<span class="pill ok">coincide</span>'}</td></tr>`).join('') || '<tr><td colspan="4" class="muto">nessuno</td></tr>'}
        </tbody></table>
        <h3 style="margin-top:14px">Interessi</h3><table style="margin-top:8px"><tbody>${interessi.slice().reverse().map((r) => `<tr><td>${esc(r.body.da)} → ${esc(r.body.a)}</td><td class="r">${euro(r.body.euro_cent)}</td><td>${s.correzioni?.[r.hash] ? '<span class="pill bad">corretto</span>' : ''}</td></tr>`).join('') || '<tr><td class="muto">nessuno</td></tr>'}</tbody></table></div>
      </div>
    </div>

    <div class="sezione" id="ba-tetto"><div class="testa"><h2>Tetto della riserva</h2></div>
      <div class="card pad form" style="max-width:520px">
        <div class="conto"><div><span>Tetto attuale</span><span class="num">${euro(tetto)}</span></div><div><span>Riserva</span><span class="num">${euro(riserva)}</span></div><div class="tot"><span>Spazio per nuove vendite</span><span class="num">${euro(spazioSottoTetto(s))}</span></div></div>
        <div class="campo"><label>Nuovo tetto</label><input id="te-eur" placeholder="es. 6000,00"></div><div class="errore" id="err-te"></div>
        <div><button class="btn primario" id="te-firma" ${sonoLaBanca ? '' : 'disabled'}>Firma il nuovo tetto</button></div>
        <p class="piccolo muto">È una transazione pubblica: tutti vedono quando e a quanto lo hai cambiato. Le nuove vendite partono dal prezzo di acquisto del giorno, mai sotto.</p>
      </div>
    </div>

    <div class="sezione" id="ba-ident"><div class="testa"><h2>Identificazioni</h2><span class="piccolo muto">servono solo per convertire · solo in questo browser</span></div>
      <div class="card scroll"><table><thead><tr><th>Nome</th><th>Come</th><th>Quando</th><th></th></tr></thead><tbody>
        ${identificati.tutti().length ? identificati.tutti().map((i, k) => `<tr><td>${esc(i.nome)}</td><td class="muto piccolo">${esc(i.come)}</td><td>${esc(i.quando)}</td><td><a class="piccolo" data-togli-id="${k}">togli</a></td></tr>`).join('') : '<tr><td colspan="4" class="muto">nessuno</td></tr>'}
      </tbody></table></div>
      <div class="card pad form" style="margin-top:12px;max-width:640px"><b>Identifica una persona</b><div class="campo"><input id="id-nome" placeholder="nome e cognome, come lo scriverà nella richiesta"></div><div class="campo"><input id="id-come" placeholder="come: documento visto di persona, …"></div><button class="btn acc" id="id-agg">Salva</button></div>
      <p class="piccolo muto" style="margin-top:8px">Chi non si identifica può fare tutto tranne convertire. Una richiesta viene considerata identificata se i dati cifrati contengono il nome così com'è scritto qui. L'anagrafica non è nel registro e non si pubblica.</p>
    </div>

    <div class="sezione" id="ba-aziende"><div class="testa"><h2>Aziende e giudice</h2></div>
      <div class="card scroll"><table><thead><tr><th>Nome</th><th>Chiave</th><th class="r">Pagati</th><th>Catalogo</th><th>Polizia</th></tr></thead><tbody>
        ${aziende.length ? aziende.map(([k, a]) => `<tr><td>${esc(a.nome)}</td><td class="mono">${esc(k.slice(0, 8))}…</td><td class="r">${manti(a.pagati_cent)}</td><td>v${a.catalogo_v} · ${Object.keys(a.catalogo).length} voci</td><td>${a.polizia ? `<span class="mono">${esc(a.polizia.chiave.slice(0, 8))}…</span>` : '<span class="muto">nessuna</span>'}</td></tr>`).join('') : '<tr><td colspan="5" class="muto">nessuna</td></tr>'}
      </tbody></table></div>
      <div class="griglia g2" style="margin-top:12px">
        <div class="card pad form"><b>Registra un'azienda</b><div class="campo"><input id="az-chiave" placeholder="chiave pubblica (dal pannello azienda, Chiavi)" autocapitalize="none"></div><div class="campo"><input id="az-coord" placeholder="coordinate mnt1…" autocapitalize="none"></div><div class="campo"><input id="az-nome" placeholder="nome pubblico"></div><div class="errore" id="err-az"></div><button class="btn acc" id="az-reg" ${sonoLaBanca ? '' : 'disabled'}>Firma la registrazione</button></div>
        <div class="card pad form"><b>Giudice</b><p class="piccolo muto">${s.giudice ? `In carica: <span class="mono">${esc(s.giudice.chiave.slice(0, 8))}…</span> · istruzioni ${esc(s.giudice.versione)}` : 'Nessun giudice registrato: senza, non si può contestare.'}</p><div class="campo"><input id="gi-chiave" placeholder="chiave pubblica del giudice" autocapitalize="none"></div><div class="campo"><input id="gi-coord" placeholder="coordinate mnt1…" autocapitalize="none"></div><div class="campo"><input id="gi-ver" placeholder="versione delle istruzioni, es. istruzioni-1"></div><div class="errore" id="err-gi"></div><button class="btn acc" id="gi-reg" ${sonoLaBanca ? '' : 'disabled'}>Firma la registrazione</button></div>
      </div>
      <p class="piccolo muto" style="margin-top:8px">Ogni azienda ha il proprio conto, catalogo, tariffario e polizia. Riserva e valore del manto sono unici per tutte.</p>
    </div>
    ${sezioneChiavi('Chiave pubblica della banca', 'Coordinate della banca (qui arrivano i dati cifrati delle conversioni)')}
    <div class="firma"><span>Pannello della banca · vendite, conversioni, interessi, estratti e tetto sono righe firmate con la chiave banca. Non esiste un pulsante per prelevare dalla riserva.</span></div>
  </main></div>`);

  legaParole();
  const firmaBanca = (type, body, err) => async () => { try { await invia(conto, () => ({ type, body: typeof body === 'function' ? body() : body, firmatari: [identita.firmatario] })); pannelloBanca(); } catch (e) { errore(err, e); } };
  $('#apri-giorno').onclick = firmaBanca('day', { data: oggi }, '#err-giorno');
  // vendite
  const calc = () => { try { $('#ve-manti').textContent = manti(mantiPerEuro(BigInt(centesimi($('#ve-eur').value)), prezzoAcquisto(s))) + ' manti'; } catch { $('#ve-manti').textContent = '—'; } };
  $('#ve-eur').oninput = calc;
  $('#ve-az').onchange = () => { $('#ve-coord').value = $('#ve-az').value; if ($('#ve-az').value) $('#ve-chi').value = $('#ve-az').selectedOptions[0].textContent; };
  $('#ve-firma').onclick = async () => {
    const coord = $('#ve-coord').value.trim().replace(/\s+/g, '').toLowerCase();
    try { decodificaCoordinate(coord); } catch { errore('#err-ve', 'Coordinate non valide.'); return; }
    if (!$('#ve-rif').value.trim()) { errore('#err-ve', 'Serve il riferimento del pagamento.'); return; }
    let e; try { e = centesimi($('#ve-eur').value); } catch (x) { errore('#err-ve', x); return; }
    if (!confirm(`Firmi la vendita di ${euro(e)} a ${prezzo(prezzoAcquisto(s))}. Gli euro sono arrivati?`)) return;
    try {
      const esito = await invia(conto, (reg) => { const p = prezzoAcquisto(reg.stato); const i = creaIndirizzo(coord); return { type: 'sale', body: { euro_cent: e, prezzo: Number(p), pagamento: $('#ve-rif').value.trim(), out: [{ addr: i.addr, eph: i.eph, amount: Number(mantiPerEuro(BigInt(e), p)), tag: 'vendita' }] }, firmatari: [identita.firmatario] }; });
      if ($('#ve-chi').value.trim()) vendite.nota(esito.hash, $('#ve-chi').value.trim());
      pannelloBanca();
    } catch (x) { errore('#err-ve', x); }
  };
  // conversioni
  for (const b of document.querySelectorAll('[data-esegui]')) b.onclick = firmaBanca('conversion.execute', () => { const c = stato().conversioni[b.dataset.esegui]; const p = prezzoConversione(stato()); return { richiesta: b.dataset.esegui, prezzo: Number(p), euro_cent: Number(euroPerManti(BigInt(c.amount), p)) }; }, '#err-conv');
  for (const b of document.querySelectorAll('[data-pagata]')) b.onclick = firmaBanca('conversion.paid', () => ({ richiesta: b.dataset.pagata, data: new Date().toISOString().slice(0, 10) }), '#err-conv');
  // interessi ed estratto
  $('#in-firma').onclick = async () => { try { await invia(conto, () => ({ type: 'reserve.interest', body: { euro_cent: centesimi($('#in-eur').value), da: $('#in-da').value, a: $('#in-a').value }, firmatari: [identita.firmatario] })); pannelloBanca(); } catch (e) { errore('#err-in', e); } };
  let hashDoc = null;
  $('#es-file').onchange = async () => { const f = $('#es-file').files[0]; if (!f) return; hashDoc = sha256(new Uint8Array(await f.arrayBuffer())); };
  $('#es-saldo').oninput = () => { try { const d = BigInt(centesimi($('#es-saldo').value)) - riserva; $('#es-diff').textContent = euro(d < 0n ? -d : d) + (d === 0n ? ' · coincide' : d > 0n ? ' in più sull\'estratto' : ' in meno sull\'estratto'); $('#es-nota-campo').hidden = d === 0n; } catch { $('#es-diff').textContent = '—'; } };
  $('#es-firma').onclick = async () => {
    if (!hashDoc) { errore('#err-es', 'Scegli il documento dell\'estratto.'); return; }
    try { await invia(conto, () => ({ type: 'reserve.statement', body: { mese: $('#es-mese').value, saldo_cent: centesimi($('#es-saldo').value), documento: hashDoc, ...($('#es-nota').value.trim() ? { nota: $('#es-nota').value.trim() } : {}) }, firmatari: [identita.firmatario] })); pannelloBanca(); } catch (e) { errore('#err-es', e); }
  };
  // tetto
  $('#te-firma').onclick = async () => { try { const t = centesimi($('#te-eur').value); if (!confirm(`Nuovo tetto ${euro(t)}: pubblico e definitivo.`)) return; await invia(conto, () => ({ type: 'cap.set', body: { tetto_cent: t }, firmatari: [identita.firmatario] })); pannelloBanca(); } catch (e) { errore('#err-te', e); } };
  // identificazioni
  $('#id-agg').onclick = () => { if (!$('#id-nome').value.trim()) return; identificati.salva([...identificati.tutti(), { nome: $('#id-nome').value.trim(), come: $('#id-come').value.trim(), quando: oggi }]); pannelloBanca(); };
  for (const a of document.querySelectorAll('[data-togli-id]')) a.onclick = () => { const l = identificati.tutti(); l.splice(Number(a.dataset.togliId), 1); identificati.salva(l); pannelloBanca(); };
  // aziende e giudice
  $('#az-reg').onclick = async () => {
    const chiave = $('#az-chiave').value.trim().toLowerCase(); const coord = $('#az-coord').value.trim().replace(/\s+/g, '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(chiave)) { errore('#err-az', 'Chiave: 64 esadecimali.'); return; }
    try { decodificaCoordinate(coord); } catch { errore('#err-az', 'Coordinate non valide.'); return; }
    try { await invia(conto, () => ({ type: 'company.register', body: { chiave, coordinate: coord, nome: $('#az-nome').value.trim() }, firmatari: [identita.firmatario] })); pannelloBanca(); } catch (e) { errore('#err-az', e); }
  };
  $('#gi-reg').onclick = async () => {
    const chiave = $('#gi-chiave').value.trim().toLowerCase(); const coord = $('#gi-coord').value.trim().replace(/\s+/g, '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(chiave)) { errore('#err-gi', 'Chiave: 64 esadecimali.'); return; }
    try { decodificaCoordinate(coord); } catch { errore('#err-gi', 'Coordinate non valide.'); return; }
    try { await invia(conto, () => ({ type: 'judge.register', body: { chiave, coordinate: coord, versione: $('#gi-ver').value.trim() }, firmatari: [identita.firmatario] })); pannelloBanca(); } catch (e) { errore('#err-gi', e); }
  };
}

scegliRuolo();
