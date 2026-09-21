// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// Il manto: moneta ERC-20 immutabile. Regole in REGOLE.md.
///
/// Ogni giorno nascono 1.000 manti, divisi in parti uguali tra gli indirizzi che
/// li hanno reclamati quel giorno. Il contratto non conosce nessun indirizzo:
/// nessun proprietario, nessun negozio, nessuna quota, nessun potere su nessuno.
contract Manto {
    string public constant name = "Manto";
    string public constant symbol = "MANTO";
    uint8 public constant decimals = 2;

    uint256 public constant EMISSIONE_GIORNALIERA = 1_000 * 100; // 1.000 manti al giorno, in centesimi

    /// Momento della creazione: da qui si contano i giorni.
    uint256 public immutable inizio;
    /// Quanti indirizzi hanno reclamato in un dato giorno.
    mapping(uint256 => uint256) public reclami;
    /// Giorno reclamato e non ancora ritirato, più uno (0 = nessuno).
    mapping(address => uint256) private inAttesaPiuUno;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Reclamo(address indexed chi, uint256 giorno);
    event Ritiro(address indexed chi, uint256 giorno, uint256 importo);

    error IndirizzoNullo();
    error SaldoInsufficiente();
    error AutorizzazioneInsufficiente();
    error GiaReclamatoOggi();

    constructor() {
        inizio = block.timestamp;
    }

    // --- emissione ---

    /// Giorno corrente: 0 è il giorno della creazione.
    function oggi() public view returns (uint256) {
        return (block.timestamp - inizio) / 1 days;
    }

    /// Entra tra chi riceve i manti di oggi. Una volta al giorno per indirizzo.
    /// Se c'è un giorno precedente da ritirare, lo ritira prima.
    function reclama() external {
        uint256 giorno = oggi();
        uint256 attesa = inAttesaPiuUno[msg.sender];
        if (attesa == giorno + 1) revert GiaReclamatoOggi();
        if (attesa != 0) _ritira(msg.sender, attesa - 1);
        inAttesaPiuUno[msg.sender] = giorno + 1;
        reclami[giorno] += 1;
        emit Reclamo(msg.sender, giorno);
    }

    /// Ritira i manti di un giorno reclamato e ormai concluso.
    function ritira() external {
        uint256 attesa = inAttesaPiuUno[msg.sender];
        if (attesa == 0 || attesa - 1 >= oggi()) return;
        _ritira(msg.sender, attesa - 1);
        inAttesaPiuUno[msg.sender] = 0;
    }

    /// Manti ritirabili da un indirizzo, in centesimi: la sua parte del giorno
    /// reclamato, se quel giorno è concluso.
    function ritirabili(address chi) external view returns (uint256) {
        uint256 attesa = inAttesaPiuUno[chi];
        if (attesa == 0 || attesa - 1 >= oggi()) return 0;
        return EMISSIONE_GIORNALIERA / reclami[attesa - 1];
    }

    /// Se un indirizzo ha un giorno reclamato e non ancora ritirato (oggi o passato), e quale.
    function giornoInAttesa(address chi) external view returns (bool presente, uint256 giorno) {
        uint256 attesa = inAttesaPiuUno[chi];
        return (attesa != 0, attesa == 0 ? 0 : attesa - 1);
    }

    function _ritira(address chi, uint256 giorno) internal {
        uint256 importo = EMISSIONE_GIORNALIERA / reclami[giorno];
        _conia(chi, importo);
        emit Ritiro(chi, giorno, importo);
    }

    // --- ERC-20 ---

    function transfer(address to, uint256 value) external returns (bool) {
        _trasferisci(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 consentito = allowance[from][msg.sender];
        if (consentito != type(uint256).max) {
            if (consentito < value) revert AutorizzazioneInsufficiente();
            allowance[from][msg.sender] = consentito - value;
        }
        _trasferisci(from, to, value);
        return true;
    }

    function _trasferisci(address from, address to, uint256 value) internal {
        if (to == address(0)) revert IndirizzoNullo();
        uint256 saldo = balanceOf[from];
        if (saldo < value) revert SaldoInsufficiente();
        balanceOf[from] = saldo - value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }

    function _conia(address a, uint256 value) internal {
        totalSupply += value;
        balanceOf[a] += value;
        emit Transfer(address(0), a, value);
    }
}
