import {
  accounts as squadsAccounts,
  getMultisigPda,
  getVaultPda,
  instructions as squadsInstructions,
  types as squadsTypes,
} from "@sqds/multisig";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

import { getProtocolRuntimeConfig } from "@/config/protocol.config";
import { getSquadsConfig } from "@/config/squads.config";
import { sendSponsoredTransaction } from "@/features/solana/renew-program.service";
import { getSolanaAdminKeypair } from "@/features/solana/solana-keypair.service";
import type { RuntimeMode } from "@/shared/constants/runtime-mode";
import { HttpError } from "@/shared/errors/http-error";

type GovernanceSnapshot = {
  governanceMultisigAddress: string;
  governanceVaultAddress: string;
  governanceVaultIndex: number;
  ownerAddresses: string[];
  threshold: number;
};

function getConnection(mode: RuntimeMode) {
  const config = getProtocolRuntimeConfig(mode);
  return new Connection(config.rpcUrl, "confirmed");
}

function toPublicKey(value: string, label: string) {
  try {
    return new PublicKey(value);
  } catch {
    throw new HttpError(400, `${label} must be a valid Solana address.`);
  }
}

function votePermissions() {
  return squadsTypes.Permissions.fromPermissions([squadsTypes.Permission.Vote]);
}

function servicePermissions() {
  return squadsTypes.Permissions.fromPermissions([
    squadsTypes.Permission.Initiate,
    squadsTypes.Permission.Execute,
  ]);
}

function deriveVaultAddresses(multisigAddress: PublicKey) {
  const vaultIndex = getSquadsConfig().defaultVaultIndex;
  const governanceVaultAddress = getVaultPda({
    multisigPda: multisigAddress,
    index: vaultIndex,
  })[0];

  return {
    governanceVaultIndex: vaultIndex,
    governanceVaultAddress,
  };
}

function mapVoteMembers(multisig: Awaited<
  ReturnType<typeof squadsAccounts.Multisig.fromAccountAddress>
>) {
  return multisig.members
    .filter((entry) =>
      squadsTypes.Permissions.has(entry.permissions, squadsTypes.Permission.Vote)
    )
    .map((entry) => entry.key.toBase58());
}

export async function loadSquadsGovernanceSnapshot(input: {
  environment: RuntimeMode;
  governanceMultisigAddress: string;
}): Promise<GovernanceSnapshot> {
  const connection = getConnection(input.environment);
  const multisigAddress = toPublicKey(
    input.governanceMultisigAddress,
    "Governance multisig address"
  );
  const multisig = await squadsAccounts.Multisig.fromAccountAddress(
    connection,
    multisigAddress
  );
  const { governanceVaultAddress, governanceVaultIndex } =
    deriveVaultAddresses(multisigAddress);

  return {
    governanceMultisigAddress: multisigAddress.toBase58(),
    governanceVaultAddress: governanceVaultAddress.toBase58(),
    governanceVaultIndex,
    ownerAddresses: mapVoteMembers(multisig),
    threshold: multisig.threshold,
  };
}

export async function createSquadsGovernanceVault(input: {
  environment: RuntimeMode;
  ownerAddresses: string[];
  threshold: number;
}) {
  const admin = getSolanaAdminKeypair(input.environment);
  const createKey = Keypair.generate();
  const multisigAddress = getMultisigPda({
    createKey: createKey.publicKey,
  })[0];
  const { governanceVaultAddress, governanceVaultIndex } =
    deriveVaultAddresses(multisigAddress);
  const members = [
    {
      key: admin.publicKey,
      permissions: servicePermissions(),
    },
    ...input.ownerAddresses.map((entry) => ({
      key: toPublicKey(entry, "Owner address"),
      permissions: votePermissions(),
    })),
  ];

  const instruction = squadsInstructions.multisigCreateV2({
    treasury: governanceVaultAddress,
    creator: admin.publicKey,
    multisigPda: multisigAddress,
    configAuthority: admin.publicKey,
    threshold: input.threshold,
    members,
    timeLock: 0,
    createKey: createKey.publicKey,
    rentCollector: null,
    memo: "renew:governance-bootstrap",
  });

  const execution = await sendSponsoredTransaction({
    mode: input.environment,
    authority: admin,
    instructions: [instruction],
    signers: [createKey],
  });

  return {
    ...(await loadSquadsGovernanceSnapshot({
      environment: input.environment,
      governanceMultisigAddress: multisigAddress.toBase58(),
    })),
    txHash: execution.signature,
    governanceVaultIndex,
  };
}

export async function addSquadsGovernanceMember(input: {
  environment: RuntimeMode;
  governanceMultisigAddress: string;
  ownerAddress: string;
}) {
  const admin = getSolanaAdminKeypair(input.environment);
  const instruction = squadsInstructions.multisigAddMember({
    multisigPda: toPublicKey(
      input.governanceMultisigAddress,
      "Governance multisig address"
    ),
    configAuthority: admin.publicKey,
    rentPayer: admin.publicKey,
    newMember: {
      key: toPublicKey(input.ownerAddress, "Owner address"),
      permissions: votePermissions(),
    },
    memo: "renew:governance-add-owner",
  });

  const execution = await sendSponsoredTransaction({
    mode: input.environment,
    authority: admin,
    instructions: [instruction],
  });

  return {
    ...(await loadSquadsGovernanceSnapshot({
      environment: input.environment,
      governanceMultisigAddress: input.governanceMultisigAddress,
    })),
    txHash: execution.signature,
  };
}

export async function removeSquadsGovernanceMember(input: {
  environment: RuntimeMode;
  governanceMultisigAddress: string;
  ownerAddress: string;
}) {
  const admin = getSolanaAdminKeypair(input.environment);
  const instruction = squadsInstructions.multisigRemoveMember({
    multisigPda: toPublicKey(
      input.governanceMultisigAddress,
      "Governance multisig address"
    ),
    configAuthority: admin.publicKey,
    oldMember: toPublicKey(input.ownerAddress, "Owner address"),
    memo: "renew:governance-remove-owner",
  });

  const execution = await sendSponsoredTransaction({
    mode: input.environment,
    authority: admin,
    instructions: [instruction],
  });

  return {
    ...(await loadSquadsGovernanceSnapshot({
      environment: input.environment,
      governanceMultisigAddress: input.governanceMultisigAddress,
    })),
    txHash: execution.signature,
  };
}

export async function changeSquadsGovernanceThreshold(input: {
  environment: RuntimeMode;
  governanceMultisigAddress: string;
  threshold: number;
}) {
  const admin = getSolanaAdminKeypair(input.environment);
  const instruction = squadsInstructions.multisigChangeThreshold({
    multisigPda: toPublicKey(
      input.governanceMultisigAddress,
      "Governance multisig address"
    ),
    configAuthority: admin.publicKey,
    rentPayer: admin.publicKey,
    newThreshold: input.threshold,
    memo: "renew:governance-threshold",
  });

  const execution = await sendSponsoredTransaction({
    mode: input.environment,
    authority: admin,
    instructions: [instruction],
  });

  return {
    ...(await loadSquadsGovernanceSnapshot({
      environment: input.environment,
      governanceMultisigAddress: input.governanceMultisigAddress,
    })),
    txHash: execution.signature,
  };
}
