// Il server della banca: l'unico scrittore del registro.
//
// ARCHITETTURA.md, sezioni 1 e 7. Riceve righe già firmate, le verifica
// con le stesse regole del motore, e se passano le accoda a ledger.jsonl.
// Non ha chiavi: le righe della banca le firma il pannello banca sulla
// sua macchina e le manda qui come tutti. Se nel frattempo è entrata
// un'altra riga, la riga arrivata ha `prev` vecchio: 409, e chi l'ha
// mandata la rifirma sulla nuova posizione. Una riga invalida: 400 con
// il motivo, e non entra.
//
//   GET  /app/…  /nucleo/…  /lib/…   l'app del correntista e le librerie (statici)
//   GET  /stato             lo stato pubblico (come sito/stato.json)
//   GET  /registro?da=N     le righe da N in poi, JSONL (per le app)
//   GET  /prossima          { seq, prev, ts } su cui costruire la riga
//   POST /righe             la riga firmata; 201 { seq, hash } | 400 | 409
//
// Le scritture sono in fila, una alla volta. Con MANTI_PUSH=1 dopo ogni
// riga accodata fa git add/commit/push del registro, così il sito si
// rifà da solo. Solo `node:http`, niente dipendenze.

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apriRegistro, accodaSuFile, rigaAJsonl } from '../nucleo/registro-file.js';
import { PREV_GENESI } from '../nucleo/registro.js';
import { tipi } from '../nucleo/tipi.js';
import { riassunto } from '../motore/pubblica.js';

const CORPO_MAX = 512 * 1024;
const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const TIPI_FILE = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
/** Le cartelle servite così come sono: l'app, il nucleo, e le librerie da node_modules. */
const STATICI = { '/app/': join(RADICE, 'app'), '/nucleo/': join(RADICE, 'nucleo'), '/lib/': join(RADICE, 'node_modules') };

function servi(res, urlPath) {
  const prefisso = Object.keys(STATICI).find((p) => urlPath.startsWith(p));
  if (!prefisso) return false;
  const relativo = normalize(decodeURIComponent(urlPath.slice(prefisso.length))).replace(/^(\.\.[/\\])+/, '');
  let file = join(STATICI[prefisso], relativo || 'index.html');
  if (!file.startsWith(STATICI[prefisso])) return false;
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('non trovato'); return true; }
  const tipo = TIPI_FILE[extname(file)] ?? 'application/octet-stream';
  res.writeHead(200, { 'content-type': `${tipo}; charset=utf-8`, 'cache-control': 'no-cache' });
  res.end(readFileSync(file));
  return true;
}

/**
 * Avvia il server. Restituisce { server, chiudi }.
 * @param {{ percorso: string, porta?: number, push?: boolean, cartellaGit?: string }} opz
 */
export function avvia({ percorso, porta = 8787, push = false, cartellaGit = process.cwd() }) {
  const registro = apriRegistro(percorso, { tipi });
  let coda = Promise.resolve();
  const log = (m) => process.stdout.write(`${new Date().toISOString()} ${m}\n`);

  const invia = (res, codice, corpo, tipo = 'application/json') => {
    const testo = typeof corpo === 'string' ? corpo : JSON.stringify(corpo);
    res.writeHead(codice, { 'content-type': tipo + '; charset=utf-8', 'access-control-allow-origin': '*' });
    res.end(testo);
  };

  const pushGit = (riga) => {
    if (!push) return;
    coda = coda.then(() => new Promise((fine) => {
      const cmd = `git add ${JSON.stringify(percorso)} && git commit -q -m ${JSON.stringify(`Registro: ${riga.type} seq ${riga.seq}`)} && git push -q`;
      const p = spawn('sh', ['-c', cmd], { cwd: cartellaGit, stdio: 'ignore' });
      p.on('close', (c) => { if (c !== 0) log(`push fallito per seq ${riga.seq}`); fine(); });
    }));
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'content-type' });
      return res.end();
    }
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/app')) { res.writeHead(302, { location: '/app/' }); return res.end(); }
    if (req.method === 'GET' && servi(res, url.pathname)) return;
    if (req.method === 'GET' && url.pathname === '/stato') return invia(res, 200, riassunto(registro));
    if (req.method === 'GET' && url.pathname === '/prossima') {
      const u = registro.ultima;
      return invia(res, 200, { seq: u ? u.seq + 1 : 0, prev: u ? u.hash : PREV_GENESI, ts: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') });
    }
    if (req.method === 'GET' && url.pathname === '/registro') {
      const da = Math.max(0, Number(url.searchParams.get('da') ?? 0) || 0);
      return invia(res, 200, registro.righe.slice(da).map(rigaAJsonl).join(''), 'application/x-ndjson');
    }
    if (req.method === 'POST' && url.pathname === '/righe') {
      let dati = '';
      req.on('data', (c) => { dati += c; if (dati.length > CORPO_MAX) { invia(res, 413, { errore: 'riga troppo grande' }); req.destroy(); } });
      req.on('end', () => {
        let riga;
        try { riga = JSON.parse(dati); } catch { return invia(res, 400, { errore: 'JSON non valido' }); }
        coda = coda.then(() => {
          const u = registro.ultima;
          const attesoPrev = u ? u.hash : PREV_GENESI;
          if (riga?.prev !== attesoPrev) {
            return invia(res, 409, { errore: 'prev non corrisponde: è entrata un\'altra riga, rifirma', seq: u ? u.seq + 1 : 0, prev: attesoPrev });
          }
          try {
            accodaSuFile(registro, percorso, riga);
          } catch (e) {
            log(`rifiutata seq ${riga?.seq}: ${/** @type {Error} */ (e).message}`);
            return invia(res, 400, { errore: /** @type {Error} */ (e).message });
          }
          log(`accodata seq ${riga.seq} ${riga.type} ${riga.hash.slice(0, 12)}`);
          invia(res, 201, { seq: riga.seq, hash: riga.hash });
          pushGit(riga);
        });
      });
      return;
    }
    invia(res, 404, { errore: 'non trovato' });
  });

  server.listen(porta);
  return { server, registro, chiudi: () => new Promise((r) => server.close(() => r())), porta: () => /** @type {any} */ (server.address())?.port };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  const percorso = process.env.MANTI_LEDGER ?? 'ledger.jsonl';
  const porta = Number(process.env.MANTI_PORTA ?? 8787);
  const s = avvia({ percorso, porta, push: process.env.MANTI_PUSH === '1' });
  console.log(`server della banca su http://localhost:${porta}, registro ${percorso}, ${s.registro.righe.length} righe${process.env.MANTI_PUSH === '1' ? ', push dopo ogni riga' : ''}`);
}
