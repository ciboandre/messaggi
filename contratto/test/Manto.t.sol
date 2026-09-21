// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Test} from "forge-std/Test.sol";
import {Manto} from "../src/Manto.sol";

contract MantoTest is Test {
    Manto manto;
    address anna = makeAddr("anna");
    address bruno = makeAddr("bruno");
    address carla = makeAddr("carla");

    uint256 constant M = 100; // un manto, in centesimi
    uint256 constant GIORNO = 100 * M; // emissione di un giorno

    function setUp() public {
        vm.warp(1_800_000_000);
        manto = new Manto();
        vm.deal(anna, 10 ether);
        vm.deal(bruno, 10 ether);
        vm.deal(carla, 10 ether);
    }

    function avanti(uint256 secondi) internal {
        vm.warp(vm.getBlockTimestamp() + secondi);
    }

    function versa(address chi, uint256 wei_) internal {
        vm.prank(chi);
        manto.versa{value: wei_}();
    }

    // --- creazione ---

    function test_nasceVuoto() public view {
        assertEq(manto.totalSupply(), 0);
        assertEq(manto.esistenti(), 0);
        assertEq(manto.riserva(), 0);
        assertEq(manto.pavimento(), 0);
        assertEq(manto.oggi(), 0);
    }

    // --- versare e ritirare ---

    function test_unoSoloPrendeTutto() public {
        versa(anna, 1 ether);
        assertEq(manto.versatoNelGiorno(0), 1 ether);
        assertEq(manto.riserva(), 0); // il giorno non è concluso
        assertEq(manto.esistenti(), 0);
        assertEq(manto.ritirabili(anna), 0);

        avanti(1 days);
        assertEq(manto.riserva(), 1 ether);
        assertEq(manto.esistenti(), GIORNO); // nati, anche se non ritirati
        assertEq(manto.ritirabili(anna), GIORNO);
        vm.prank(anna);
        assertEq(manto.ritira(), GIORNO);
        assertEq(manto.balanceOf(anna), GIORNO);
        assertEq(manto.totalSupply(), GIORNO);
        assertEq(manto.daRitirare(anna).length, 0);
    }

    function test_proporzione() public {
        versa(anna, 3 ether);
        versa(bruno, 1 ether);
        avanti(1 days);
        vm.prank(anna);
        manto.ritira();
        vm.prank(bruno);
        manto.ritira();
        assertEq(manto.balanceOf(anna), 75 * M);
        assertEq(manto.balanceOf(bruno), 25 * M);
        assertEq(manto.riserva(), 4 ether);
    }

    function test_milleIndirizziNonServono() public {
        // 1.000 indirizzi con 1 wei l'uno contro uno con 1 ether: quasi tutto a chi ha versato di più
        for (uint256 i = 0; i < 1000; i++) {
            address a = address(uint160(5000 + i));
            vm.deal(a, 1);
            versa(a, 1);
        }
        versa(anna, 1 ether);
        avanti(1 days);
        assertEq(manto.ritirabili(anna), GIORNO - 1); // il resto della divisione non nasce
        assertEq(manto.ritirabili(address(uint160(5000))), 0);
    }

    function test_versamentoNullo() public {
        vm.prank(anna);
        vm.expectRevert(Manto.VersamentoNullo.selector);
        manto.versa{value: 0}();
    }

    function test_invioSempliceValeComeVersamento() public {
        vm.prank(anna);
        (bool ok,) = address(manto).call{value: 0.5 ether}("");
        assertTrue(ok);
        assertEq(manto.versato(0, anna), 0.5 ether);
    }

    function test_ritiroPrimaDellaFine() public {
        versa(anna, 1 ether);
        vm.prank(anna);
        vm.expectRevert(Manto.NienteDaRitirare.selector);
        manto.ritira();
    }

    function test_ritiroSenzaVersamenti() public {
        vm.prank(anna);
        vm.expectRevert(Manto.NienteDaRitirare.selector);
        manto.ritira();
    }

    function test_piuGiorniInUnRitiro() public {
        versa(anna, 1 ether);
        avanti(1 days);
        versa(anna, 1 ether);
        versa(bruno, 1 ether);
        avanti(1 days);
        versa(anna, 1 ether); // oggi: non ancora ritirabile
        assertEq(manto.daRitirare(anna).length, 3);
        vm.prank(anna);
        assertEq(manto.ritira(), GIORNO + GIORNO / 2);
        assertEq(manto.daRitirare(anna).length, 1);
        assertEq(manto.daRitirare(anna)[0], 2);
    }

    function test_ilRitiroNonScade() public {
        versa(anna, 1 ether);
        avanti(400 days);
        vm.prank(anna);
        assertEq(manto.ritira(), GIORNO);
    }

    function test_giornoSenzaVersamentiNonNasce() public {
        versa(anna, 1 ether);
        avanti(5 days);
        versa(anna, 1 ether);
        avanti(1 days);
        assertEq(manto.esistenti(), 2 * GIORNO);
        assertEq(manto.giorniConclusi(), 2);
    }

    // --- bruciare ---

    function test_bruciaRiceveLaSuaParte() public {
        versa(anna, 3 ether);
        versa(bruno, 1 ether);
        avanti(1 days);
        vm.startPrank(anna);
        manto.ritira(); // 75 manti
        uint256 prima = anna.balance;
        uint256 ricevuti = manto.brucia(25 * M); // un quarto di 100 → un quarto di 4 ether
        vm.stopPrank();
        assertEq(ricevuti, 1 ether);
        assertEq(anna.balance - prima, 1 ether);
        assertEq(manto.balanceOf(anna), 50 * M);
        assertEq(manto.esistenti(), 75 * M);
        assertEq(manto.riserva(), 3 ether);
        assertEq(manto.pavimento(), 3 ether / (75 * M)); // invariato
    }

    function test_bruciarePrimaCheGliAltriRitirinoNonAvvantaggia() public {
        versa(anna, 1 ether);
        avanti(1 days);
        vm.prank(anna);
        manto.ritira();
        versa(bruno, 1 ether); // giorno 1
        avanti(1 days);
        // bruno non ha ancora ritirato: i suoi 100 manti contano lo stesso
        assertEq(manto.esistenti(), 2 * GIORNO);
        vm.prank(anna);
        uint256 ricevuti = manto.brucia(GIORNO);
        assertEq(ricevuti, 1 ether); // metà di 2 ether, non tutto
        vm.prank(bruno);
        manto.ritira();
        vm.prank(bruno);
        assertEq(manto.brucia(GIORNO), 1 ether); // e bruno riprende la sua parte intera
        assertEq(address(manto).balance, 0);
    }

    function test_gliEthDiOggiNonSonoRiserva() public {
        versa(anna, 1 ether);
        avanti(1 days);
        vm.prank(anna);
        manto.ritira();
        versa(bruno, 5 ether); // oggi, in asta
        assertEq(manto.riserva(), 1 ether);
        vm.prank(anna);
        assertEq(manto.brucia(GIORNO), 1 ether);
        assertEq(address(manto).balance, 5 ether); // gli ETH di bruno sono intatti
    }

    function test_bruciaSenzaSaldo() public {
        vm.prank(anna);
        vm.expectRevert(Manto.SaldoInsufficiente.selector);
        manto.brucia(1);
        vm.prank(anna);
        vm.expectRevert(Manto.NienteDaBruciare.selector);
        manto.brucia(0);
    }

    function test_ilPavimentoNonScendeMai() public {
        versa(anna, 1 ether);
        avanti(1 days);
        versa(bruno, 3 ether); // giorno più caro
        avanti(1 days);
        vm.prank(anna);
        manto.ritira();
        vm.prank(bruno);
        manto.ritira();
        uint256 p0 = manto.pavimento();
        assertEq(p0, 4 ether / (2 * GIORNO));
        vm.prank(bruno);
        manto.brucia(GIORNO); // chi ha pagato di più brucia: prende la media
        assertEq(manto.pavimento(), p0);
        vm.prank(anna);
        manto.brucia(50 * M);
        assertEq(manto.pavimento(), p0);
    }

    function testFuzz_laRiservaCopreSempreTutti(uint256 a, uint256 b, uint256 c) public {
        a = bound(a, 0.01 ether, 10 ether);
        b = bound(b, 0.01 ether, 10 ether);
        c = bound(c, 0.01 ether, 10 ether);
        versa(anna, a);
        versa(bruno, b);
        avanti(1 days);
        versa(carla, c);
        avanti(1 days);
        vm.prank(anna); manto.ritira();
        vm.prank(bruno); manto.ritira();
        vm.prank(carla); manto.ritira();
        uint256 totale = manto.balanceOf(anna) + manto.balanceOf(bruno) + manto.balanceOf(carla);
        assertLe(totale, 2 * GIORNO);
        // tutti bruciano tutto: la riserva basta e il resto (per gli arrotondamenti) resta nel contratto
        uint256 sa = manto.balanceOf(anna); vm.prank(anna); manto.brucia(sa);
        uint256 sb = manto.balanceOf(bruno); vm.prank(bruno); manto.brucia(sb);
        uint256 sc = manto.balanceOf(carla); vm.prank(carla); manto.brucia(sc);
        assertEq(manto.totalSupply(), 0);
    }

    // --- ERC-20 ---

    function dai(address a) internal {
        versa(a, 1 ether);
        avanti(1 days);
        vm.prank(a);
        manto.ritira();
    }

    function test_trasferimento() public {
        dai(anna);
        vm.prank(anna);
        assertTrue(manto.transfer(bruno, 40 * M));
        assertEq(manto.balanceOf(anna), 60 * M);
        assertEq(manto.balanceOf(bruno), 40 * M);
        assertEq(manto.totalSupply(), GIORNO);
    }

    function test_trasferimentoSenzaSaldo() public {
        vm.prank(anna);
        vm.expectRevert(Manto.SaldoInsufficiente.selector);
        manto.transfer(bruno, 1);
    }

    function test_trasferimentoANullo() public {
        dai(anna);
        vm.prank(anna);
        vm.expectRevert(Manto.IndirizzoNullo.selector);
        manto.transfer(address(0), 1);
    }

    function test_autorizzazione() public {
        dai(anna);
        vm.prank(anna);
        manto.approve(bruno, 30 * M);
        vm.prank(bruno);
        manto.transferFrom(anna, bruno, 20 * M);
        assertEq(manto.allowance(anna, bruno), 10 * M);
        assertEq(manto.balanceOf(bruno), 20 * M);
        vm.prank(bruno);
        vm.expectRevert(Manto.AutorizzazioneInsufficiente.selector);
        manto.transferFrom(anna, bruno, 11 * M);
    }

    function test_autorizzazioneIllimitataNonSiConsuma() public {
        dai(anna);
        vm.prank(anna);
        manto.approve(bruno, type(uint256).max);
        vm.prank(bruno);
        manto.transferFrom(anna, bruno, 50 * M);
        assertEq(manto.allowance(anna, bruno), type(uint256).max);
    }
}
