// La parte di registro-file.js che serve anche nel browser: leggere JSONL.
// registro-file.js (Node) la riesporta.

/**
 * Legge le righe da testo JSONL. Linee vuote ignorate.
 * @param {string} testo
 * @returns {import('./registro.js').Riga[]}
 */
export function righeDaJsonl(testo) {
  return testo
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l, i) => {
      try {
        return JSON.parse(l);
      } catch {
        throw new Error(`linea ${i + 1}: JSON non valido`);
      }
    });
}
