import assert from "node:assert/strict";
import test from "node:test";

test("Partna account creation sends the customer email from checkout", async (context) => {
  process.env.PARTNA_API_KEY_TEST = "test-api-key";
  process.env.PARTNA_API_USER_TEST = "test-api-user";
  process.env.PARTNA_V4_BASE_URL_TEST = "https://partna.test/v4";

  const { PartnaRemoteProvider } = await import(
    "../../../src/features/onramps/providers/partna/partna.remote"
  );
  let requestBody: Record<string, unknown> | null = null;

  context.mock.method(globalThis, "fetch", async (_url, init) => {
    requestBody = JSON.parse(init?.body as string) as Record<string, unknown>;

    return new Response(JSON.stringify({ data: {}, message: "success" }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  });

  const provider = new PartnaRemoteProvider("test");
  await provider.createAccount({
    accountName: "rn66f1f0e59b92c12f1f8a5e41",
    email: " Ada@Example.COM ",
  });

  assert.deepEqual(requestBody, {
    accountName: "rn66f1f0e59b92c12f1f8a5e41",
    email: "ada@example.com",
  });
});
