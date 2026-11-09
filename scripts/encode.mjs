// Encodes a text for src/config.ts so it isn't readable in the page source.
// Usage: node scripts/encode.mjs "some text"
// Keep in sync with src/secret.ts.
const KEY = new TextEncoder().encode("QWOP-Bike/rider");
const text = process.argv[2];
if (!text) {
  console.error('usage: node scripts/encode.mjs "text"');
  process.exit(1);
}
const bytes = new TextEncoder().encode(text);
const out = bytes.map((b, i) => b ^ KEY[i % KEY.length] ^ ((i * 73 + 41) & 255));
console.log(Buffer.from(out).toString("hex"));
