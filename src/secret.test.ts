import { describe, expect, it } from "vitest";
import { revealMessage, revealPassword } from "./config";

// Deliberately doesn't spell out the password: the tests live in the repo too.
describe("secret", () => {
  it("decodes the configured texts", () => {
    expect(revealPassword()).toMatch(/^[A-Z][a-z]+$/);
    expect(revealMessage()).toContain("Passwort");
  });
});
