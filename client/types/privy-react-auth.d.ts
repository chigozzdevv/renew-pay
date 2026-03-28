declare module "@privy-io/react-auth" {
  import type { ReactNode } from "react";

  export type PrivyLinkedAccount = {
    type?: string;
    address?: string;
  };

  export type PrivyWallet = {
    address: string;
    chainType?: "ethereum" | "solana";
    type?: "ethereum" | "solana";
    walletClientType?: string;
    walletIndex?: number;
  };

  export type PrivyUser = {
    id?: string;
    email?: {
      address?: string;
    } | null;
    wallet?: {
      address?: string;
    } | null;
    smartWallet?: {
      address?: string;
    } | null;
    linkedAccounts?: PrivyLinkedAccount[];
    linked_accounts?: PrivyLinkedAccount[];
  };

  export function PrivyProvider(props: {
    appId: string;
    children: ReactNode;
    config?: Record<string, unknown>;
  }): ReactNode;

  export function usePrivy(): {
    ready: boolean;
    authenticated: boolean;
    user: PrivyUser | null;
    login: () => Promise<void> | void;
    logout: () => Promise<void> | void;
  };

  export function useWallets(): {
    ready: boolean;
    wallets: PrivyWallet[];
  };

  export function useCreateWallet(): {
    createWallet: (options?: {
      walletIndex?: number;
      createAdditional?: boolean;
      signers?: unknown[];
    }) => Promise<PrivyWallet>;
  };

  export function getAccessToken(): Promise<string | null>;
  export function getIdentityToken(): Promise<string | null>;
}

declare module "@privy-io/react-auth/solana" {
  export type PrivySolanaWallet = {
    address: string;
    walletClientType?: string;
    chainType?: "solana";
    type?: "solana";
  };

  export function useWallets(): {
    ready: boolean;
    wallets: PrivySolanaWallet[];
  };

  export function useCreateWallet(): {
    createWallet: (options?: {
      walletIndex?: number;
      createAdditional?: boolean;
      signers?: unknown[];
    }) => Promise<{
      wallet: PrivySolanaWallet;
    }>;
  };

  export function toSolanaWalletConnectors(args?: Record<string, unknown>): unknown;

  export function useSignMessage(): {
    signMessage: (input: {
      message: Uint8Array;
      wallet: PrivySolanaWallet;
      options?: {
        uiOptions?: unknown;
      };
    }) => Promise<{
      signature: Uint8Array;
    }>;
  };
}
