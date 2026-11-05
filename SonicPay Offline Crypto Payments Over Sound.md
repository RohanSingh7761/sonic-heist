# SonicPay: Offline Crypto Payments Over Sound

*Hackathon design document · Draft v1 · Target network: Ethereum Sepolia · 5 November 2026*

## 1. Summary

SonicPay lets a person send a stablecoin payment from a phone that has **no internet connection**. The phone signs a payment authorization, converts it into a short burst of audio, and plays it through its speaker. Any nearby device that runs the SonicPay SDK **and has internet** hears the audio, decodes it, and submits it to the blockchain, paying the gas fee. The relayer is compensated by a small fee included inside the signed payment. When the transaction is confirmed, the relayer plays a short audio acknowledgement (ACK) so the payer's phone knows the payment went through.

In one line: **the sender signs offline, sound carries the signature, and whoever is online finishes the job.**

Key properties:

- No Wi-Fi, mobile data, Bluetooth pairing, or NFC needed on the payer side.
- One-to-many broadcast: any nearby SDK device can act as a relayer.
- The payer never needs ETH. The payer only holds USDC.
- The relayer cannot steal or redirect funds, because everything is bound to the payer's signature.
- Everything works with a standard token (USDC), a single small stateless contract, and an open-source audio modem.

## 2. Problem and motivation

On-chain payments assume the sender is online: the wallet must fetch a nonce, a gas price and a balance, then broadcast a transaction. In many real situations (basements, flights, rural areas, crowded events, network outages) the sender is offline but a person standing next to them is online. Existing offline payment systems (sound-based UPI payments, early Google Pay Cash Mode, offline CBDC pilots) prove that audio is a workable transport, but they depend on a centralized backend. SonicPay applies the same idea to a public blockchain, where the payment itself is a self-verifying cryptographic object that anyone can carry to the chain.

## 3. Background concepts

Readers new to the stack should read this section first.

**Signed message versus transaction.** A normal Ethereum transaction must be sent by the account owner and paid for in ETH. A *signed message* is just a piece of data plus a signature. It can be created offline and later handed to anyone. A smart contract can verify the signature and act on it.

**EIP-712.** A standard for signing structured data, so the wallet can show the user what they are approving and the contract can verify exactly those fields.

**EIP-3009 (USDC).** Circle's USDC implements `transferWithAuthorization` and `receiveWithAuthorization`. The token holder signs an EIP-712 message that says: move `value` USDC from me to `to`, valid between `validAfter` and `validBefore`, with one-time random `nonce`. **Anyone** can submit the signed message on-chain and pay the gas. Because the nonce is a random 32-byte value (not sequential), many authorizations can exist at the same time and none can get stuck. `receiveWithAuthorization` additionally requires that the caller is the `to` address, which prevents third parties from calling USDC directly and skipping our contract's logic.

**Relayer.** A device that takes a signed message created by someone else, submits it on-chain, and pays gas. In SonicPay the relayer earns a fee for doing this.

**Audio modem (ggwave).** An open-source library that encodes bytes into audible or ultrasonic tones using multi-frequency FSK with Reed-Solomon error correction, and decodes them from a microphone. It has WebAssembly and JavaScript builds, so it runs in a browser. Its variable-length mode carries up to 140 bytes per message.

## 4. Actors

| Actor | Description | Connectivity |
| --- | --- | --- |
| **Payer** (Alice) | Wants to send USDC to someone. Holds USDC in a wallet inside the SonicPay app. | **Offline** at send time |
| **Receiver** (Bob) | The address that should receive the money. Does not need to be nearby, and does not need the app. | Not required |
| **Relayer** (Carol) | Any nearby device running the SonicPay relayer SDK. Submits the transaction, pays gas, earns the fee. | **Online** |

The receiver can also be the relayer (for example, a shop that listens for payments). The design treats this as a special case, not a different flow.

## 5. User flow

### 5.1 Preparation (while the payer is still online)

1. Alice opens the SonicPay web app (a PWA, installable and cached for offline use) and creates a wallet. The private key stays on her device.
2. She funds the wallet with USDC. She does **not** need ETH.
3. The app caches everything it will need offline: chain configuration, the USDC EIP-712 domain, her latest USDC balance, and saved contacts (name to address).

### 5.2 Sending (payer offline)

1. Alice picks a contact (or pastes or scans an address), enters an amount, and sees a confirmation screen showing receiver, amount, relay fee, and expiry.
2. She approves. The app generates a random `salt` and a random 16-bit `uid`, computes the nonce commitment, and signs the USDC authorization.
3. The app packs the 132-byte payload (section 9) and plays it as audio. It then **listens** for an ACK.
4. The payment is stored locally as `pending`. If no ACK arrives within a timeout, the app replays the payload (up to a configurable number of attempts).

### 5.3 Relaying (relayer online)

1. Carol's device runs the relayer SDK in the foreground, with the microphone on.
2. It hears and decodes the payload, validates it locally (expiry, minimum fee, chain), and **simulates** the contract call. Simulation is free and catches bad signatures, used nonces, and insufficient balance.
3. If valid, it submits `redeem(...)` to the SonicRelay contract and pays gas in Sepolia ETH.
4. The contract pulls USDC from Alice via EIP-3009, sends the amount to Bob, and sends the fee to Carol.

### 5.4 Acknowledgement

1. After the transaction is confirmed, the relayer plays a 36-byte ACK containing the `uid`, a status code, and the transaction hash.
2. Alice's phone matches the `uid` to a pending payment and marks it `relayed`. It stops replaying.

### 5.5 Reconciliation (when the payer is back online)

Because an ACK heard over air cannot be verified offline (anyone could fake one), the app re-checks every `relayed` or `pending` payment once connectivity returns:

- Query `authorizationState(from, nonce)` on USDC. If `true`, the payment is `confirmed`.
- If `false` and not expired, the app submits the stored authorization itself (the payer is now online and can also act as relayer, forfeiting nothing but gas).
- If `false` and expired, the payment is marked `expired` and the funds were never moved.

### 5.6 Payment states

| State | Meaning | Trusted? |
| --- | --- | --- |
| `pending` | Payload emitted, no ACK yet | n/a |
| `submitted` | Soft ACK (status 0) heard: a relayer sent the transaction | No (unverified audio) |
| `relayed` | Final ACK heard (status 1 or 2) | No (unverified audio) |
| `confirmed` | Verified on-chain after reconnecting | **Yes** |
| `expired` | `validBefore` passed and the authorization was never used | Yes |

The UI must say **Sent, awaiting confirmation** for `submitted` and `relayed`, never **Paid**.

### 5.7 Demo script (for judges)

1. Show Alice's phone in airplane mode, with a USDC balance. Show Carol's laptop online with the relayer page open.
2. Alice sends 1 USDC to Bob's address. Play the audio.
3. Laptop decodes, shows the signer and amount, submits, and shows the Sepolia Etherscan link.
4. Laptop plays the ACK. Alice's phone flips from `pending` to `relayed`.
5. Alice turns Wi-Fi back on. The app verifies on-chain and flips to `confirmed`.

## 6. Architecture

```
            OFFLINE                                  ONLINE
  +------------------------+              +---------------------------+
  |  Payer app (PWA)       |              |  Relayer app / SDK        |
  |  - wallet (viem)       |   sound      |  - mic + ggwave decode    |
  |  - EIP-712 signer      | -----------> |  - validation + simulate  |
  |  - payload encoder     |  (payload)   |  - tx submission (viem)   |
  |  - ggwave encode/play  |              |  - ggwave ACK encode/play |
  |  - pending store       | <----------- |                           |
  |  - ggwave listen (ACK) |   sound      +-------------+-------------+
  +------------------------+   (ACK)                    |
                                                         | JSON-RPC (Sepolia)
                                                         v
                                      +-------------------------------------+
                                      |  SonicRelay contract (new)          |
                                      |    redeem(...)                      |
                                      |         | receiveWithAuthorization  |
                                      |         v                           |
                                      |  USDC (Circle, EIP-3009, existing)  |
                                      +------------------+------------------+
                                                         |
                                         amount -> Receiver (Bob)
                                         fee    -> Relayer (msg.sender)
```

### Components

1. **Payer module.** Key management, payment form, signing, payload encoding, audio playback, ACK listening, local pending store, and the online reconciliation job.
2. **Relayer module.** Microphone capture, decoding, validation, simulation, submission, in-flight de-duplication, ACK generation, and playback.
3. **Shared library (`sonicpay-core`).** Payload encode/decode, nonce commitment, chain and token registry, EIP-712 types, status codes. Used by both modules so the wire format is defined in exactly one place.
4. **SonicRelay contract.** A tiny stateless contract that splits one USDC authorization into a payment and a relay fee.
5. **USDC (existing).** Circle's token, which verifies the payer's signature and moves the funds.

There is **no backend server**. The only network dependencies are an Ethereum RPC endpoint (relayer, and payer when reconnecting) and the chain itself.

## 7. Tech stack

| Layer | Choice | Reason |
| --- | --- | --- |
| Smart contracts | Solidity 0.8.24+, Foundry (forge, anvil, cast) | Fast tests and Sepolia deployment scripts |
| Token | Circle USDC on Sepolia (EIP-3009) | Native gasless authorization support |
| Frontend | React + Vite (or Next.js), TypeScript, installable as a PWA | One codebase for phone and laptop, no app-store review |
| Offline support | Service worker caching, IndexedDB for pending payments | Payer app must open and run with no network |
| Ethereum library | viem | Typed EIP-712 signing, simulation (`simulateContract`), receipts |
| Audio modem | ggwave (WASM/JS build) | Open source, tested in browsers, built-in error correction |
| Browser audio | Web Audio API and `getUserMedia` | Playback and microphone access |
| Key storage (hackathon) | Locally generated key in the browser, kept in IndexedDB | Fast to build. Production would use passkeys or secure hardware. |
| RPC | Alchemy, Infura, or a public Sepolia endpoint | Relayer submission and simulation |
| Hosting | Vercel or Netlify (HTTPS required for microphone access) | Free and quick |

## 8. Smart contracts

### 8.1 Existing: USDC (Circle)

Used as is. The functions we rely on:

- `receiveWithAuthorization(from, to, value, validAfter, validBefore, nonce, v, r, s)`: verifies the payer's EIP-712 signature, marks the nonce used, and moves `value` from `from` to `to`. It reverts unless `msg.sender == to`.
- `authorizationState(authorizer, nonce)`: returns whether a nonce has been used or cancelled.
- `transfer`, `balanceOf`, `name`, `version`, `DOMAIN_SEPARATOR`.

### 8.2 New: SonicRelay

A single contract with no owner, no storage besides an immutable token address, and no admin functions. It never holds funds beyond the duration of one transaction.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IUSDC3009 {
    function receiveWithAuthorization(
        address from, address to, uint256 value,
        uint256 validAfter, uint256 validBefore, bytes32 nonce,
        uint8 v, bytes32 r, bytes32 s
    ) external;
    function transfer(address to, uint256 amount) external returns (bool);
}

contract SonicRelay {
    IUSDC3009 public immutable USDC;

    error TransferFailed();

    event Redeemed(
        address indexed payer,
        address indexed receiver,
        address indexed relayer,
        uint256 amount,
        uint256 fee,
        bytes32 nonce
    );

    constructor(address usdc) {
        USDC = IUSDC3009(usdc);
    }

    function redeem(
        address payer,
        address receiver,
        uint256 amount,
        uint256 fee,
        uint64  salt,
        uint256 validBefore,
        uint8 v, bytes32 r, bytes32 s
    ) external {
        // The nonce commits to receiver and fee. USDC checks the payer's
        // signature against this nonce, so any change to receiver or fee
        // invalidates the signature.
        bytes32 nonce = keccak256(abi.encode(receiver, fee, salt));

        USDC.receiveWithAuthorization(
            payer, address(this), amount + fee, 0, validBefore, nonce, v, r, s
        );

        if (!USDC.transfer(receiver, amount)) revert TransferFailed();
        if (fee > 0 && !USDC.transfer(msg.sender, fee)) revert TransferFailed();

        emit Redeemed(payer, receiver, msg.sender, amount, fee, nonce);
    }
}
```

### 8.3 Why the nonce commitment matters

USDC's signature covers only `from, to, value, validAfter, validBefore, nonce`. Here `to` is the SonicRelay contract, so the *final* receiver and the fee are not directly signed. Without protection, a malicious relayer could change the receiver to themselves. The fix: the payer sets `nonce = keccak256(receiver, fee, salt)` and signs that. SonicRelay recomputes the nonce from the arguments it receives. If the relayer changes the receiver or fee, the recomputed nonce differs from the signed one and USDC rejects the signature. The `amount` cannot be changed either, because the signed `value` equals `amount + fee`.

### 8.4 Contract tests (Foundry)

- Happy path: receiver gets `amount`, relayer gets `fee`, payer balance drops by `amount + fee`, event emitted.
- Tampered receiver, tampered fee, tampered amount: all revert.
- Expired authorization (`validBefore` in the past): reverts.
- Replay of an already used authorization: reverts.
- Direct call to USDC by a third party: reverts (caller is not the payee).
- Payer with insufficient balance: reverts.
- Fee of zero: allowed, no fee transfer made.

### 8.5 Deployment

Deploy SonicRelay to Sepolia with the USDC address as the constructor argument, verify it on Etherscan, and place its address in the SDK registry. **Before building, confirm that the Sepolia USDC supports EIP-3009** by reading `authorizationState` (it must not revert). If it does not, deploy Circle's open-source `FiatTokenV2_2` as a mock token and use that instead.

## 9. Payload specification

All multi-byte integers are **big-endian**. The audio layer (ggwave) adds its own error correction, so there is no separate checksum.

### 9.1 Header (all messages)

Byte 0 holds the protocol version in the high nibble and the message type in the low nibble.

| Message type | Value |
| --- | --- |
| `PAYMENT` | `0x1` |
| `ACK` | `0x2` |

With version 1, a payment header byte is `0x11` and an ACK header byte is `0x12`. Decoders ignore any message with an unknown version or type.

### 9.2 Payment payload (132 bytes)

| Offset | Bytes | Field | Notes |
| --- | --- | --- | --- |
| 0 | 1 | header | version and type (`0x11`) |
| 1 | 1 | chain index | index into the SDK registry (0 = Sepolia, chainId 11155111) |
| 2 | 2 | `uid` | random 16-bit tag used only to match the ACK. **Not signed.** |
| 4 | 20 | `from` | payer address |
| 24 | 20 | `receiver` | final recipient |
| 44 | 8 | `amount` | uint64, USDC base units (6 decimals, so 1 USDC = 1000000) |
| 52 | 4 | `fee` | uint32, relay fee in base units |
| 56 | 8 | `salt` | uint64 random |
| 64 | 4 | `validBefore` | uint32 unix timestamp (seconds) |
| 68 | 64 | `signature` | EIP-2098 compact form (`r` plus `yParityAndS`) |
| **Total** | **132** |  | ggwave maximum is 140 bytes, leaving 8 spare |

Fields **not** sent because they can be derived or are constants: the `nonce` (recomputed from receiver, fee, and salt), `validAfter` (always 0), `to` (the SonicRelay address for the chain), the token address, and the EIP-712 domain (all from the registry).

### 9.3 What the payer signs

The payer signs a USDC `ReceiveWithAuthorization` EIP-712 message:

```ts
const domain = { name, version, chainId, verifyingContract: USDC };  // read name/version from the token
const types = {
  ReceiveWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};
const nonce = keccak256(encodeAbiParameters(
  [{ type: 'address' }, { type: 'uint256' }, { type: 'uint64' }],
  [receiver, fee, salt],
));
const message = {
  from: payer, to: SONIC_RELAY, value: amount + fee,
  validAfter: 0n, validBefore: BigInt(validBefore), nonce,
};
const signature = await account.signTypedData({ domain, types, primaryType: 'ReceiveWithAuthorization', message });
```

The `name` and `version` in the domain **must be read from the deployed token** (`name()` and `version()`), not hard-coded. Testnet deployments can use different names than mainnet, and a mismatch produces an invalid-signature revert.

### 9.4 ACK payload (36 bytes)

| Offset | Bytes | Field | Notes |
| --- | --- | --- | --- |
| 0 | 1 | header | version and type (`0x12`) |
| 1 | 2 | `uid` | echoed from the payment |
| 3 | 1 | `status` | see below |
| 4 | 32 | `txHash` | transaction hash (zero-filled if none) |

| Status | Meaning |
| --- | --- |
| 0 | Submitted: transaction sent, not yet confirmed |
| 1 | Confirmed: receipt seen |
| 2 | Already settled: the nonce was used (another relayer won the race) |
| 3 | Rejected: expired |
| 4 | Rejected: insufficient balance |
| 5 | Rejected: fee below relayer minimum |

The note on rejections: statuses 3 to 5 let the payer app react (for example, re-sign with a higher fee) rather than blindly retrying.

### 9.5 UID rules

The `uid` only needs to be unique among the payer's **own** active payments. Pick a random 16-bit value not used by any `pending`, `submitted`, or `relayed` payment. A stranger's payment may share the same uid with probability about 1 in 65,536. This is harmless, because the payer only accepts an ACK for a uid it has pending, and settlement is always verified on-chain.

## 10. Audio layer

- **Library and mode.** ggwave with an audible protocol by default. The ultrasonic protocol is optional and less reliable because many phone speakers and microphones roll off above roughly 18 kHz.
- **Duration.** A 132-byte payload takes roughly 5 to 10 seconds to play. A 36-byte ACK takes roughly 2 to 3 seconds.
- **Half-duplex.** A device cannot reliably listen while it plays. Use turn-taking: the payer plays once, then listens.
- **Retry schedule.** Play, then listen for a window long enough for the relayer to submit and confirm. On Sepolia (12-second blocks) use **45 to 60 seconds**. Replay up to 3 times. Do not loop continuously, or the ACK will collide with the payload.
- **Soft ACK for responsiveness.** The relayer may play a status-0 ACK as soon as the transaction is submitted, then a status-1 ACK after confirmation.
- **Shared medium.** Everyone nearby hears everything. This is safe by design, because payloads are signed and bound to a receiver. Relayers should apply random back-off (for example 0 to 2 seconds) before submitting to reduce duplicate races.
- **Range.** About 1 to 3 meters in a quiet room. Hold the devices close for the demo.
- **Browser constraints.** Microphone access requires HTTPS and a user gesture. iOS Safari requires a tap before audio can play. The relayer tab must stay in the foreground with the screen on.

## 11. Component logic

### 11.1 Payer

```ts
async function send(receiver: Address, amount: bigint) {
  const fee = FEE_DEFAULT;                              // e.g. 10000n = 0.01 USDC
  const salt = randomUint64();
  const validBefore = nowSec() + 24 * 3600;
  const uid = newUid(store.activeUids());
  const sig = await signAuthorization({ receiver, amount, fee, salt, validBefore });
  const payload = encodePayment({ uid, from: me, receiver, amount, fee, salt, validBefore, sig });
  await store.save({ uid, state: 'pending', salt, receiver, amount, fee, validBefore, payload });
  await emitWithRetries(payload, { listenMs: 50_000, maxAttempts: 3 });
}

function onAudio(bytes: Uint8Array) {
  const ack = decodeAck(bytes);                         // null if not a valid ACK
  if (!ack) return;
  const p = store.findActive(ack.uid);
  if (!p) return;
  if (ack.status === 0) p.state = 'submitted';
  else if (ack.status === 1 || ack.status === 2) { p.state = 'relayed'; stopEmitting(p); }
  else handleRejection(p, ack.status);
}

async function onOnline() {                             // reconciliation
  for (const p of store.active()) {
    const used = await usdc.read.authorizationState([me, nonceOf(p)]);
    if (used) p.state = 'confirmed';
    else if (nowSec() > p.validBefore) p.state = 'expired';
    else await submitMyself(p);
  }
}
```

### 11.2 Relayer

```ts
const inflight = new Set<string>();                      // key = from + nonce

async function onAudio(bytes: Uint8Array) {
  const msg = decodePayment(bytes);                      // null if not a valid payment
  if (!msg || msg.chainIndex !== MY_CHAIN) return;
  if (msg.validBefore < nowSec() + 60) return;           // too close to expiry
  if (msg.fee < MIN_FEE) return;

  const nonce = commitNonce(msg.receiver, msg.fee, msg.salt);
  const key = msg.from + nonce;
  if (inflight.has(key)) return;                         // payer is replaying; ignore
  inflight.add(key);

  try {
    const args = [msg.from, msg.receiver, msg.amount, msg.fee, msg.salt, msg.validBefore, ...splitSig(msg.sig)];
    await publicClient.simulateContract({ address: SONIC_RELAY, abi, functionName: 'redeem', args, account: relayer });
    const hash = await wallet.writeContract({ address: SONIC_RELAY, abi, functionName: 'redeem', args });
    await playAck({ uid: msg.uid, status: 0, txHash: hash });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    await playAck({ uid: msg.uid, status: receipt.status === 'success' ? 1 : 3, txHash: hash });
  } catch (e) {
    // Simulation failed. If the nonce is already used, tell the payer.
    const used = await usdc.read.authorizationState([msg.from, nonce]);
    if (used) await playAck({ uid: msg.uid, status: 2, txHash: ZERO_HASH });
  } finally {
    inflight.delete(key);
  }
}
```

The `inflight` set matters because the payer replays the payload. Without it, one relayer could submit the same payment multiple times and waste gas.

## 12. Security and threat model

| Threat | Impact | Mitigation |
| --- | --- | --- |
| Relayer changes receiver or fee | Funds redirected | Nonce commitment: any change breaks the signature (section 8.3) |
| Relayer changes amount | Wrong amount | Signed `value = amount + fee`, so any change breaks the signature |
| Audio replay (someone records and replays) | Double payment | Nonce is single-use in USDC, so a replay reverts |
| Eavesdropper relays the payment | None | Receiver is fixed by the signature. The eavesdropper only earns the fee. |
| Fake ACK played by a bystander | Payer believes a payment was relayed | ACK is a soft state. Only an on-chain check yields `confirmed`. |
| MEV bot copies the relayer's pending transaction | Relayer loses the fee | Payment still reaches the receiver. Acceptable for a testnet demo. |
| Jamming or loud environment | Payment not heard | Error correction, retries, and long expiry. Fall back to another transport in future. |
| Offline double-spend | Payer signs two authorizations for the same funds | See section 13. Mitigated in the roadmap by a collateral vault. |
| Payer key theft | Loss of funds | Hackathon: local key. Production: secure hardware or passkeys with a spending limit. |
| Wrong receiver address entered | Funds sent to the wrong person | Show full address (and name from contacts) on the confirmation screen |
| Payer is blocked by the token (blacklist) | Redemption reverts | Out of scope |

Privacy note: payloads are **signed but not encrypted**. Anyone in earshot can read the payer, receiver, and amount. Optional encryption to the receiver's key (ECIES) is listed in future work.

## 13. Known limitations

1. **Offline double-spend.** While offline, the payer's phone cannot know the current balance. A payer can sign two valid authorizations for the same USDC, and only the first to land will succeed. A relayer that loses the race may lose a little gas. This is acceptable for small amounts and for a testnet demo, and is addressed in the roadmap.
2. **ACK is not authenticated.** It is a convenience signal until the chain confirms.
3. **A relayer must exist.** Someone nearby must be online and running the relayer page in the foreground before the authorization expires. Use a long expiry (hours).
4. **No instant point-of-sale acceptance.** The receiver is usually not present, so the flow suits peer-to-peer sends. A merchant can run the relayer role to approximate point-of-sale, trusting the voucher.
5. **Low bandwidth and short range.** Sound carries tens of bytes per second over a couple of meters.
6. **Mobile background limits.** Browsers and mobile operating systems restrict background microphone access, so listening is foreground-only.
7. **Slow Sepolia confirmations.** About 12 seconds per block lengthens the ACK wait compared with an L2.

## 14. Sepolia configuration

| Item | Value |
| --- | --- |
| Network | Ethereum Sepolia |
| Chain ID | 11155111 |
| SDK chain index | 0 |
| USDC (Circle testnet) | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| SonicRelay | *deployed by us, address to be filled in after deployment* |
| Test USDC faucet | faucet.circle.com (about 20 USDC per address every 2 hours) |
| Sepolia ETH | any public Sepolia faucet (needed only by relayer wallets and deployer) |
| Default fee | 10000 base units (0.01 USDC) |
| Default expiry | 24 hours |
| ACK listen window | 45 to 60 seconds, max 3 attempts |

## 15. Build plan

| Phase | Tasks | Output |
| --- | --- | --- |
| 1. Contract | Write SonicRelay, Foundry tests, check `authorizationState` on Sepolia USDC, deploy and verify | Deployed address |
| 2. Core library | Payload encode/decode, nonce commitment, signing helper, registry, unit tests with round-trip fixtures | `sonicpay-core` |
| 3. Chain-only test | Script that signs on one account and redeems from another, no audio | Proof the contract flow works |
| 4. Audio | Integrate ggwave, loopback test in one tab, then two devices | Reliable decode of 132 bytes |
| 5. Payer UI | Wallet, contacts, send form, pending list, PWA offline caching | Payer app |
| 6. Relayer UI | Listener page with validation, simulation, submission, ACK | Relayer app |
| 7. Reconciliation | Online re-check and self-submit logic | `confirmed` and `expired` states |
| 8. Polish and demo | Noisy-room test, error states, README, demo recording | Submission |

Suggested order of risk: confirm EIP-3009 on the token first, then audio reliability across real devices, then everything else.

## 16. Future work

- **Collateral vault.** Users deposit USDC and sign vouchers against it, with slashing for over-spending. This removes the offline double-spend risk.
- **Hardware-enforced spending limits** using the phone's secure enclave and a monotonic counter.
- **Layer 2 and mainnet support** (Base, Arbitrum, Polygon) with cheaper gas and faster ACKs.
- **Dynamic fees:** a signed fee that rises over time (Dutch auction) so payments survive gas spikes.
- **Relayer marketplace and batching** to amortize gas across many payments.
- **Account abstraction (ERC-4337 or EIP-7702)** with paymasters for broader token support.
- **Encrypted payloads** (ECIES to the receiver's public key) for privacy.
- **Alternative transports** (BLE, animated QR) behind the same payload format.
- **Native mobile SDKs** (iOS and Android) with limited background listening.
- **Authenticated ACKs** signed by the relayer, optionally with a relayer reputation system.

## 17. Glossary

| Term | Meaning |
| --- | --- |
| **ACK** | Acknowledgement message played by the relayer back to the payer |
| **EIP-712** | Standard for signing typed structured data |
| **EIP-2098** | Compact 64-byte signature format |
| **EIP-3009** | Token standard for gasless, signature-based transfers (used by USDC) |
| **ggwave** | Open-source library that transmits data as sound |
| **Nonce** | One-time value that makes an authorization usable only once |
| **Relayer** | Device that submits someone else's signed payment and pays gas |
| **Salt** | Random value that makes each payment's nonce unique |
| **uid** | 16-bit tag used to match an ACK to a pending payment |
| **Sepolia** | Ethereum test network with free test ETH and test USDC |
