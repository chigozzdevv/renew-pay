export type AbiStateMutability = "view" | "pure" | "nonpayable" | "payable";

export type AbiParameter = {
  readonly name: string;
  readonly type: string;
  readonly indexed?: boolean;
};

export type AbiFunctionFragment = {
  readonly type: "function";
  readonly name: string;
  readonly inputs: readonly AbiParameter[];
  readonly outputs?: readonly AbiParameter[];
  readonly stateMutability: AbiStateMutability;
};

export type AbiEventFragment = {
  readonly type: "event";
  readonly name: string;
  readonly inputs: readonly AbiParameter[];
  readonly anonymous?: boolean;
};

export type AbiErrorFragment = {
  readonly type: "error";
  readonly name: string;
  readonly inputs?: readonly AbiParameter[];
};

export type AbiFragment =
  | AbiFunctionFragment
  | AbiEventFragment
  | AbiErrorFragment;

export type Abi = readonly AbiFragment[];
