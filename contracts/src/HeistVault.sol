// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title HeistVault
 * @notice Real-world thief game played over ultrasound.
 *         Holds player vaults, manages loots, escrow, hunt deadlines, and payouts.
 */
contract HeistVault {
    // --- Constants & Game Parameters (Fixed at deployment) ---
    uint40 public constant HEAD_START = 10;          // 10s before victim is notified
    uint40 public constant HUNT_WINDOW = 60;         // 60s for victim to catch thief
    uint256 public constant MIN_LOOT_BPS = 500;      // 5% minimum loot
    uint256 public constant MAX_LOOT_BPS = 2500;     // 25% maximum loot
    uint256 public constant BOND_BPS = 2000;         // 20% thief bond
    uint256 public constant MIN_LOOT_AMOUNT = 0.001 ether; // dust floor
    uint256 public constant VICTIM_IMMUNITY = 300;   // 5 minutes
    uint256 public constant THIEF_COOLDOWN = 120;    // 2 minutes

    // --- EIP-712 Typehashes ---
    bytes32 public constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 public constant LOOT_TICKET_TYPEHASH = keccak256(
        "LootTicket(address thief,uint64 nonce,uint32 validBefore)"
    );
    bytes32 public constant CAUGHT_TYPEHASH = keccak256(
        "Caught(uint256 lootId,address victim,bytes8 challenge)"
    );

    bytes32 public immutable DOMAIN_SEPARATOR;
    address public immutable owner;

    // --- State ---
    mapping(address => uint256) public vault;               // player balances inside contract
    mapping(address => mapping(uint64 => bool)) public usedTicket; // victim => nonce => used
    mapping(address => uint256) public activeLootAsVictim;  // victim => active lootId (or 0)
    mapping(address => uint256) public activeLootAsThief;   // thief => active lootId (or 0)
    mapping(address => uint256) public immuneUntil;         // victim => timestamp
    mapping(address => uint256) public thiefReadyAt;        // thief => timestamp
    bool public gameActive;
    uint256 public lootCount;

    enum Status { None, Active, Cancelled, Claimed }

    struct Loot {
        address thief;
        address victim;
        uint128 amount;     // escrowed from victim
        uint128 bond;       // escrowed from thief
        uint40 startedAt;
        uint40 revealAt;   // startedAt + HEAD_START
        uint40 deadline;   // revealAt + HUNT_WINDOW
        Status status;
    }

    mapping(uint256 => Loot) public loots;

    // --- Events ---
    event Deposited(address indexed player, uint256 amount);
    event Withdrawn(address indexed player, uint256 amount);
    event GameStateChanged(bool active);
    event LootStarted(
        uint256 indexed lootId,
        address indexed thief,
        address indexed victim,
        uint256 amount,
        uint256 bond,
        uint256 revealAt,
        uint256 deadline
    );
    event LootCancelled(uint256 indexed lootId, address indexed victim, address indexed thief);
    event LootClaimed(uint256 indexed lootId, address indexed thief, address indexed victim, uint256 amount);

    // --- Errors ---
    error Unauthorized();
    error GameNotActive();
    error GameIsActive();
    error ActiveLootInProgress();
    error TicketExpired();
    error TicketAlreadyUsed();
    error InvalidSignature();
    error SelfLootNotAllowed();
    error VictimIsImmune();
    error ThiefOnCooldown();
    error LootAmountTooLow();
    error InsufficientVaultBalance();
    error LootNotActive();
    error DeadlinePassed();
    error DeadlineNotReached();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor() {
        owner = msg.sender;
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes("SonicHeist")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    // --- Admin ---
    function setGameActive(bool active) external onlyOwner {
        gameActive = active;
        emit GameStateChanged(active);
    }

    // --- Vault Management ---
    function deposit() external payable {
        if (msg.value == 0) revert InsufficientVaultBalance();
        vault[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        if (gameActive) revert GameIsActive();
        if (activeLootAsVictim[msg.sender] != 0 || activeLootAsThief[msg.sender] != 0) {
            revert ActiveLootInProgress();
        }
        if (vault[msg.sender] < amount) revert InsufficientVaultBalance();

        vault[msg.sender] -= amount;
        emit Withdrawn(msg.sender, amount);

        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    // --- Core Game Actions ---

    /**
     * @notice Thief starts a loot using an EIP-712 LootTicket signed by the victim over ultrasound.
     */
    function startLoot(
        uint64 nonce,
        uint32 validBefore,
        bytes calldata sig
    ) external returns (uint256 lootId) {
        if (!gameActive) revert GameNotActive();
        if (block.timestamp > validBefore) revert TicketExpired();

        // 1. Recover victim address from LootTicket signature
        bytes32 structHash = keccak256(
            abi.encode(LOOT_TICKET_TYPEHASH, msg.sender, nonce, validBefore)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        address victim = recoverSigner(digest, sig);

        if (victim == address(0)) revert InvalidSignature();
        if (victim == msg.sender) revert SelfLootNotAllowed();
        if (usedTicket[victim][nonce]) revert TicketAlreadyUsed();

        usedTicket[victim][nonce] = true;

        // 2. Validate participant readiness
        if (activeLootAsVictim[victim] != 0) revert ActiveLootInProgress();
        if (block.timestamp < immuneUntil[victim]) revert VictimIsImmune();

        if (activeLootAsThief[msg.sender] != 0) revert ActiveLootInProgress();
        if (block.timestamp < thiefReadyAt[msg.sender]) revert ThiefOnCooldown();

        // 3. Compute pseudo-random loot percentage in [MIN_LOOT_BPS, MAX_LOOT_BPS]
        lootId = ++lootCount;
        bytes32 prevHash = blockhash(block.number - 1);
        uint256 rand = uint256(keccak256(abi.encode(prevHash, victim, nonce, lootId)));
        uint256 bps = MIN_LOOT_BPS + (rand % (MAX_LOOT_BPS - MIN_LOOT_BPS + 1));

        // 4. Calculate loot amount and required thief bond
        uint256 lootAmount = (vault[victim] * bps) / 10000;
        if (lootAmount < MIN_LOOT_AMOUNT) revert LootAmountTooLow();

        uint256 bondAmount = (lootAmount * BOND_BPS) / 10000;
        if (vault[msg.sender] < bondAmount) revert InsufficientVaultBalance();

        // 5. Escrow funds from vaults
        vault[victim] -= lootAmount;
        vault[msg.sender] -= bondAmount;

        uint40 started = uint40(block.timestamp);
        uint40 reveal = started + HEAD_START;
        uint40 deadline = reveal + HUNT_WINDOW;

        loots[lootId] = Loot({
            thief: msg.sender,
            victim: victim,
            amount: uint128(lootAmount),
            bond: uint128(bondAmount),
            startedAt: started,
            revealAt: reveal,
            deadline: deadline,
            status: Status.Active
        });

        activeLootAsVictim[victim] = lootId;
        activeLootAsThief[msg.sender] = lootId;

        emit LootStarted(lootId, msg.sender, victim, lootAmount, bondAmount, reveal, deadline);
    }

    /**
     * @notice Victim cancels an active loot by proving physical proximity to the thief
     *         with a signed Caught message received over ultrasound.
     */
    function cancel(
        uint256 lootId,
        bytes8 challenge,
        bytes calldata thiefSig
    ) external {
        Loot storage loot = loots[lootId];
        if (loot.status != Status.Active) revert LootNotActive();
        if (msg.sender != loot.victim) revert Unauthorized();
        if (block.timestamp > loot.deadline) revert DeadlinePassed();

        // Verify the thief signed Caught(lootId, victim, challenge)
        bytes32 structHash = keccak256(
            abi.encode(CAUGHT_TYPEHASH, lootId, msg.sender, challenge)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        address signer = recoverSigner(digest, thiefSig);

        if (signer != loot.thief) revert InvalidSignature();

        // Cancel loot: credit victim with loot amount + thief's bond
        loot.status = Status.Cancelled;
        uint256 refundTotal = uint256(loot.amount) + uint256(loot.bond);
        vault[loot.victim] += refundTotal;

        // Clear active loot pointers
        activeLootAsVictim[loot.victim] = 0;
        activeLootAsThief[loot.thief] = 0;

        // Set cooldowns
        immuneUntil[loot.victim] = block.timestamp + VICTIM_IMMUNITY;
        thiefReadyAt[loot.thief] = block.timestamp + THIEF_COOLDOWN;

        emit LootCancelled(lootId, loot.victim, loot.thief);
    }

    /**
     * @notice Anyone can claim an unresolved loot after the deadline passes.
     *         Payout moves to the thief along with their returned bond.
     */
    function claim(uint256 lootId) external {
        Loot storage loot = loots[lootId];
        if (loot.status != Status.Active) revert LootNotActive();
        if (block.timestamp <= loot.deadline) revert DeadlineNotReached();

        loot.status = Status.Claimed;
        uint256 payoutTotal = uint256(loot.amount) + uint256(loot.bond);
        vault[loot.thief] += payoutTotal;

        // Clear active pointers
        activeLootAsVictim[loot.victim] = 0;
        activeLootAsThief[loot.thief] = 0;

        // Set cooldowns measured from deadline
        immuneUntil[loot.victim] = loot.deadline + VICTIM_IMMUNITY;
        thiefReadyAt[loot.thief] = loot.deadline + THIEF_COOLDOWN;

        emit LootClaimed(lootId, loot.thief, loot.victim, loot.amount);
    }

    // --- Signature Helper ---
    function recoverSigner(bytes32 digest, bytes memory sig) public pure returns (address) {
        if (sig.length == 65) {
            bytes32 r;
            bytes32 s;
            uint8 v;
            assembly {
                r := mload(add(sig, 32))
                s := mload(add(sig, 64))
                v := byte(0, mload(add(sig, 96)))
            }
            if (v < 27) v += 27;
            return ecrecover(digest, v, r, s);
        } else if (sig.length == 64) {
            // EIP-2098 compact format
            bytes32 r;
            bytes32 vs;
            assembly {
                r := mload(add(sig, 32))
                vs := mload(add(sig, 64))
            }
            bytes32 s = vs & bytes32(0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff);
            uint8 v = uint8((uint256(vs) >> 255)) + 27;
            return ecrecover(digest, v, r, s);
        }
        return address(0);
    }

    // Receive ETH directly into vault
    receive() external payable {
        vault[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }
}
