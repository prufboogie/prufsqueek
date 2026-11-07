import { beforeEach, describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { issueNonce, verifyWallet } from "@/server/auth";
import { db } from "@/server/db";
import { signInMessage } from "@/shared/auth-message";
import { resetDb } from "./helpers";

beforeEach(resetDb);

describe("wallet sign-in", () => {
  it("accepts a valid signature once, and makes one player per wallet", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const nonce = await issueNonce();
    const signature = await account.signMessage({ message: signInMessage(account.address, nonce, "localhost:3500") });
    const id = await verifyWallet({ address: account.address, signature, nonce }, "localhost:3500");
    await expect(verifyWallet({ address: account.address, signature, nonce }, "localhost:3500")).rejects.toMatchObject({ code: "bad_nonce" });
    const nonce2 = await issueNonce();
    const sig2 = await account.signMessage({ message: signInMessage(account.address, nonce2, "localhost:3500") });
    expect(await verifyWallet({ address: account.address, signature: sig2, nonce: nonce2 }, "localhost:3500")).toBe(id);
    expect(await db.user.count()).toBe(1);
  });

  it("rejects a signature from another wallet or for another site", async () => {
    const [a, b] = [privateKeyToAccount(generatePrivateKey()), privateKeyToAccount(generatePrivateKey())];
    const nonce = await issueNonce();
    const sig = await b.signMessage({ message: signInMessage(a.address, nonce, "localhost:3500") });
    await expect(verifyWallet({ address: a.address, signature: sig, nonce }, "localhost:3500")).rejects.toMatchObject({ code: "bad_signature" });
    const nonce2 = await issueNonce();
    const phish = await a.signMessage({ message: signInMessage(a.address, nonce2, "evil.example") });
    await expect(verifyWallet({ address: a.address, signature: phish, nonce: nonce2 }, "localhost:3500")).rejects.toMatchObject({ code: "bad_signature" });
  });
});
