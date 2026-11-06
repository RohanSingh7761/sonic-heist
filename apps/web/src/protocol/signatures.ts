// Compact EIP-2098 Signatures & Name Generation

// Hex helpers
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): `0x${string}` {
  return ('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`;
}

/**
 * Converts standard ECDSA (r, s, v) into 64-byte EIP-2098 compact signature (r + yParityAndS)
 */
export function toCompactSignature(r: `0x${string}`, s: `0x${string}`, v: number): Uint8Array {
  const rBytes = hexToBytes(r);
  const sBytes = hexToBytes(s);
  const compact = new Uint8Array(64);

  // Copy r (32 bytes)
  compact.set(rBytes.subarray(0, 32), 0);

  // yParity is 0 if v is 27, 1 if v is 28
  const yParity = (v === 28 || v === 1) ? 0x80 : 0x00;
  compact.set(sBytes.subarray(0, 32), 32);
  compact[32] = compact[32] | yParity; // Set top bit if yParity is 1

  return compact;
}

/**
 * Expands 64-byte EIP-2098 compact signature into standard { r, s, v }
 */
export function splitCompactSignature(compact: Uint8Array): {
  r: `0x${string}`;
  s: `0x${string}`;
  v: number;
} {
  if (compact.length !== 64) {
    throw new Error(`Compact signature must be exactly 64 bytes, got ${compact.length}`);
  }

  const r = bytesToHex(compact.subarray(0, 32));
  const sBytes = new Uint8Array(compact.subarray(32, 64));

  const yParity = (sBytes[0] & 0x80) !== 0 ? 1 : 0;
  sBytes[0] = sBytes[0] & 0x7f; // Clear top bit to retrieve s

  const s = bytesToHex(sBytes);
  const v = yParity === 1 ? 28 : 27;

  return { r, s, v };
}

// Deterministic player names (Section 9.7)
const ADJECTIVES = [
  'Swift', 'Shadow', 'Silent', 'Ghost', 'Neon', 'Cyber', 'Iron', 'Crimson',
  'Phantom', 'Zero', 'Dark', 'Rogue', 'Chrome', 'Hyper', 'Velvet', 'Solar'
];

const ANIMALS = [
  'Fox', 'Wolf', 'Panther', 'Falcon', 'Viper', 'Lynx', 'Raven', 'Cobra',
  'Tiger', 'Hawk', 'Badger', 'Jaguar', 'Otter', 'Eagle', 'Cheetah', 'Jackal'
];

export function getPlayerName(uid: number): string {
  const adjIdx = (uid >> 12) & 0x0f;
  const animalIdx = (uid >> 8) & 0x0f;
  const suffix = (uid & 0xffff).toString(16).toUpperCase().padStart(4, '0');

  const adj = ADJECTIVES[adjIdx % ADJECTIVES.length];
  const animal = ANIMALS[animalIdx % ANIMALS.length];

  return `${adj} ${animal} ${suffix}`;
}
