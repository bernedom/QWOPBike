import { decodeSecret } from "./secret";

/**
 * Everything personal lives here. Edit before deploying!
 *
 * The win-screen message and password are obfuscated (see src/secret.ts) so
 * they can't be read off the page source. Encode new ones with:
 *   node scripts/encode.mjs "your text"
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
  /** Shown on the win screen above the password. Encode with: node scripts/encode.mjs "..." */
  revealMessage: "3f40873708b5d02560b4517692d33c42856d76d0ed6f60b44b4b9fcb604c872475b5991470f1ba0382dd2929a5ca7bb0e4625aa9b647d58a2c6bb8ae58b0f61b648ae70f8c9c046fb0f2118df0345eee81",
  /** The password the player sends you to get the prize link. Encode with: node scripts/encode.mjs "..." */
  password: "3f50863f05bac52278f405",
};

export const revealMessage = () => decodeSecret(CONFIG.revealMessage);
export const revealPassword = () => decodeSecret(CONFIG.password);
