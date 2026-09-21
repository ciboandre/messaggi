// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// Il manto: moneta ERC-20 immutabile, con riserva. Regole in REGOLE.md.
///
/// Ogni giorno nascono 100 manti, divisi tra chi ha versato ETH quel giorno,
/// in proporzione a quanto ha versato. Gli ETH restano nel contratto come
/// riserva. Chi brucia manti riceve la sua parte proporzionale della riserva.
/// Nessun proprietario, nessuna commissione, nessuna pausa, nessuna modifica.
contract Manto {
    string public constant name = "Manto";
    string public constant symbol = "MANTO";
    uint8 public constant decimals = 2;

    uint256 public constant EMISSIONE_GIORNALIERA = 100 * 100; // 100 manti al giorno, in centesimi

    /// Momento della creazione: da qui si contano i giorni.
    uint256 public immutable inizio;
    /// ETH versati in un giorno, in totale e per indirizzo.
    mapping(uint256 => uint256) public versatoNelGiorno;
    mapping(uint256 => mapping(address => uint256)) public versato;
    /// Giorni con versamenti di un indirizzo, non ancora ritirati.
    mapping(address => uint256[]) private giorniDaRitirare;
    /// Quanti giorni hanno avuto almeno un versamento (compreso oggi, se ne ha).
    uint256 public giorniConVersamenti;
    /// Manti bruciati, in centesimi.
    uint256 public bruciati;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Versamento(address indexed chi, uint256 giorno, uint256 wei_);
    event Ritiro(address indexed chi, uint256 giorno, uint256 manti);
    event Bruciatura(address indexed chi, uint256 manti, uint256 wei_);

    error IndirizzoNullo();
    error SaldoInsufficiente();
    error AutorizzazioneInsufficiente();
    error VersamentoNullo();
    error GiornoNonConcluso();
    error NienteDaRitirare();
    error NienteDaBruciare();
    error InvioFallito();

    constructor() {
        inizio = block.timestamp;
    }

    // --- giorni ---

    /// Giorno corrente: 0 è il giorno della creazione.
    function oggi() public view returns (uint256) {
        return (block.timestamp - inizio) / 1 days;
    }

    /// Giorni conclusi che hanno avuto versamenti: i loro manti esistono, ritirati o no.
    function giorniConclusi() public view returns (uint256) {
        return versatoNelGiorno[oggi()] > 0 ? giorniConVersamenti - 1 : giorniConVersamenti;
    }

    /// Manti esistenti, in centesimi: nati nei giorni conclusi (ritirati o no), meno i bruciati.
    function esistenti() public view returns (uint256) {
        return giorniConclusi() * EMISSIONE_GIORNALIERA - bruciati;
    }

    /// La riserva, in wei: tutto ciò che è stato versato nei giorni conclusi e non ancora riscattato.
    function riserva() public view returns (uint256) {
        return address(this).balance - versatoNelGiorno[oggi()];
    }

    /// Quanti wei vale un centesimo di manto se lo si brucia adesso.
    function pavimento() public view returns (uint256) {
        uint256 e = esistenti();
        return e == 0 ? 0 : riserva() / e;
    }

    // --- versare ---

    /// Versa ETH per i manti di oggi. Anche un semplice invio di ETH al contratto vale come versamento.
    function versa() public payable {
        if (msg.value == 0) revert VersamentoNullo();
        uint256 giorno = oggi();
        if (versatoNelGiorno[giorno] == 0) giorniConVersamenti += 1;
        if (versato[giorno][msg.sender] == 0) giorniDaRitirare[msg.sender].push(giorno);
        versato[giorno][msg.sender] += msg.value;
        versatoNelGiorno[giorno] += msg.value;
        emit Versamento(msg.sender, giorno, msg.value);
    }

    receive() external payable {
        versa();
    }

    // --- ritirare ---

    /// I giorni versati e non ancora ritirati da un indirizzo (compreso oggi, se ha versato).
    function daRitirare(address chi) external view returns (uint256[] memory) {
        return giorniDaRitirare[chi];
    }

    /// Manti ritirabili da un indirizzo, in centesimi: la sua parte dei giorni conclusi.
    function ritirabili(address chi) external view returns (uint256 totale) {
        uint256 giorno = oggi();
        uint256[] storage giorni = giorniDaRitirare[chi];
        for (uint256 i = 0; i < giorni.length; i++) {
            if (giorni[i] < giorno) totale += _parte(chi, giorni[i]);
        }
    }

    /// Ritira i manti di tutti i giorni conclusi in cui si è versato.
    function ritira() external returns (uint256 totale) {
        uint256 giorno = oggi();
        uint256[] storage giorni = giorniDaRitirare[msg.sender];
        uint256 i = 0;
        while (i < giorni.length) {
            uint256 g = giorni[i];
            if (g < giorno) {
                uint256 manti = _parte(msg.sender, g);
                versato[g][msg.sender] = 0;
                giorni[i] = giorni[giorni.length - 1];
                giorni.pop();
                _conia(msg.sender, manti);
                emit Ritiro(msg.sender, g, manti);
                totale += manti;
            } else {
                i++;
            }
        }
        if (totale == 0) revert NienteDaRitirare();
    }

    function _parte(address chi, uint256 giorno) internal view returns (uint256) {
        return EMISSIONE_GIORNALIERA * versato[giorno][chi] / versatoNelGiorno[giorno];
    }

    // --- bruciare ---

    /// Brucia manti e riceve la parte proporzionale della riserva.
    function brucia(uint256 manti) external returns (uint256 wei_) {
        if (manti == 0) revert NienteDaBruciare();
        uint256 saldo = balanceOf[msg.sender];
        if (saldo < manti) revert SaldoInsufficiente();
        wei_ = manti * riserva() / esistenti();
        balanceOf[msg.sender] = saldo - manti;
        totalSupply -= manti;
        bruciati += manti;
        emit Transfer(msg.sender, address(0), manti);
        emit Bruciatura(msg.sender, manti, wei_);
        (bool ok,) = msg.sender.call{value: wei_}("");
        if (!ok) revert InvioFallito();
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
