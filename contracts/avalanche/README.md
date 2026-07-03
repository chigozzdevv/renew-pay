# Renew Avalanche Settlement Vault

`renew_vault.sol` escrows bridged USDC on Avalanche until a payout is due.

Constructor arguments:

1. `admin` - account that can pause the vault and rotate the operator.
2. `operator` - Renew settlement signer used by the server.
3. `usdc` - Circle native USDC contract on Avalanche.

The server flow is:

1. CCTP burns source-chain USDC with the Avalanche operator as the mint recipient.
2. The operator calls Circle `receiveMessage` on Avalanche.
3. The operator approves this vault for the payout amount.
4. The operator calls `deposit`.
5. After `releaseAt`, the operator calls `release`.
