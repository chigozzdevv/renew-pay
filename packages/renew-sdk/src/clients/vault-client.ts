import { renewVaultAbi } from "../abi/renew-vault.js";
import type { ContractTransport } from "./contract-transport.js";
import type { Address } from "../types/protocol.js";

export type RenewVaultClient = ReturnType<typeof createRenewVaultClient>;

export function createRenewVaultClient(
  transport: ContractTransport,
  address: Address
) {
  return {
    address,
    getMerchantBalance(merchant: Address) {
      return transport.read<bigint>({
        address,
        abi: renewVaultAbi,
        functionName: "merchantBalances",
        args: [merchant],
      });
    },
    getProtocolFeeBalance() {
      return transport.read<bigint>({
        address,
        abi: renewVaultAbi,
        functionName: "protocolFeeBalance",
      });
    },
    creditMerchantBalance(merchant: Address, grossAmount: bigint, feeAmount: bigint) {
      return transport.write<bigint>({
        address,
        abi: renewVaultAbi,
        functionName: "creditMerchantBalance",
        args: [merchant, grossAmount, feeAmount],
      });
    },
    withdrawMerchantBalance(merchant: Address, to: Address, amount: bigint) {
      return transport.write<void>({
        address,
        abi: renewVaultAbi,
        functionName: "withdrawMerchantBalance",
        args: [merchant, to, amount],
      });
    },
    withdrawProtocolFees(to: Address, amount: bigint) {
      return transport.write<void>({
        address,
        abi: renewVaultAbi,
        functionName: "withdrawProtocolFees",
        args: [to, amount],
      });
    },
  };
}
