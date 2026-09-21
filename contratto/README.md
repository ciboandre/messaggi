# contratto

Il manto come contratto ERC-20 immutabile su Base. Le regole sono in [REGOLE.md](../REGOLE.md).

Strumenti: [Foundry](https://getfoundry.sh) (`forge`, `cast`, `anvil`), installato con `curl -sL https://foundry.paradigm.xyz | bash && foundryup`; aggiungere `~/.foundry/bin` al PATH. La libreria di test `forge-std` è un sottomodulo git: dopo un clone nuovo, `git submodule update --init`.

- `forge build` compila `src/`.
- `forge test` esegue i test in `test/`.
- `anvil` avvia una rete locale usa e getta per provare a mano.

Cartelle: `src/` il contratto, `test/` i test, `script/` gli script di pubblicazione (prima Base Sepolia, poi Base). Chiavi e indirizzi RPC stanno in `.env`, mai nel repo.

## Pubblicazioni

- **Base** (rete vera, chain 8453): `0xe76bc5865004BB319bDc22B2CfCaC8d1379ce207`, pubblicato il 2026-09-21 alle 12:23:45 CEST (giorno 0) dal portafoglio `0x8Ea248DAF9701544FaDDDc05fe40bBA80ADFC9D9`, che da allora non ha alcun potere. Sorgente verificato su [Sourcify](https://repo.sourcify.dev/8453/0xe76bc5865004BB319bDc22B2CfCaC8d1379ce207). Esploratore: https://basescan.org/address/0xe76bc5865004BB319bDc22B2CfCaC8d1379ce207. RPC pubblico `https://mainnet.base.org`.
- **Base Sepolia** (rete di prova, chain 84532): `0x77e091Fd9f727E23A5252F6a7CD64344dAD56A0a`, pubblicato il 2026-09-21 dal portafoglio di prova `0x02370C21b0f7b4033193A5f1D70c40238D8034Ea`. Sorgente verificato su [Sourcify](https://repo.sourcify.dev/84532/0x77e091Fd9f727E23A5252F6a7CD64344dAD56A0a). Esploratore: https://sepolia.basescan.org/address/0x77e091Fd9f727E23A5252F6a7CD64344dAD56A0a

Comandi utili (RPC pubblico `https://sepolia.base.org`, `M` l'indirizzo del contratto):

    cast call $M 'oggi()(uint256)' --rpc-url https://sepolia.base.org
    cast call $M 'reclami(uint256)(uint256)' 0 --rpc-url https://sepolia.base.org
    cast send $M 'reclama()' --rpc-url https://sepolia.base.org --account prova
    cast send $M 'ritira()'  --rpc-url https://sepolia.base.org --account prova
    cast call $M 'balanceOf(address)(uint256)' <indirizzo> --rpc-url https://sepolia.base.org
