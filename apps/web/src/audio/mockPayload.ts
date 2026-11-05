// SonicPay Binary Payload Specification (Section 9)

export interface PaymentData {
  version: number;
  chainIndex: number;
  uid: number;
  from: string;
  receiver: string;
  amount: bigint;
  fee: number;
  salt: bigint;
  validBefore: number;
  signature: Uint8Array;
}

export interface AckData {
  version: number;
  uid: number;
  status: number;
  txHash: string;
}

export const STATUS_NAMES: Record<number, string> = {
  0: 'Submitted (Relaying)',
  1: 'Confirmed (Mined On-Chain)',
  2: 'Already Settled (Nonce Used)',
  3: 'Rejected: Expired',
  4: 'Rejected: Insufficient Balance',
  5: 'Rejected: Fee Below Minimum',
};

// Convert hex string (with or without 0x) to Uint8Array
export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return bytes;
}

// Convert Uint8Array to hex string (with 0x prefix)
export function bytesToHex(bytes: Uint8Array): string {
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Default mock payment payload matching Section 9.2
export function createMockPayment(): PaymentData {
  const mockSig = new Uint8Array(64);
  // Fill with deterministic dummy compact signature
  for (let i = 0; i < 64; i++) {
    mockSig[i] = (i * 7 + 0x42) & 0xff;
  }

  return {
    version: 1,
    chainIndex: 0, // Sepolia
    uid: 0x1337,
    from: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    receiver: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    amount: 1000000n, // 1 USDC (6 decimals)
    fee: 10000,       // 0.01 USDC
    salt: 0xa1b2c3d4e5f60718n,
    validBefore: Math.floor(Date.now() / 1000) + 86400, // 24h
    signature: mockSig,
  };
}

// Pack Payment into exact 132 bytes
export function packPayment(p: PaymentData): Uint8Array {
  const buffer = new ArrayBuffer(132);
  const view = new DataView(buffer);
  const u8 = new Uint8Array(buffer);

  // Byte 0: Header (0x11: version 1, type 1 PAYMENT)
  view.setUint8(0, 0x11);

  // Byte 1: Chain index
  view.setUint8(1, p.chainIndex & 0xff);

  // Bytes 2-3: UID (uint16)
  view.setUint16(2, p.uid, false);

  // Bytes 4-23: From address (20 bytes)
  const fromBytes = hexToBytes(p.from);
  u8.set(fromBytes.subarray(0, 20), 4);

  // Bytes 24-43: Receiver address (20 bytes)
  const recBytes = hexToBytes(p.receiver);
  u8.set(recBytes.subarray(0, 20), 24);

  // Bytes 44-51: Amount (uint64)
  view.setBigUint64(44, p.amount, false);

  // Bytes 52-55: Fee (uint32)
  view.setUint32(52, p.fee, false);

  // Bytes 56-63: Salt (uint64)
  view.setBigUint64(56, p.salt, false);

  // Bytes 64-67: ValidBefore (uint32)
  view.setUint32(64, p.validBefore, false);

  // Bytes 68-131: Compact signature (64 bytes)
  u8.set(p.signature.subarray(0, 64), 68);

  return u8;
}

// Unpack Payment from 132 bytes (returns null if invalid header or length)
export function unpackPayment(bytes: Uint8Array): PaymentData | null {
  if (bytes.length !== 132) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const header = view.getUint8(0);
  if (header !== 0x11) return null; // Must be version 1, type 1

  const chainIndex = view.getUint8(1);
  const uid = view.getUint16(2, false);
  const from = bytesToHex(bytes.slice(4, 24));
  const receiver = bytesToHex(bytes.slice(24, 44));
  const amount = view.getBigUint64(44, false);
  const fee = view.getUint32(52, false);
  const salt = view.getBigUint64(56, false);
  const validBefore = view.getUint32(64, false);
  const signature = bytes.slice(68, 132);

  return {
    version: 1,
    chainIndex,
    uid,
    from,
    receiver,
    amount,
    fee,
    salt,
    validBefore,
    signature,
  };
}

// Pack ACK into exact 36 bytes (Section 9.4)
export function packAck(ack: AckData): Uint8Array {
  const buffer = new ArrayBuffer(36);
  const view = new DataView(buffer);
  const u8 = new Uint8Array(buffer);

  // Byte 0: Header (0x12: version 1, type 2 ACK)
  view.setUint8(0, 0x12);

  // Bytes 1-2: UID echoed (uint16)
  view.setUint16(1, ack.uid, false);

  // Byte 3: Status
  view.setUint8(3, ack.status & 0xff);

  // Bytes 4-35: txHash (32 bytes)
  const hashBytes = hexToBytes(ack.txHash);
  u8.set(hashBytes.subarray(0, 32), 4);

  return u8;
}

// Unpack ACK from 36 bytes
export function unpackAck(bytes: Uint8Array): AckData | null {
  if (bytes.length !== 36) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const header = view.getUint8(0);
  if (header !== 0x12) return null;

  const uid = view.getUint16(1, false);
  const status = view.getUint8(3);
  const txHash = bytesToHex(bytes.slice(4, 36));

  return {
    version: 1,
    uid,
    status,
    txHash,
  };
}
