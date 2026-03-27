import type { Abi } from "../types/abi.js";

export const renewVaultAbi = [
  {
    type: "function",
    name: "merchantBalances",
    inputs: [{ name: "merchant", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "protocolFeeBalance",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "creditMerchantBalance",
    inputs: [
      { name: "merchant", type: "address" },
      { name: "grossAmount", type: "uint256" },
      { name: "feeAmount", type: "uint256" },
    ],
    outputs: [{ name: "netAmount", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdrawMerchantBalance",
    inputs: [
      { name: "merchant", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdrawProtocolFees",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "MerchantBalanceCredited",
    inputs: [
      { name: "merchant", type: "address", indexed: true },
      { name: "grossAmount", type: "uint256" },
      { name: "feeAmount", type: "uint256" },
      { name: "netAmount", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "MerchantWithdrawal",
    inputs: [
      { name: "merchant", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "amount", type: "uint256" },
    ],
  },
] as const satisfies Abi;
