/**
 * Light obfuscation for the texts in config.ts, so the password can't just be
 * read off the page source (or decoded with a quick `atob`). Anyone determined
 * enough to step through the JavaScript can still recover it: it's a birthday
 * surprise, not a bank vault.
 *
 * Encode new texts with:  node scripts/encode.mjs "your text"
 */
const KEY = new TextEncoder().encode("QWOP-Bike/rider");

export function decodeSecret(hex: string): string {
  const pairs = hex.match(/../g) ?? [];
  const bytes = Uint8Array.from(pairs, (h, i) => parseInt(h, 16) ^ KEY[i % KEY.length] ^ ((i * 73 + 41) & 255));
  return new TextDecoder().decode(bytes);
}
