// Sonic Heist Protocol Types (Section 8.2 & 8.3)

export enum MessageType {
  PING = 0x11,
  PONG = 0x12,
  LOOT_REQ = 0x13,
  TICKET = 0x14,
  CATCH = 0x15,
  CAUGHT = 0x16,
}

export interface PingMessage {
  type: MessageType.PING;
  scannerUid: number; // uint32
  nonce: number;      // uint16
  targetUid: number;  // uint32 (0 = everyone)
}

export interface PongMessage {
  type: MessageType.PONG;
  responderUid: number; // uint32
  echoNonce: number;    // uint16
  signalLevel?: number; // measured ultrasonic energy (closeness)
}

export interface LootReqMessage {
  type: MessageType.LOOT_REQ;
  thiefAddress: `0x${string}`; // 20 bytes
  victimUid: number;           // uint32
}

export interface TicketMessage {
  type: MessageType.TICKET;
  thiefUid: number;            // uint32
  nonce: bigint;               // uint64
  validBefore: number;         // uint32 (unix timestamp)
  signature: Uint8Array;       // 64 bytes compact (EIP-2098)
}

export interface CatchMessage {
  type: MessageType.CATCH;
  lootId: number;              // uint32
  challenge: Uint8Array;       // 8 bytes
  signature: Uint8Array;       // 64 bytes compact
}

export interface CaughtMessage {
  type: MessageType.CAUGHT;
  lootId: number;              // uint32
  challenge: Uint8Array;       // 8 bytes
  signature: Uint8Array;       // 64 bytes compact
}

export type HeistMessage =
  | PingMessage
  | PongMessage
  | LootReqMessage
  | TicketMessage
  | CatchMessage
  | CaughtMessage;

export interface EIP712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: `0x${string}`;
}
