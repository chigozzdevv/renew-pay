import assert from "node:assert/strict";
import test from "node:test";

import { __test__ } from "@/features/settlement/providers/cctp/service";
import { HttpError } from "@/shared/errors/http-error";

const attestationConfig = {
  sourceDomain: 5,
  irisApiUrl: "https://iris.example",
  attestationMaxAttempts: 3,
  attestationPollIntervalMs: 25,
};

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

test("CCTP amount conversion rejects zero and negative amounts", () => {
  assert.throws(
    () => __test__.amountToSourceTokenUnits(0),
    (error) => error instanceof HttpError && error.statusCode === 400
  );
  assert.throws(
    () => __test__.amountToSourceTokenUnits(-1),
    (error) => error instanceof HttpError && error.statusCode === 400
  );
});

test("CCTP attestation polling retries before returning a completed message", async () => {
  const slept: number[] = [];
  const requestedUrls: string[] = [];
  let calls = 0;

  const attestation = await __test__.fetchCircleAttestationWithDeps({
    config: attestationConfig,
    sourceTxHash: "source_tx",
    fetcher: async (url) => {
      requestedUrls.push(String(url));
      calls += 1;

      if (calls === 1) {
        return new Response(null, { status: 404 });
      }

      return jsonResponse({
        messages: [
          {
            status: "complete",
            message: "0xmessage",
            attestation: "0xattestation",
          },
        ],
      });
    },
    sleep: async (durationMs) => {
      slept.push(durationMs);
    },
  });

  assert.equal(calls, 2);
  assert.equal(slept.length, 1);
  assert.equal(slept[0], attestationConfig.attestationPollIntervalMs);
  assert.equal(
    requestedUrls[0],
    "https://iris.example/v2/messages/5?transactionHash=source_tx"
  );
  assert.deepEqual(attestation, {
    message: "0xmessage",
    attestation: "0xattestation",
  });
});

test("CCTP attestation polling returns null when no attempt completes", async () => {
  const slept: number[] = [];
  let calls = 0;

  const attestation = await __test__.fetchCircleAttestationWithDeps({
    config: attestationConfig,
    sourceTxHash: "source_tx",
    fetcher: async () => {
      calls += 1;
      return jsonResponse({ messages: [{ status: "pending" }] });
    },
    sleep: async (durationMs) => {
      slept.push(durationMs);
    },
  });

  assert.equal(calls, attestationConfig.attestationMaxAttempts);
  assert.equal(slept.length, attestationConfig.attestationMaxAttempts);
  assert.equal(attestation, null);
});

test("CCTP attestation polling throws on Circle API errors", async () => {
  await assert.rejects(
    () =>
      __test__.fetchCircleAttestationWithDeps({
        config: attestationConfig,
        sourceTxHash: "source_tx",
        fetcher: async () => new Response(null, { status: 500 }),
        sleep: async () => undefined,
      }),
    (error) =>
      error instanceof HttpError &&
      error.statusCode === 502 &&
      error.message.includes("status 500")
  );
});
