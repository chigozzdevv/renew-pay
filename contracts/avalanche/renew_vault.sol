// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract RenewVault {
    enum BatchStatus {
        None,
        Held,
        Released,
        Refunded,
        Resolved
    }

    struct Batch {
        address merchant;
        uint256 amount;
        uint64 releaseAt;
        bytes32 metadataHash;
        BatchStatus status;
    }

    error Unauthorized();
    error Paused();
    error ZeroAddress();
    error InvalidAmount();
    error BatchAlreadyExists();
    error BatchNotHeld();
    error ReleaseNotReady();
    error TokenTransferFailed();
    error ReentrantCall();

    event AdminTransferStarted(address indexed previousAdmin, address indexed nextAdmin);
    event AdminTransferred(address indexed previousAdmin, address indexed nextAdmin);
    event OperatorUpdated(address indexed previousOperator, address indexed nextOperator);
    event PausedUpdated(bool paused);
    event Deposited(
        bytes32 indexed batchId,
        address indexed merchant,
        uint256 amount,
        uint64 releaseAt,
        bytes32 metadataHash
    );
    event Released(bytes32 indexed batchId, address indexed merchant, uint256 amount);
    event Refunded(bytes32 indexed batchId, address indexed recipient, uint256 amount);
    event Resolved(bytes32 indexed batchId, address indexed recipient, uint256 amount);

    IERC20 public immutable usdc;
    address public admin;
    address public pendingAdmin;
    address public operator;
    bool public paused;

    mapping(bytes32 => Batch) private batches;
    uint256 private unlocked = 1;

    constructor(address admin_, address operator_, address usdc_) {
        if (admin_ == address(0) || operator_ == address(0) || usdc_ == address(0)) {
            revert ZeroAddress();
        }

        admin = admin_;
        operator = operator_;
        usdc = IERC20(usdc_);
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) {
            revert Unauthorized();
        }
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) {
            revert Unauthorized();
        }
        _;
    }

    modifier whenNotPaused() {
        if (paused) {
            revert Paused();
        }
        _;
    }

    modifier nonReentrant() {
        if (unlocked != 1) {
            revert ReentrantCall();
        }

        unlocked = 2;
        _;
        unlocked = 1;
    }

    function transferAdmin(address nextAdmin) external onlyAdmin {
        if (nextAdmin == address(0)) {
            revert ZeroAddress();
        }

        pendingAdmin = nextAdmin;
        emit AdminTransferStarted(admin, nextAdmin);
    }

    function acceptAdmin() external {
        if (msg.sender != pendingAdmin) {
            revert Unauthorized();
        }

        address previousAdmin = admin;
        admin = pendingAdmin;
        pendingAdmin = address(0);
        emit AdminTransferred(previousAdmin, admin);
    }

    function setOperator(address nextOperator) external onlyAdmin {
        if (nextOperator == address(0)) {
            revert ZeroAddress();
        }

        address previousOperator = operator;
        operator = nextOperator;
        emit OperatorUpdated(previousOperator, nextOperator);
    }

    function setPaused(bool nextPaused) external onlyAdmin {
        paused = nextPaused;
        emit PausedUpdated(nextPaused);
    }

    function _safeTransfer(address to, uint256 amount) private {
        (bool success, bytes memory returnData) = address(usdc).call(
            abi.encodeCall(IERC20.transfer, (to, amount))
        );

        if (!success || (returnData.length != 0 && !abi.decode(returnData, (bool)))) {
            revert TokenTransferFailed();
        }
    }

    function _safeTransferFrom(address from, address to, uint256 amount) private {
        (bool success, bytes memory returnData) = address(usdc).call(
            abi.encodeCall(IERC20.transferFrom, (from, to, amount))
        );

        if (!success || (returnData.length != 0 && !abi.decode(returnData, (bool)))) {
            revert TokenTransferFailed();
        }
    }

    function deposit(
        bytes32 batchId,
        address merchant,
        uint256 amount,
        uint64 releaseAt,
        bytes32 metadataHash
    ) external nonReentrant onlyOperator whenNotPaused {
        if (merchant == address(0)) {
            revert ZeroAddress();
        }

        if (amount == 0) {
            revert InvalidAmount();
        }

        if (batches[batchId].status != BatchStatus.None) {
            revert BatchAlreadyExists();
        }

        batches[batchId] = Batch({
            merchant: merchant,
            amount: amount,
            releaseAt: releaseAt,
            metadataHash: metadataHash,
            status: BatchStatus.Held
        });

        _safeTransferFrom(msg.sender, address(this), amount);

        emit Deposited(batchId, merchant, amount, releaseAt, metadataHash);
    }

    function release(bytes32 batchId) external nonReentrant onlyOperator whenNotPaused {
        Batch storage batch = batches[batchId];

        if (batch.status != BatchStatus.Held) {
            revert BatchNotHeld();
        }

        if (block.timestamp < batch.releaseAt) {
            revert ReleaseNotReady();
        }

        batch.status = BatchStatus.Released;

        _safeTransfer(batch.merchant, batch.amount);

        emit Released(batchId, batch.merchant, batch.amount);
    }

    function refund(
        bytes32 batchId,
        address recipient
    ) external nonReentrant onlyOperator whenNotPaused {
        Batch storage batch = batches[batchId];

        if (recipient == address(0)) {
            revert ZeroAddress();
        }

        if (batch.status != BatchStatus.Held) {
            revert BatchNotHeld();
        }

        batch.status = BatchStatus.Refunded;

        _safeTransfer(recipient, batch.amount);

        emit Refunded(batchId, recipient, batch.amount);
    }

    function resolve(
        bytes32 batchId,
        address recipient
    ) external nonReentrant onlyOperator whenNotPaused {
        Batch storage batch = batches[batchId];

        if (recipient == address(0)) {
            revert ZeroAddress();
        }

        if (batch.status != BatchStatus.Held) {
            revert BatchNotHeld();
        }

        batch.status = BatchStatus.Resolved;

        _safeTransfer(recipient, batch.amount);

        emit Resolved(batchId, recipient, batch.amount);
    }

    function getBatch(bytes32 batchId) external view returns (Batch memory) {
        return batches[batchId];
    }
}
