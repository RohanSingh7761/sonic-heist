import {
  MessageType,
  PingMessage,
  PongMessage,
  LootReqMessage,
  TicketMessage,
  CatchMessage,
  CaughtMessage,
  HeistMessage,
} from './types';
import { hexToBytes, bytesToHex } from './signatures';

// PING (11 bytes)
export function encodePing(msg: Omit<PingMessage, 'type'>): Uint8Array {
  const buf = new ArrayBuffer(11);
  const view = new DataView(buf);
  view.setUint8(0, MessageType.PING);
  view.setUint32(1, msg.scannerUid, false);
  view.setUint16(5, msg.nonce, false);
  view.setUint32(7, msg.targetUid, false);
  return new Uint8Array(buf);
}

export function decodePing(bytes: Uint8Array): PingMessage | null {
  if (bytes.length !== 11 || bytes[0] !== MessageType.PING) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    type: MessageType.PING,
    scannerUid: view.getUint32(1, false),
    nonce: view.getUint16(5, false),
    targetUid: view.getUint32(7, false),
  };
}

// PONG (7 bytes)
export function encodePong(msg: Omit<PongMessage, 'type' | 'signalLevel'>): Uint8Array {
  const buf = new ArrayBuffer(7);
  const view = new DataView(buf);
  view.setUint8(0, MessageType.PONG);
  view.setUint32(1, msg.responderUid, false);
  view.setUint16(5, msg.echoNonce, false);
  return new Uint8Array(buf);
}

export function decodePong(bytes: Uint8Array): PongMessage | null {
  if (bytes.length !== 7 || bytes[0] !== MessageType.PONG) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    type: MessageType.PONG,
    responderUid: view.getUint32(1, false),
    echoNonce: view.getUint16(5, false),
  };
}

// LOOT_REQ (25 bytes)
export function encodeLootReq(msg: Omit<LootReqMessage, 'type'>): Uint8Array {
  const buf = new ArrayBuffer(25);
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);
  view.setUint8(0, MessageType.LOOT_REQ);

  const addrBytes = hexToBytes(msg.thiefAddress);
  u8.set(addrBytes.subarray(0, 20), 1);
  view.setUint32(21, msg.victimUid, false);
  return u8;
}

export function decodeLootReq(bytes: Uint8Array): LootReqMessage | null {
  if (bytes.length !== 25 || bytes[0] !== MessageType.LOOT_REQ) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const thiefAddress = bytesToHex(bytes.slice(1, 21));
  const victimUid = view.getUint32(21, false);
  return {
    type: MessageType.LOOT_REQ,
    thiefAddress,
    victimUid,
  };
}

// TICKET (81 bytes)
export function encodeTicket(msg: Omit<TicketMessage, 'type'>): Uint8Array {
  const buf = new ArrayBuffer(81);
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);
  view.setUint8(0, MessageType.TICKET);
  view.setUint32(1, msg.thiefUid, false);
  view.setBigUint64(5, msg.nonce, false);
  view.setUint32(13, msg.validBefore, false);
  u8.set(msg.signature.subarray(0, 64), 17);
  return u8;
}

export function decodeTicket(bytes: Uint8Array): TicketMessage | null {
  if (bytes.length !== 81 || bytes[0] !== MessageType.TICKET) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    type: MessageType.TICKET,
    thiefUid: view.getUint32(1, false),
    nonce: view.getBigUint64(5, false),
    validBefore: view.getUint32(13, false),
    signature: bytes.slice(17, 81),
  };
}

// CATCH (77 bytes)
export function encodeCatch(msg: Omit<CatchMessage, 'type'>): Uint8Array {
  const buf = new ArrayBuffer(77);
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);
  view.setUint8(0, MessageType.CATCH);
  view.setUint32(1, msg.lootId, false);
  u8.set(msg.challenge.subarray(0, 8), 5);
  u8.set(msg.signature.subarray(0, 64), 13);
  return u8;
}

export function decodeCatch(bytes: Uint8Array): CatchMessage | null {
  if (bytes.length !== 77 || bytes[0] !== MessageType.CATCH) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    type: MessageType.CATCH,
    lootId: view.getUint32(1, false),
    challenge: bytes.slice(5, 13),
    signature: bytes.slice(13, 77),
  };
}

// CAUGHT (77 bytes)
export function encodeCaught(msg: Omit<CaughtMessage, 'type'>): Uint8Array {
  const buf = new ArrayBuffer(77);
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);
  view.setUint8(0, MessageType.CAUGHT);
  view.setUint32(1, msg.lootId, false);
  u8.set(msg.challenge.subarray(0, 8), 5);
  u8.set(msg.signature.subarray(0, 64), 13);
  return u8;
}

export function decodeCaught(bytes: Uint8Array): CaughtMessage | null {
  if (bytes.length !== 77 || bytes[0] !== MessageType.CAUGHT) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    type: MessageType.CAUGHT,
    lootId: view.getUint32(1, false),
    challenge: bytes.slice(5, 13),
    signature: bytes.slice(13, 77),
  };
}

// Unified decoder for incoming audio packets
export function decodeHeistMessage(bytes: Uint8Array): HeistMessage | null {
  if (bytes.length < 1) return null;
  const header = bytes[0];

  switch (header) {
    case MessageType.PING:
      return decodePing(bytes);
    case MessageType.PONG:
      return decodePong(bytes);
    case MessageType.LOOT_REQ:
      return decodeLootReq(bytes);
    case MessageType.TICKET:
      return decodeTicket(bytes);
    case MessageType.CATCH:
      return decodeCatch(bytes);
    case MessageType.CAUGHT:
      return decodeCaught(bytes);
    default:
      return null;
  }
}
