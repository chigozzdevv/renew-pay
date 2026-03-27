import test from "node:test";
import assert from "node:assert/strict";

import {
  getRenewApiOrigin,
  inferRenewEnvironmentFromApiOrigin,
  inferRenewEnvironmentFromSecretKey,
  validateRenewApiEnvironment,
} from "../dist/core/index.js";

test("resolves known Renew API origins", () => {
  assert.equal(getRenewApiOrigin("sandbox"), "https://sandbox.renew.sh");
  assert.equal(getRenewApiOrigin("live"), "https://api.renew.sh");
});

test("infers environment from secret key prefix", () => {
  assert.equal(inferRenewEnvironmentFromSecretKey("rw_test_123"), "sandbox");
  assert.equal(inferRenewEnvironmentFromSecretKey("rw_live_123"), "live");
});

test("infers environment from known API origins", () => {
  assert.equal(
    inferRenewEnvironmentFromApiOrigin("https://sandbox.renew.sh/v1"),
    "sandbox"
  );
  assert.equal(
    inferRenewEnvironmentFromApiOrigin("https://api.renew.sh/v1"),
    "live"
  );
});

test("rejects mismatched API origin and environment", () => {
  assert.throws(
    () =>
      validateRenewApiEnvironment({
        apiOrigin: "https://api.renew.sh",
        environment: "sandbox",
      }),
    /does not match sandbox mode/
  );
});
