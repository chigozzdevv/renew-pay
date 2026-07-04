import assert from "node:assert/strict";
import test from "node:test";

import { __test__ } from "../../../src/features/payments/payment.service";
import { HttpError } from "../../../src/shared/errors/http-error";

test("sandbox bank details are deterministic for a payment", () => {
  const first = __test__.buildPartnaSandboxBankAccount({
    paymentId: "66f1f0e59b92c12f1f8a5e41",
    customerName: "Ada Okafor",
  });
  const second = __test__.buildPartnaSandboxBankAccount({
    paymentId: "66f1f0e59b92c12f1f8a5e41",
    customerName: "Ada Okafor",
  });

  assert.deepEqual(first, second);
  assert.equal(first.bankName, "Partna Sandbox Bank");
  assert.match(first.accountNumber, /^\d{10}$/);
  assert.equal(first.accountName, "Renew / Ada Okafor");
});

test("Partna sandbox bank detail errors are narrowly recognized", () => {
  assert.equal(
    __test__.isPartnaSandboxBankDetailsError(
      new HttpError(400, "cannot get bank account details")
    ),
    true
  );
  assert.equal(
    __test__.isPartnaSandboxBankDetailsError(new HttpError(400, "validation error")),
    false
  );
});
