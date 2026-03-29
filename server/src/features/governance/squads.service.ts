import {
  accounts as squadsAccounts,
  getProgramConfigPda,
  getMultisigPda,
  getVaultPda,
  instructions as squadsInstructions,
  rpc as squadsRpc,
  types as squadsTypes,
} from "@sqds/multisig";
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  type TransactionInstruction,
} from "@solana/web3.js";

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

type OperatorSnapshot = {
  operatorMultisigAddress: string;
  operatorVaultAddress: string;
  operatorVaultIndex: number;
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

function operatorPermissions() {
  return squadsTypes.Permissions.all();
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

async function confirmSignature(connection: Connection, signature: string) {
  await connection.confirmTransaction(signature, "confirmed");
}

async function getSquadsProgramTreasury(connection: Connection) {
  const programConfigAddress = getProgramConfigPda({})[0];
  const programConfig = await squadsAccounts.ProgramConfig.fromAccountAddress(
    connection,
    programConfigAddress
  );

  return programConfig.treasury;
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
  const connection = getConnection(input.environment);
  const admin = getSolanaAdminKeypair(input.environment);
  const createKey = Keypair.generate();
  const multisigAddress = getMultisigPda({
    createKey: createKey.publicKey,
  })[0];
  const squadsTreasury = await getSquadsProgramTreasury(connection);
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
    treasury: squadsTreasury,
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

export async function createSquadsOperatorVault(input: {
  environment: RuntimeMode;
}): Promise<OperatorSnapshot & { txHash: string }> {
  const connection = getConnection(input.environment);
  const admin = getSolanaAdminKeypair(input.environment);
  const createKey = Keypair.generate();
  const multisigAddress = getMultisigPda({
    createKey: createKey.publicKey,
  })[0];
  const squadsTreasury = await getSquadsProgramTreasury(connection);
  const { governanceVaultAddress, governanceVaultIndex } =
    deriveVaultAddresses(multisigAddress);

  const txHash = await squadsRpc.multisigCreateV2({
    connection,
    treasury: squadsTreasury,
    createKey,
    creator: admin,
    multisigPda: multisigAddress,
    configAuthority: admin.publicKey,
    threshold: 1,
    members: [
      {
        key: admin.publicKey,
        permissions: operatorPermissions(),
      },
    ],
    timeLock: 0,
    rentCollector: null,
    memo: "renew:merchant-operator-bootstrap",
  });

  await confirmSignature(connection, txHash);

  return {
    operatorMultisigAddress: multisigAddress.toBase58(),
    operatorVaultAddress: governanceVaultAddress.toBase58(),
    operatorVaultIndex: governanceVaultIndex,
    txHash,
  };
}

export async function executeSquadsVaultInstructions(input: {
  environment: RuntimeMode;
  multisigAddress: string;
  vaultIndex: number;
  instructions: TransactionInstruction[];
}) {
  const connection = getConnection(input.environment);
  const admin = getSolanaAdminKeypair(input.environment);
  const multisigPda = toPublicKey(input.multisigAddress, "Squads multisig address");
  const multisig = await squadsAccounts.Multisig.fromAccountAddress(
    connection,
    multisigPda
  );
  const transactionIndex = BigInt(multisig.transactionIndex.toString()) + 1n;
  const vaultPda = getVaultPda({
    multisigPda,
    index: input.vaultIndex,
  })[0];
  const latestBlockhash = await connection.getLatestBlockhash("confirmed");
  const transactionMessage = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: input.instructions,
  });

  const createTxHash = await squadsRpc.vaultTransactionCreate({
    connection,
    feePayer: admin,
    multisigPda,
    transactionIndex,
    creator: admin.publicKey,
    vaultIndex: input.vaultIndex,
    ephemeralSigners: 0,
    transactionMessage,
  });
  await confirmSignature(connection, createTxHash);

  const proposalTxHash = await squadsRpc.proposalCreate({
    connection,
    feePayer: admin,
    creator: admin,
    multisigPda,
    transactionIndex,
  });
  await confirmSignature(connection, proposalTxHash);

  const approveTxHash = await squadsRpc.proposalApprove({
    connection,
    feePayer: admin,
    member: admin,
    multisigPda,
    transactionIndex,
    memo: "renew:merchant-operator-approve",
  });
  await confirmSignature(connection, approveTxHash);

  const executeTxHash = await squadsRpc.vaultTransactionExecute({
    connection,
    feePayer: admin,
    multisigPda,
    transactionIndex,
    member: admin.publicKey,
  });
  await confirmSignature(connection, executeTxHash);

  return {
    signature: executeTxHash,
    transactionIndex: transactionIndex.toString(),
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
