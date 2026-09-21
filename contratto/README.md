# contratto

Il manto come contratto ERC-20 immutabile su Base. Le regole sono in [REGOLE.md](../REGOLE.md).

Strumenti: [Foundry](https://getfoundry.sh) (`forge`, `cast`, `anvil`), installato con `curl -sL https://foundry.paradigm.xyz | bash && foundryup`; aggiungere `~/.foundry/bin` al PATH. La libreria di test `forge-std` è un sottomodulo git: dopo un clone nuovo, `git submodule update --init`.

- `forge build` compila `src/`.
- `forge test` esegue i test in `test/`.
- `anvil` avvia una rete locale usa e getta per provare a mano.

Cartelle: `src/` il contratto, `test/` i test, `script/` gli script di pubblicazione (prima Base Sepolia, poi Base). Chiavi e indirizzi RPC stanno in `.env`, mai nel repo.
