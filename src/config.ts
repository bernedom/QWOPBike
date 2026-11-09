/**
 * Everything personal lives here. Edit before deploying!
 *
 * Note: this is a client-side game, so anyone who opens the browser dev tools
 * can find this text. The message is lightly encoded (base64) so it doesn't
 * show up in plain text when skimming the bundle — that's all.
 * Generate an encoded message with:  btoa(unescape(encodeURIComponent("...")))
 * or in a shell:                     printf '%s' "..." | base64 -w0
 */
export const CONFIG = {
  playerName: "Lars",
  /**
   * Seconds allowed to reach the finish. Slower finishes don't unlock the
   * present but tune the bike up. (A careful bot on a perfect bike takes ~32–42 s.)
   */
  timeLimit: 50,
  /** Shown on the title screen. */
  tagline: "Your birthday present is waiting at the finish line.",
  /** Title on the win screen. */
  revealTitle: "Happy Birthday!",
  /**
   * Shown on the win screen above the password (base64-encoded UTF-8):
   * "Geschafft! Schick mir dieses Passwort, dann bekommst du den Link zu deinem Preis:"
   */
  revealMessageB64: "R2VzY2hhZmZ0ISBTY2hpY2sgbWlyIGRpZXNlcyBQYXNzd29ydCwgZGFubiBiZWtvbW1zdCBkdSBkZW4gTGluayB6dSBkZWluZW0gUHJlaXM6",
  /** The password the player sends you to get the prize link (base64): "Gurkensalat" */
  passwordB64: "R3Vya2Vuc2FsYXQ=",
};

function decode(b64: string, field: string): string {
  try {
    return decodeURIComponent(escape(atob(b64)));
  } catch {
    return `(could not decode — check ${field} in src/config.ts)`;
  }
}

export const revealMessage = () => decode(CONFIG.revealMessageB64, "revealMessageB64");
export const revealPassword = () => decode(CONFIG.passwordB64, "passwordB64");
