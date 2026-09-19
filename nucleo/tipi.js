// Tutti i tipi di riga, in un posto solo: quello che il motore e il server
// passano al registro. Un tipo non elencato qui non esiste.

import { tipiBanca } from './banca.js';
import { tipiAzienda } from './azienda.js';
import { tipiMulte } from './multe.js';
import { tipiConversione } from './conversione.js';
import { regolaTransfer } from './trasferimento.js';

export const tipi = {
  ...tipiBanca,
  ...tipiAzienda,
  ...tipiMulte,
  ...tipiConversione,
  transfer: regolaTransfer,
};
