// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface Vm {
    function addr(uint256) external pure returns (address);
    function warp(uint256) external;
    function roll(uint256) external;
    function deal(address, uint256) external;
    function sign(uint256, bytes32) external pure returns (uint8, bytes32, bytes32);
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function expectRevert(bytes4) external;
    function expectRevert() external;
}

import "../src/HeistVault.sol";

contract HeistVaultTest {
    Vm constant vm = Vm(address(bytes20(uint160(uint256(keccak256("hevm cheat code"))))));

    HeistVault public vault;

    uint256 internal victimKey = 0xAAAA;
    uint256 internal thiefKey = 0xBBBB;
    uint256 internal strangerKey = 0xCCCC;

    address internal victim;
    address internal thief;
    address internal stranger;

    function setUp() public {
        victim = vmAddr(victimKey);
        thief = vmAddr(thiefKey);
        stranger = vmAddr(strangerKey);

        vm.deal(victim, 10 ether);
        vm.deal(thief, 10 ether);
        vm.deal(stranger, 10 ether);

        vault = new HeistVault();
        vault.setGameActive(true);

        // Deposit funds
        vm.prank(victim);
        vault.deposit{value: 2 ether}();

        vm.prank(thief);
        vault.deposit{value: 2 ether}();
    }

    function test_DepositAndVaultBalances() public {
        assertEq(vault.vault(victim), 2 ether);
        assertEq(vault.vault(thief), 2 ether);
    }

    function test_WithdrawBlockedWhileGameActive() public {
        vm.prank(victim);
        vm.expectRevert(HeistVault.GameIsActive.selector);
        vault.withdraw(1 ether);

        // Turn game off -> withdraw succeeds
        vault.setGameActive(false);
        vm.prank(victim);
        vault.withdraw(1 ether);
        assertEq(vault.vault(victim), 1 ether);
    }

    function test_StartLoot_HappyPath() public {
        uint64 nonce = 1001;
        uint32 validBefore = uint32(block.timestamp + 90);

        bytes memory sig = signTicket(victimKey, thief, nonce, validBefore);

        vm.prank(thief);
        uint256 lootId = vault.startLoot(nonce, validBefore, sig);

        assertEq(lootId, 1);
        assertEq(vault.activeLootAsVictim(victim), 1);
        assertEq(vault.activeLootAsThief(thief), 1);

        (
            address lThief,
            address lVictim,
            uint128 lAmount,
            uint128 lBond,
            uint40 lStarted,
            uint40 lReveal,
            uint40 lDeadline,
            HeistVault.Status lStatus
        ) = vault.loots(1);

        assertEq(lThief, thief);
        assertEq(lVictim, victim);
        assertTrue(lAmount >= (2 ether * 500) / 10000);
        assertTrue(lAmount <= (2 ether * 2500) / 10000);
        assertEq(lBond, (lAmount * 2000) / 10000);
        assertEq(lReveal, lStarted + 10);
        assertEq(lDeadline, lReveal + 60);
        assertTrue(lStatus == HeistVault.Status.Active);
    }

    function test_CancelLoot_VictimWins() public {
        uint64 nonce = 1002;
        uint32 validBefore = uint32(block.timestamp + 90);
        bytes memory ticketSig = signTicket(victimKey, thief, nonce, validBefore);

        vm.prank(thief);
        uint256 lootId = vault.startLoot(nonce, validBefore, ticketSig);

        (, , uint128 amount, uint128 bond, , , , ) = vault.loots(lootId);

        // Victim hunts thief and gets Caught signature from thief over ultrasound
        bytes8 challenge = bytes8(keccak256("random-challenge"));
        bytes memory thiefSig = signCaught(thiefKey, lootId, victim, challenge);

        uint256 victimPreVault = vault.vault(victim);

        vm.prank(victim);
        vault.cancel(lootId, challenge, thiefSig);

        // Victim should receive loot amount + thief's bond
        assertEq(vault.vault(victim), victimPreVault + amount + bond);
        assertEq(vault.activeLootAsVictim(victim), 0);
        assertEq(vault.activeLootAsThief(thief), 0);
        assertTrue(vault.immuneUntil(victim) > block.timestamp);
        assertTrue(vault.thiefReadyAt(thief) > block.timestamp);
    }

    function test_ClaimLoot_ThiefEscapes() public {
        uint64 nonce = 1003;
        uint32 validBefore = uint32(block.timestamp + 90);
        bytes memory ticketSig = signTicket(victimKey, thief, nonce, validBefore);

        vm.prank(thief);
        uint256 lootId = vault.startLoot(nonce, validBefore, ticketSig);

        (, , uint128 amount, uint128 bond, , , uint40 deadline, ) = vault.loots(lootId);

        // Advance time past deadline
        vm.warp(deadline + 1);

        uint256 thiefPreVault = vault.vault(thief);

        // Anyone calls claim
        vm.prank(stranger);
        vault.claim(lootId);

        // Thief receives loot amount + bond refunded
        assertEq(vault.vault(thief), thiefPreVault + amount + bond);
        assertEq(vault.activeLootAsVictim(victim), 0);
        assertEq(vault.activeLootAsThief(thief), 0);
    }

    function test_Revert_TicketExpired() public {
        uint64 nonce = 1004;
        uint32 validBefore = uint32(block.timestamp - 1);
        bytes memory ticketSig = signTicket(victimKey, thief, nonce, validBefore);

        vm.prank(thief);
        vm.expectRevert(HeistVault.TicketExpired.selector);
        vault.startLoot(nonce, validBefore, ticketSig);
    }

    function test_Revert_TicketReplayed() public {
        uint64 nonce = 1005;
        uint32 validBefore = uint32(block.timestamp + 90);
        bytes memory ticketSig = signTicket(victimKey, thief, nonce, validBefore);

        vm.prank(thief);
        vault.startLoot(nonce, validBefore, ticketSig);

        // Attempt second loot with same nonce
        vm.prank(thief);
        vm.expectRevert(HeistVault.TicketAlreadyUsed.selector);
        vault.startLoot(nonce, validBefore, ticketSig);
    }

    function test_Revert_WrongThiefAttempt() public {
        uint64 nonce = 1006;
        uint32 validBefore = uint32(block.timestamp + 90);
        // Ticket signed specifically naming thief
        bytes memory ticketSig = signTicket(victimKey, thief, nonce, validBefore);

        // Stranger tries to use it
        vm.prank(stranger);
        vm.expectRevert(); // Recovered signer differs or usedTicket invalid
        vault.startLoot(nonce, validBefore, ticketSig);
    }

    function test_StartLoot_SmallVaultTakesTheMinimum() public {
        // 25% of 0.002 ETH is under the minimum, so every roll lands on the floor.
        vm.prank(stranger);
        vault.deposit{value: 0.002 ether}();

        uint64 nonce = 1007;
        uint32 validBefore = uint32(block.timestamp + 90);
        bytes memory ticketSig = signTicket(strangerKey, thief, nonce, validBefore);

        vm.prank(thief);
        vault.startLoot(nonce, validBefore, ticketSig);

        assertEq(vault.vault(stranger), 0.001 ether);
    }

    function test_Revert_VaultBelowTheMinimum() public {
        vm.prank(stranger);
        vault.deposit{value: 0.0009 ether}();

        uint64 nonce = 1008;
        uint32 validBefore = uint32(block.timestamp + 90);
        bytes memory ticketSig = signTicket(strangerKey, thief, nonce, validBefore);

        vm.prank(thief);
        vm.expectRevert(HeistVault.LootAmountTooLow.selector);
        vault.startLoot(nonce, validBefore, ticketSig);
    }

    function test_PlayersCanClearOnlyTheirOwnTimers() public {
        uint64 nonce = 1009;
        uint32 validBefore = uint32(block.timestamp + 90);
        bytes memory ticketSig = signTicket(victimKey, thief, nonce, validBefore);
        vm.prank(thief);
        uint256 lootId = vault.startLoot(nonce, validBefore, ticketSig);
        (, , , , , , uint40 deadline, ) = vault.loots(lootId);
        vm.warp(uint256(deadline) + 1);
        vault.claim(lootId);
        assertTrue(vault.immuneUntil(victim) > 0);
        assertTrue(vault.thiefReadyAt(thief) > 0);

        vm.prank(thief);
        vault.clearMyImmunity(); // Someone else's call doesn't touch the victim's immunity
        assertTrue(vault.immuneUntil(victim) > 0);

        vm.prank(victim);
        vault.clearMyImmunity();
        assertEq(vault.immuneUntil(victim), 0);

        vm.prank(thief);
        vault.clearMyCooldown();
        assertEq(vault.thiefReadyAt(thief), 0);
    }

    // --- Helpers ---
    function vmAddr(uint256 privKey) internal pure returns (address) {
        // Must be the key's real address: tickets signed with vm.sign recover to it.
        return vm.addr(privKey);
    }

    function signTicket(
        uint256 privKey,
        address lThief,
        uint64 nonce,
        uint32 validBefore
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(vault.LOOT_TICKET_TYPEHASH(), lThief, nonce, validBefore)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", vault.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function signCaught(
        uint256 privKey,
        uint256 lootId,
        address lVictim,
        bytes8 challenge
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(vault.CAUGHT_TYPEHASH(), lootId, lVictim, challenge)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", vault.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function assertEq(uint256 a, uint256 b) internal pure {
        require(a == b, "assertEq failed");
    }

    function assertEq(address a, address b) internal pure {
        require(a == b, "assertEq address failed");
    }

    function assertTrue(bool condition) internal pure {
        require(condition, "assertTrue failed");
    }
}
