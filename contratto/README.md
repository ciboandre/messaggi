# contratto

Il manto come contratto ERC-20 immutabile su Base. Le regole sono in [REGOLE.md](../REGOLE.md).

Strumenti: [Foundry](https://getfoundry.sh) (`forge`, `cast`, `anvil`), installato con `curl -sL https://foundry.paradigm.xyz | bash && foundryup`; aggiungere `~/.foundry/bin` al PATH. La libreria di test `forge-std` è un sottomodulo git: dopo un clone nuovo, `git submodule update --init`.

- `forge build` compila `src/`.
- `forge test` esegue i test in `test/`.
- `anvil` avvia una rete locale usa e getta per provare a mano.

Cartelle: `src/` il contratto, `test/` i test, `script/` gli script di pubblicazione (prima Base Sepolia, poi Base). Chiavi e indirizzi RPC stanno in `.env`, mai nel repo.

## Pubblicazioni

- **Base** (rete vera, chain 8453): `0xB3c1dE4791BEee9a32b1a9F34548e862ECB60eeF`, il manto con riserva, pubblicato il 2026-09-21 alle 13:45:27 CEST (giorno 0) dal portafoglio `0x8Ea248DAF9701544FaDDDc05fe40bBA80ADFC9D9`, che non ha alcun potere. Sorgente verificato su [Sourcify](https://repo.sourcify.dev/8453/0xB3c1dE4791BEee9a32b1a9F34548e862ECB60eeF). Esploratore: https://basescan.org/address/0xB3c1dE4791BEee9a32b1a9F34548e862ECB60eeF. RPC pubblico `https://mainnet.base.org`.

Contratti precedenti, abbandonati lo stesso giorno prima che chiunque li usasse: su Base `0xe76bc5865004BB319bDc22B2CfCaC8d1379ce207` e su Base Sepolia `0x77e091Fd9f727E23A5252F6a7CD64344dAD56A0a` (modello a reclamo gratuito, senza riserva).

Comandi utili (`M` l'indirizzo del contratto, RPC `https://mainnet.base.org`):

    cast call $M 'oggi()(uint256)' --rpc-url https://mainnet.base.org
    cast call $M 'riserva()(uint256)' --rpc-url https://mainnet.base.org
    cast call $M 'pavimento()(uint256)' --rpc-url https://mainnet.base.org
    cast send $M 'versa()' --value 0.001ether --rpc-url https://mainnet.base.org --account <nome>
    cast send $M 'ritira()' --rpc-url https://mainnet.base.org --account <nome>
    cast send $M 'brucia(uint256)' <centesimi> --rpc-url https://mainnet.base.org --account <nome>
