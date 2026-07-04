import assert from "node:assert/strict";
import { test } from "node:test";

import {
  __test__,
  buildPartnaCustomerAccountName,
} from "../../../src/features/onramps/partna.service";
import { HttpError } from "../../../src/shared/errors/http-error";

test("Partna customer account names use the documented hex shape", () => {
  const accountName = buildPartnaCustomerAccountName({
    customerRef: "Ada Okafor",
    _id: { toString: () => "66f1f0e59b92c12f1f8a5e41" },
  });

  assert.equal(accountName, "66f1f0e59b92c12f1f8a5e41");
  assert.match(accountName, /^[a-f0-9]{2,40}$/);
});

test("Partna onramp webhooks can match documented transaction references", () => {
  const rampReference = __test__.extractPartnaRampReference({
    event: "Onramp",
    data: {
      transactionReference: "6a2bdec128ac31aab3fb2cbc",
      status: "completed",
    },
  });

  assert.equal(rampReference, "6a2bdec128ac31aab3fb2cbc");
});

test("Partna sandbox mock deposits are treated as successful payment signals", () => {
  assert.equal(
    __test__.partnaMockFiatDepositSucceeded({
      message: "mock deposit request successful",
    }),
    true
  );

  assert.equal(
    __test__.partnaMockFiatDepositSucceeded({
      status: "pending",
      message: "queued",
    }),
    false
  );
});

test("Partna missing address errors are treated as sandbox recovery candidates", () => {
  assert.equal(
    __test__.isPartnaMissingAddressDetailsError(
      new HttpError(400, "user has not supplied address details")
    ),
    true
  );

  assert.equal(
    __test__.isPartnaMissingAddressDetailsError(
      new HttpError(400, "user has not completed kyc")
    ),
    false
  );
});

test("Partna sandbox wrong verification method can recover after OTP dispatch", () => {
  assert.equal(
    __test__.canRecoverPartnaSandboxOtpConfirmation({
      environment: "test",
      otp: "123456",
      existingRaw: {
        kycStatus: "otp_pending",
        otpDispatchMessage: "OTP sent successfully",
        sandboxOtp: "123456",
      },
      error: new HttpError(400, "Wrong verification method. Update method and try again."),
    }),
    true
  );

  assert.equal(
    __test__.canRecoverPartnaSandboxOtpConfirmation({
      environment: "live",
      otp: "123456",
      existingRaw: {
        kycStatus: "otp_pending",
        otpDispatchMessage: "OTP sent successfully",
        sandboxOtp: "123456",
      },
      error: new HttpError(400, "Wrong verification method. Update method and try again."),
    }),
    false
  );

  assert.equal(
    __test__.canRecoverPartnaSandboxOtpConfirmation({
      environment: "test",
      otp: "000000",
      existingRaw: {
        kycStatus: "otp_pending",
        otpDispatchMessage: "OTP sent successfully",
        sandboxOtp: "123456",
      },
      error: new HttpError(400, "Wrong verification method. Update method and try again."),
    }),
    false
  );
});
