import assert from "node:assert/strict";
import test from "node:test";

import { Keypair } from "@stellar/stellar-sdk";

import { getStellarSettlementConfig } from "@/features/settlement/providers/stellar/config";
import {
  assertStellarUsdcTrustline,
  checkStellarUsdcTrustline,
} from "@/features/settlement/providers/stellar/trustline.service";
import { HttpError } from "@/shared/errors/http-error";

function accountResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

test("trustline check reports unfunded Stellar accounts", async (context) => {
  const address = Keypair.random().publicKey();

  context.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 404 })
  );

  const status = await checkStellarUsdcTrustline({
    environment: "test",
    address,
  });

  assert.equal(status.address, address);
  assert.equal(status.funded, false);
  assert.equal(status.trusted, false);
  assert.equal(status.balance, null);
});

test("trustline check detects Stellar USDC trustline", async (context) => {
  const address = Keypair.random().publicKey();
  const config = getStellarSettlementConfig("test");

  context.mock.method(
    globalThis,
    "fetch",
    async () =>
      accountResponse({
        balances: [
          { asset_type: "native", balance: "5.0000000" },
          {
            asset_type: "credit_alphanum4",
            asset_code: config.usdcAssetCode,
            asset_issuer: config.usdcAssetIssuer,
            balance: "10.0000000",
            limit: "1000000.0000000",
            is_authorized: true,
          },
        ],
      })
  );

  const status = await checkStellarUsdcTrustline({
    environment: "test",
    address,
  });

  assert.equal(status.funded, true);
  assert.equal(status.trusted, true);
  assert.equal(status.balance, "10.0000000");
  assert.equal(status.limit, "1000000.0000000");
});

test("trustline assertion blocks funded accounts without USDC trustline", async (context) => {
  const address = Keypair.random().publicKey();

  context.mock.method(
    globalThis,
    "fetch",
    async () =>
      accountResponse({
        balances: [{ asset_type: "native", balance: "5.0000000" }],
      })
  );

  await assert.rejects(
    () =>
      assertStellarUsdcTrustline({
        environment: "test",
        address,
      }),
    (error) =>
      error instanceof HttpError &&
      error.statusCode === 409 &&
      error.message.includes("must trust Stellar USDC")
  );
});
