#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS_DIR="$ROOT_DIR/contracts"
SERVER_ENV_FILE="$ROOT_DIR/server/.env"

export PATH="$HOME/.foundry/bin:$PATH"

if [[ -f "$SERVER_ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$SERVER_ENV_FILE"
  set +a
fi

RPC_URL="${AVALANCHE_RPC_URL_TEST:-https://api.avax-test.network/ext/bc/C/rpc}"
TX_SERVICE_URL="${SAFE_TX_SERVICE_URL_TEST:-https://safe-transaction-avalanche-testnet.safe.global}"
DEPLOYER_PRIVATE_KEY="${DEPLOYER_PRIVATE_KEY_TEST:-${SAFE_EXECUTOR_PRIVATE_KEY_TEST:-}}"
PROTOCOL_FEE_BPS="${PROTOCOL_FEE_BPS_TEST:-500}"
CHARGE_OPERATOR_PRIVATE_KEY="${SAFE_EXECUTOR_PRIVATE_KEY_TEST:-$DEPLOYER_PRIVATE_KEY}"
SOURCE_LIQUIDITY_PRIVATE_KEY="${CCTP_SOURCE_PRIVATE_KEY_TEST:-$CHARGE_OPERATOR_PRIVATE_KEY}"
DEFAULT_FUJI_USDC_ADDRESS="0x5425890298aed601595a70AB815c96711a31Bc65"
DEFAULT_SEPOLIA_RPC_URL="https://ethereum-sepolia-rpc.publicnode.com"
DEFAULT_SEPOLIA_USDC_ADDRESS="0x1c7d4b196cb0c7b01d743fbc6116a902379c7238"
DEFAULT_CCTP_TOKEN_MESSENGER_ADDRESS="0x9f3B8679d8d7a735A6fA14618F2Fa3012fD52d2C"
DEFAULT_CCTP_MESSAGE_TRANSMITTER_ADDRESS="0xa9fb1b3009dcb79e2fe346c16a604b8fa8ae0a79"
DEFAULT_CCTP_ATTESTATION_API_URL="https://iris-api-sandbox.circle.com"

if [[ -z "$DEPLOYER_PRIVATE_KEY" ]]; then
  echo "Missing DEPLOYER_PRIVATE_KEY_TEST or SAFE_EXECUTOR_PRIVATE_KEY_TEST." >&2
  exit 1
fi

if [[ ! -f "$SERVER_ENV_FILE" ]]; then
  echo "Missing server env file at $SERVER_ENV_FILE." >&2
  exit 1
fi

upsert_env() {
  local key="$1"
  local value="$2"

  if grep -q "^${key}=" "$SERVER_ENV_FILE"; then
    perl -0pi -e "s#^${key}=.*#${key}=${value}#m" "$SERVER_ENV_FILE"
  else
    printf '\n%s=%s\n' "$key" "$value" >>"$SERVER_ENV_FILE"
  fi
}

is_unset_address() {
  local value="${1:-}"
  [[ -z "$value" || "$value" == "0x0000000000000000000000000000000000000000" ]]
}

to_lower() {
  printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]'
}

deploy_contract() {
  local contract_name="$1"
  shift

  local attempt=1
  local output
  local address

  while [[ "$attempt" -le 3 ]]; do
    output="$(
      forge create \
        --broadcast \
        --rpc-url "$RPC_URL" \
        --private-key "$DEPLOYER_PRIVATE_KEY" \
        "$contract_name" \
        "$@" 2>&1
    )"

    printf '%s\n' "$output" >&2

    address="$(printf '%s\n' "$output" | awk '/Deployed to:/ {print $3}' | tail -n 1)"
    if [[ -n "$address" ]]; then
      printf '%s\n' "$address"
      return 0
    fi

    if [[ "$output" != *"timed out"* && "$output" != *"timeout"* ]]; then
      break
    fi

    attempt=$((attempt + 1))
    sleep 2
  done

  echo "Failed to deploy $contract_name." >&2
  exit 1
}

DEPLOYER_ADDRESS="$(cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY")"
CHARGE_OPERATOR_ADDRESS="$(cast wallet address --private-key "$CHARGE_OPERATOR_PRIVATE_KEY")"
FEE_COLLECTOR_ADDRESS="${FEE_COLLECTOR_ADDRESS_TEST:-$DEPLOYER_ADDRESS}"
DEPLOYER_BALANCE="$(cast balance "$DEPLOYER_ADDRESS" --rpc-url "$RPC_URL")"

if [[ "$DEPLOYER_BALANCE" == "0" ]]; then
  cat <<EOF >&2
Fuji deployer has no AVAX.
Fund this address, then rerun:
$DEPLOYER_ADDRESS
EOF
  exit 1
fi

upsert_env "PAYMENT_ENV" "test"
upsert_env "AVALANCHE_ENV" "test"
upsert_env "AVALANCHE_RPC_URL_TEST" "$RPC_URL"
upsert_env "SAFE_TX_SERVICE_URL_TEST" "$TX_SERVICE_URL"
upsert_env "DEPLOYER_PRIVATE_KEY_TEST" "$DEPLOYER_PRIVATE_KEY"
upsert_env "SAFE_EXECUTOR_PRIVATE_KEY_TEST" "$CHARGE_OPERATOR_PRIVATE_KEY"
upsert_env "CCTP_SOURCE_CHAIN_ID_TEST" "${CCTP_SOURCE_CHAIN_ID_TEST:-11155111}"
upsert_env "CCTP_SOURCE_RPC_URL_TEST" "${CCTP_SOURCE_RPC_URL_TEST:-$DEFAULT_SEPOLIA_RPC_URL}"
upsert_env "CCTP_SOURCE_PRIVATE_KEY_TEST" "$SOURCE_LIQUIDITY_PRIVATE_KEY"
upsert_env "CCTP_SOURCE_DOMAIN_TEST" "${CCTP_SOURCE_DOMAIN_TEST:-0}"
upsert_env "CCTP_DEST_DOMAIN_TEST" "${CCTP_DEST_DOMAIN_TEST:-1}"
upsert_env "CCTP_SOURCE_USDC_ADDRESS_TEST" "${CCTP_SOURCE_USDC_ADDRESS_TEST:-$DEFAULT_SEPOLIA_USDC_ADDRESS}"
upsert_env "CCTP_TOKEN_MESSENGER_ADDRESS_TEST" "${CCTP_TOKEN_MESSENGER_ADDRESS_TEST:-$DEFAULT_CCTP_TOKEN_MESSENGER_ADDRESS}"
upsert_env "CCTP_MESSAGE_TRANSMITTER_ADDRESS_TEST" "${CCTP_MESSAGE_TRANSMITTER_ADDRESS_TEST:-$DEFAULT_CCTP_MESSAGE_TRANSMITTER_ADDRESS}"
upsert_env "CCTP_ATTESTATION_API_URL_TEST" "${CCTP_ATTESTATION_API_URL_TEST:-$DEFAULT_CCTP_ATTESTATION_API_URL}"

cd "$CONTRACTS_DIR"
forge build >/dev/null 2>&1

USDC_ADDRESS="$DEFAULT_FUJI_USDC_ADDRESS"
upsert_env "USDC_TOKEN_ADDRESS_TEST" "$USDC_ADDRESS"
echo "Using Circle test USDC on Fuji at $USDC_ADDRESS"

VAULT_ADDRESS="${RENEW_VAULT_ADDRESS_TEST:-}"
PROTOCOL_ADDRESS="${RENEW_PROTOCOL_ADDRESS_TEST:-}"

if ! is_unset_address "$VAULT_ADDRESS"; then
  DEPLOYED_VAULT_ASSET="$(cast call "$VAULT_ADDRESS" "settlementAsset()(address)" --rpc-url "$RPC_URL" 2>/dev/null || true)"
  if [[ "$(to_lower "$DEPLOYED_VAULT_ASSET")" != "$(to_lower "$USDC_ADDRESS")" ]]; then
    echo "Existing RenewVault uses $DEPLOYED_VAULT_ASSET. Redeploying for Circle Fuji USDC." >&2
    VAULT_ADDRESS=""
    PROTOCOL_ADDRESS=""
    upsert_env "RENEW_VAULT_ADDRESS_TEST" "0x0000000000000000000000000000000000000000"
    upsert_env "RENEW_PROTOCOL_ADDRESS_TEST" "0x0000000000000000000000000000000000000000"
  fi
fi

if is_unset_address "$VAULT_ADDRESS"; then
  echo "Deploying RenewVault to Fuji..."
  VAULT_ADDRESS="$(deploy_contract src/RenewVault.sol:RenewVault --constructor-args "$USDC_ADDRESS" "$DEPLOYER_ADDRESS")"
  upsert_env "RENEW_VAULT_ADDRESS_TEST" "$VAULT_ADDRESS"
else
  echo "Reusing RenewVault at $VAULT_ADDRESS"
fi

if ! is_unset_address "$PROTOCOL_ADDRESS"; then
  DEPLOYED_PROTOCOL_ASSET="$(cast call "$PROTOCOL_ADDRESS" "settlementAsset()(address)" --rpc-url "$RPC_URL" 2>/dev/null || true)"
  if [[ "$(to_lower "$DEPLOYED_PROTOCOL_ASSET")" != "$(to_lower "$USDC_ADDRESS")" ]]; then
    echo "Existing RenewProtocol uses $DEPLOYED_PROTOCOL_ASSET. Redeploying for Circle Fuji USDC." >&2
    PROTOCOL_ADDRESS=""
    upsert_env "RENEW_PROTOCOL_ADDRESS_TEST" "0x0000000000000000000000000000000000000000"
  fi
fi

if is_unset_address "$PROTOCOL_ADDRESS"; then
  echo "Deploying RenewProtocol to Fuji..."
  PROTOCOL_ADDRESS="$(deploy_contract src/RenewProtocol.sol:RenewProtocol --constructor-args "$USDC_ADDRESS" "$VAULT_ADDRESS" "$FEE_COLLECTOR_ADDRESS" "$PROTOCOL_FEE_BPS")"
  upsert_env "RENEW_PROTOCOL_ADDRESS_TEST" "$PROTOCOL_ADDRESS"
else
  echo "Reusing RenewProtocol at $PROTOCOL_ADDRESS"
fi

VAULT_PROTOCOL="$(cast call "$VAULT_ADDRESS" "protocol()(address)" --rpc-url "$RPC_URL")"
if [[ "$VAULT_PROTOCOL" == "0x0000000000000000000000000000000000000000" ]]; then
  echo "Configuring vault protocol..."
  cast send \
    --rpc-url "$RPC_URL" \
    --private-key "$DEPLOYER_PRIVATE_KEY" \
    "$VAULT_ADDRESS" \
    "setProtocol(address)" \
    "$PROTOCOL_ADDRESS" >/dev/null
fi

CHARGE_OPERATOR_ENABLED="$(cast call "$PROTOCOL_ADDRESS" "chargeOperators(address)(bool)" "$CHARGE_OPERATOR_ADDRESS" --rpc-url "$RPC_URL")"
if [[ "$CHARGE_OPERATOR_ENABLED" != "true" ]]; then
  echo "Enabling charge operator..."
  cast send \
    --rpc-url "$RPC_URL" \
    --private-key "$DEPLOYER_PRIVATE_KEY" \
    "$PROTOCOL_ADDRESS" \
    "setChargeOperator(address,bool)" \
    "$CHARGE_OPERATOR_ADDRESS" \
    true >/dev/null
fi

cat <<EOF
Fuji deployment complete.
USDC_TOKEN_ADDRESS_TEST=$USDC_ADDRESS
RENEW_VAULT_ADDRESS_TEST=$VAULT_ADDRESS
RENEW_PROTOCOL_ADDRESS_TEST=$PROTOCOL_ADDRESS
SAFE_EXECUTOR_PRIVATE_KEY_TEST=<updated in server/.env>
SAFE_TX_SERVICE_URL_TEST=$TX_SERVICE_URL
AVALANCHE_RPC_URL_TEST=$RPC_URL
Charge operator address: $CHARGE_OPERATOR_ADDRESS
EOF
