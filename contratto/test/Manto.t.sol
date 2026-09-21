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
    uint256 constant GIORNO = 1_000 * M;

    function setUp() public {
        vm.warp(1_800_000_000);
        manto = new Manto();
    }

    function avanti(uint256 secondi) internal {
        vm.warp(vm.getBlockTimestamp() + secondi);
    }

    // --- creazione ---

    function test_nasceVuoto() public view {
        assertEq(manto.totalSupply(), 0);
        assertEq(manto.oggi(), 0);
        assertEq(manto.decimals(), 2);
        (bool presente,) = manto.giornoInAttesa(anna);
        assertFalse(presente);
    }

    function attesa(address chi) internal view returns (int256) {
        (bool presente, uint256 giorno) = manto.giornoInAttesa(chi);
        return presente ? int256(giorno) : -1;
    }

    // --- reclamo e ritiro ---

    function test_unoSoloPrendeTutto() public {
        vm.prank(anna);
        manto.reclama();
        assertEq(manto.reclami(0), 1);
        assertEq(attesa(anna), 0);
        assertEq(manto.ritirabili(anna), 0); // il giorno non è concluso
        assertEq(manto.balanceOf(anna), 0);

        avanti(1 days);
        assertEq(manto.ritirabili(anna), GIORNO);
        vm.prank(anna);
        manto.ritira();
        assertEq(manto.balanceOf(anna), GIORNO);
        assertEq(manto.totalSupply(), GIORNO);
        assertEq(attesa(anna), -1);
    }

    function test_treInPartiUguali() public {
        vm.prank(anna);
        manto.reclama();
        avanti(5 hours);
        vm.prank(bruno);
        manto.reclama();
        avanti(18 hours);
        vm.prank(carla);
        manto.reclama();
        assertEq(manto.reclami(0), 3);

        avanti(2 hours); // giorno 1
        vm.prank(anna);
        manto.ritira();
        vm.prank(bruno);
        manto.ritira();
        vm.prank(carla);
        manto.ritira();
        assertEq(manto.balanceOf(anna), 33_333);
        assertEq(manto.balanceOf(bruno), 33_333);
        assertEq(manto.balanceOf(carla), 33_333);
        assertEq(manto.totalSupply(), 99_999); // il centesimo di resto non nasce
    }

    function test_duePerGiornoNo() public {
        vm.startPrank(anna);
        manto.reclama();
        vm.expectRevert(Manto.GiaReclamatoOggi.selector);
        manto.reclama();
        avanti(23 hours);
        vm.expectRevert(Manto.GiaReclamatoOggi.selector);
        manto.reclama();
        vm.stopPrank();
    }

    function test_reclamoDelGiornoDopoRitiraIlPrecedente() public {
        vm.startPrank(anna);
        manto.reclama();
        avanti(1 days);
        manto.reclama(); // ritira il giorno 0 e reclama il giorno 1
        assertEq(manto.balanceOf(anna), GIORNO);
        assertEq(attesa(anna), 1);
        avanti(1 days);
        manto.reclama();
        assertEq(manto.balanceOf(anna), 2 * GIORNO);
        vm.stopPrank();
    }

    function test_ritiroPrimaDellaFineNonFaNiente() public {
        vm.startPrank(anna);
        manto.reclama();
        manto.ritira();
        assertEq(manto.balanceOf(anna), 0);
        assertEq(attesa(anna), 0);
        vm.stopPrank();
    }

    function test_ritiroSenzaReclamoNonFaNiente() public {
        avanti(3 days);
        vm.prank(anna);
        manto.ritira();
        assertEq(manto.balanceOf(anna), 0);
        assertEq(manto.totalSupply(), 0);
    }

    function test_ilRitiroNonScade() public {
        vm.prank(anna);
        manto.reclama();
        avanti(400 days);
        vm.prank(anna);
        manto.ritira();
        assertEq(manto.balanceOf(anna), GIORNO);
    }

    function test_giornoSenzaReclamiNonNasce() public {
        vm.prank(anna);
        manto.reclama();
        avanti(3 days); // giorni 1 e 2 vuoti
        vm.prank(anna);
        manto.reclama();
        avanti(1 days);
        vm.prank(anna);
        manto.ritira();
        assertEq(manto.totalSupply(), 2 * GIORNO);
    }

    function test_giorniIndipendenti() public {
        vm.prank(anna);
        manto.reclama();
        vm.prank(bruno);
        manto.reclama();
        avanti(1 days);
        vm.prank(anna);
        manto.reclama(); // giorno 1, da sola
        avanti(1 days);
        vm.prank(anna);
        manto.ritira();
        vm.prank(bruno);
        manto.ritira();
        assertEq(manto.balanceOf(anna), GIORNO / 2 + GIORNO);
        assertEq(manto.balanceOf(bruno), GIORNO / 2);
    }

    function testFuzz_ilGiornoNonSuperaMille(uint8 n) public {
        vm.assume(n > 0);
        for (uint256 i = 0; i < n; i++) {
            vm.prank(address(uint160(1000 + i)));
            manto.reclama();
        }
        assertEq(manto.reclami(0), n);
        avanti(1 days);
        for (uint256 i = 0; i < n; i++) {
            vm.prank(address(uint160(1000 + i)));
            manto.ritira();
        }
        assertLe(manto.totalSupply(), GIORNO);
        assertGt(manto.totalSupply(), GIORNO - n);
    }

    // --- ERC-20 ---

    function dai(address a, uint256 giorni) internal {
        for (uint256 i = 0; i < giorni; i++) {
            vm.prank(a);
            manto.reclama();
            avanti(1 days);
        }
        vm.prank(a);
        manto.ritira();
    }

    function test_trasferimento() public {
        dai(anna, 1);
        vm.prank(anna);
        assertTrue(manto.transfer(bruno, 400 * M));
        assertEq(manto.balanceOf(anna), 600 * M);
        assertEq(manto.balanceOf(bruno), 400 * M);
        assertEq(manto.totalSupply(), GIORNO);
    }

    function test_trasferimentoSenzaSaldo() public {
        vm.prank(anna);
        vm.expectRevert(Manto.SaldoInsufficiente.selector);
        manto.transfer(bruno, 1);
    }

    function test_trasferimentoANullo() public {
        dai(anna, 1);
        vm.prank(anna);
        vm.expectRevert(Manto.IndirizzoNullo.selector);
        manto.transfer(address(0), 1);
    }

    function test_autorizzazione() public {
        dai(anna, 1);
        vm.prank(anna);
        manto.approve(bruno, 30 * M);
        assertEq(manto.allowance(anna, bruno), 30 * M);

        vm.prank(bruno);
        manto.transferFrom(anna, bruno, 20 * M);
        assertEq(manto.allowance(anna, bruno), 10 * M);
        assertEq(manto.balanceOf(bruno), 20 * M);

        vm.prank(bruno);
        vm.expectRevert(Manto.AutorizzazioneInsufficiente.selector);
        manto.transferFrom(anna, bruno, 11 * M);
    }

    function test_autorizzazioneIllimitataNonSiConsuma() public {
        dai(anna, 1);
        vm.prank(anna);
        manto.approve(bruno, type(uint256).max);
        vm.prank(bruno);
        manto.transferFrom(anna, bruno, 50 * M);
        assertEq(manto.allowance(anna, bruno), type(uint256).max);
    }

    function testFuzz_trasferimentoConservaIlTotale(uint256 a, uint256 b) public {
        dai(anna, 2);
        a = bound(a, 0, 2 * GIORNO);
        b = bound(b, 0, a);
        vm.prank(anna);
        manto.transfer(bruno, a);
        vm.prank(bruno);
        manto.transfer(carla, b);
        assertEq(manto.balanceOf(anna) + manto.balanceOf(bruno) + manto.balanceOf(carla), 2 * GIORNO);
    }
}
