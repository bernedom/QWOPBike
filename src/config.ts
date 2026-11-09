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
  /** Shown on the title screen. */
  tagline: "Your birthday present is waiting at the finish line.",
  /** Title on the win screen. */
  revealTitle: "Happy Birthday!",
  /** base64-encoded UTF-8 text. Decodes to a placeholder — replace it. */
  revealMessageB64:
    "WW91ciBwcmVzZW50IGlzIGhpZGRlbiBiZWhpbmQgdGhlIGJvb2tzaGVsZi4gKFJlcGxhY2UgdGhpcyB0ZXh0IGluIHNyYy9jb25maWcudHMp",
};

export function revealMessage(): string {
  try {
    return decodeURIComponent(escape(atob(CONFIG.revealMessageB64)));
  } catch {
    return "(could not decode the message — check revealMessageB64 in src/config.ts)";
  }
}
