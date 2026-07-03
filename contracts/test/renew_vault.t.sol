// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../avalanche/renew_vault.sol";

contract MockUsdc {
    string public constant name = "Mock USDC";
    string public constant symbol = "USDC";
    uint8 public constant decimals = 6;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    bool public failTransfers;
    bool public reenterRelease;
    RenewVault public reenterVault;
    bytes32 public reenterBatchId;
    bytes4 public lastReenterSelector;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function setFailTransfers(bool nextFailTransfers) external {
        failTransfers = nextFailTransfers;
    }

    function setReenterRelease(RenewVault vault, bytes32 batchId) external {
        reenterVault = vault;
        reenterBatchId = batchId;
        reenterRelease = true;
        lastReenterSelector = bytes4(0);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        return _transfer(msg.sender, to, amount);
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");

        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }

        return _transfer(from, to, amount);
    }

    function _transfer(address from, address to, uint256 amount) private returns (bool) {
        if (failTransfers) {
            return false;
        }

        require(balanceOf[from] >= amount, "balance");

        balanceOf[from] -= amount;
        balanceOf[to] += amount;

        if (reenterRelease) {
            reenterRelease = false;

            try reenterVault.release(reenterBatchId) {
                lastReenterSelector = bytes4(0);
            } catch (bytes memory revertData) {
                lastReenterSelector = _selector(revertData);
            }
        }

        return true;
    }

    function _selector(bytes memory revertData) private pure returns (bytes4 selector) {
        if (revertData.length < 4) {
            return bytes4(0);
        }

        assembly {
            selector := mload(add(revertData, 32))
        }
    }
}

contract VaultActor {
    RenewVault public vault;
    MockUsdc public usdc;

    constructor(MockUsdc usdc_) {
        usdc = usdc_;
    }

    function setVault(RenewVault vault_) external {
        vault = vault_;
    }

    function approveVault(uint256 amount) external {
        usdc.approve(address(vault), amount);
    }

    function deposit(
        bytes32 batchId,
        address merchant,
        uint256 amount,
        uint64 releaseAt,
        bytes32 metadataHash
    ) external {
        vault.deposit(batchId, merchant, amount, releaseAt, metadataHash);
    }

    function release(bytes32 batchId) external {
        vault.release(batchId);
    }

    function refund(bytes32 batchId, address recipient) external {
        vault.refund(batchId, recipient);
    }

    function resolve(bytes32 batchId, address recipient) external {
        vault.resolve(batchId, recipient);
    }

    function acceptAdmin() external {
        vault.acceptAdmin();
    }

    function setPaused(bool paused) external {
        vault.setPaused(paused);
    }
}

contract RenewVaultTest {
    bytes4 private constant UNAUTHORIZED = bytes4(keccak256("Unauthorized()"));
    bytes4 private constant PAUSED = bytes4(keccak256("Paused()"));
    bytes4 private constant BATCH_ALREADY_EXISTS =
        bytes4(keccak256("BatchAlreadyExists()"));
    bytes4 private constant BATCH_NOT_HELD = bytes4(keccak256("BatchNotHeld()"));
    bytes4 private constant RELEASE_NOT_READY = bytes4(keccak256("ReleaseNotReady()"));
    bytes4 private constant TOKEN_TRANSFER_FAILED =
        bytes4(keccak256("TokenTransferFailed()"));
    bytes4 private constant REENTRANT_CALL = bytes4(keccak256("ReentrantCall()"));

    uint256 private constant USDC = 1_000_000;
    uint256 private constant AMOUNT = 100 * USDC;

    MockUsdc private usdc;
    RenewVault private vault;
    VaultActor private operator;
    VaultActor private other;
    VaultActor private nextOperator;

    address private merchant = address(0x1000);
    address private recipient = address(0x2000);
    bytes32 private batchId = keccak256("batch-1");
    bytes32 private metadataHash = keccak256("metadata-1");

    function setUp() public {
        usdc = new MockUsdc();
        operator = new VaultActor(usdc);
        other = new VaultActor(usdc);
        nextOperator = new VaultActor(usdc);
        vault = new RenewVault(address(this), address(operator), address(usdc));

        operator.setVault(vault);
        other.setVault(vault);
        nextOperator.setVault(vault);

        usdc.mint(address(operator), 1_000 * USDC);
        operator.approveVault(type(uint256).max);
    }

    function testDepositStoresBatchAndEscrowsUsdc() public {
        operator.deposit(batchId, merchant, AMOUNT, 0, metadataHash);

        RenewVault.Batch memory batch = vault.getBatch(batchId);

        assert(batch.merchant == merchant);
        assert(batch.amount == AMOUNT);
        assert(batch.releaseAt == 0);
        assert(batch.metadataHash == metadataHash);
        assert(batch.status == RenewVault.BatchStatus.Held);
        assert(usdc.balanceOf(address(vault)) == AMOUNT);
        assert(usdc.balanceOf(address(operator)) == 900 * USDC);
    }

    function testReleasePaysMerchant() public {
        operator.deposit(batchId, merchant, AMOUNT, 0, metadataHash);
        operator.release(batchId);

        RenewVault.Batch memory batch = vault.getBatch(batchId);

        assert(batch.status == RenewVault.BatchStatus.Released);
        assert(usdc.balanceOf(merchant) == AMOUNT);
        assert(usdc.balanceOf(address(vault)) == 0);
    }

    function testReleaseBeforeReleaseAtReverts() public {
        operator.deposit(batchId, merchant, AMOUNT, uint64(block.timestamp + 1 days), metadataHash);

        (bool success, bytes memory revertData) = address(operator).call(
            abi.encodeCall(VaultActor.release, (batchId))
        );

        _expectRevert(RELEASE_NOT_READY, success, revertData);
    }

    function testOnlyOperatorCanDepositOrRelease() public {
        (bool depositSuccess, bytes memory depositRevertData) = address(other).call(
            abi.encodeCall(
                VaultActor.deposit,
                (batchId, merchant, AMOUNT, uint64(0), metadataHash)
            )
        );
        _expectRevert(UNAUTHORIZED, depositSuccess, depositRevertData);

        operator.deposit(batchId, merchant, AMOUNT, 0, metadataHash);

        (bool releaseSuccess, bytes memory releaseRevertData) = address(other).call(
            abi.encodeCall(VaultActor.release, (batchId))
        );
        _expectRevert(UNAUTHORIZED, releaseSuccess, releaseRevertData);
    }

    function testDuplicateBatchReverts() public {
        operator.deposit(batchId, merchant, AMOUNT, 0, metadataHash);

        (bool success, bytes memory revertData) = address(operator).call(
            abi.encodeCall(
                VaultActor.deposit,
                (batchId, merchant, AMOUNT, uint64(0), metadataHash)
            )
        );

        _expectRevert(BATCH_ALREADY_EXISTS, success, revertData);
    }

    function testPauseBlocksDepositsAndReleases() public {
        vault.setPaused(true);

        (bool depositSuccess, bytes memory depositRevertData) = address(operator).call(
            abi.encodeCall(
                VaultActor.deposit,
                (batchId, merchant, AMOUNT, uint64(0), metadataHash)
            )
        );
        _expectRevert(PAUSED, depositSuccess, depositRevertData);

        vault.setPaused(false);
        operator.deposit(batchId, merchant, AMOUNT, 0, metadataHash);
        vault.setPaused(true);

        (bool releaseSuccess, bytes memory releaseRevertData) = address(operator).call(
            abi.encodeCall(VaultActor.release, (batchId))
        );
        _expectRevert(PAUSED, releaseSuccess, releaseRevertData);
    }

    function testRefundReturnsFundsToRecipient() public {
        operator.deposit(batchId, merchant, AMOUNT, 0, metadataHash);
        operator.refund(batchId, recipient);

        RenewVault.Batch memory batch = vault.getBatch(batchId);

        assert(batch.status == RenewVault.BatchStatus.Refunded);
        assert(usdc.balanceOf(recipient) == AMOUNT);
        assert(usdc.balanceOf(address(vault)) == 0);
    }

    function testResolvePaysRecipient() public {
        operator.deposit(batchId, merchant, AMOUNT, 0, metadataHash);
        operator.resolve(batchId, recipient);

        RenewVault.Batch memory batch = vault.getBatch(batchId);

        assert(batch.status == RenewVault.BatchStatus.Resolved);
        assert(usdc.balanceOf(recipient) == AMOUNT);
        assert(usdc.balanceOf(address(vault)) == 0);
    }

    function testResolvedBatchCannotBeReleased() public {
        operator.deposit(batchId, merchant, AMOUNT, 0, metadataHash);
        operator.resolve(batchId, recipient);

        (bool success, bytes memory revertData) = address(operator).call(
            abi.encodeCall(VaultActor.release, (batchId))
        );

        _expectRevert(BATCH_NOT_HELD, success, revertData);
    }

    function testAdminCanRotateOperator() public {
        vault.setOperator(address(nextOperator));

        (bool oldOperatorSuccess, bytes memory oldOperatorRevertData) = address(operator).call(
            abi.encodeCall(
                VaultActor.deposit,
                (batchId, merchant, AMOUNT, uint64(0), metadataHash)
            )
        );
        _expectRevert(UNAUTHORIZED, oldOperatorSuccess, oldOperatorRevertData);

        usdc.mint(address(nextOperator), AMOUNT);
        nextOperator.approveVault(type(uint256).max);
        nextOperator.deposit(batchId, merchant, AMOUNT, 0, metadataHash);

        RenewVault.Batch memory batch = vault.getBatch(batchId);
        assert(batch.status == RenewVault.BatchStatus.Held);
    }

    function testTwoStepAdminTransfer() public {
        vault.transferAdmin(address(other));
        other.acceptAdmin();
        other.setPaused(true);

        assert(vault.admin() == address(other));
        assert(vault.pendingAdmin() == address(0));
        assert(vault.paused());

        (bool success, bytes memory revertData) = address(vault).call(
            abi.encodeCall(RenewVault.setPaused, (false))
        );
        _expectRevert(UNAUTHORIZED, success, revertData);
    }

    function testTokenTransferFailureRevertsAndDoesNotStoreBatch() public {
        usdc.setFailTransfers(true);

        (bool success, bytes memory revertData) = address(operator).call(
            abi.encodeCall(
                VaultActor.deposit,
                (batchId, merchant, AMOUNT, uint64(0), metadataHash)
            )
        );
        _expectRevert(TOKEN_TRANSFER_FAILED, success, revertData);

        RenewVault.Batch memory batch = vault.getBatch(batchId);
        assert(batch.status == RenewVault.BatchStatus.None);
        assert(batch.amount == 0);
    }

    function testReentrantReleaseIsBlockedAndOuterReleaseCompletes() public {
        operator.deposit(batchId, merchant, AMOUNT, 0, metadataHash);
        usdc.setReenterRelease(vault, batchId);

        operator.release(batchId);

        RenewVault.Batch memory batch = vault.getBatch(batchId);
        assert(batch.status == RenewVault.BatchStatus.Released);
        assert(usdc.balanceOf(merchant) == AMOUNT);
        assert(usdc.lastReenterSelector() == REENTRANT_CALL);
    }

    function _expectRevert(
        bytes4 expectedSelector,
        bool success,
        bytes memory revertData
    ) private pure {
        assert(!success);
        assert(_selector(revertData) == expectedSelector);
    }

    function _selector(bytes memory revertData) private pure returns (bytes4 selector) {
        assert(revertData.length >= 4);

        assembly {
            selector := mload(add(revertData, 32))
        }
    }
}
