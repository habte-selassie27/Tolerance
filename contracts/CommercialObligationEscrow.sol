// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Single-asset escrow for one accepted commercial milestone per obligation.
/// @dev GenLayer state is not queried here. Threshold attestors are the deliberately explicit bridge boundary.
contract CommercialObligationEscrow is AccessControl, EIP712, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant ADJUDICATOR_ROLE = keccak256("ADJUDICATOR_ROLE");
    bytes32 public constant RESOLUTION_ATTESTOR_ROLE = keccak256("RESOLUTION_ATTESTOR_ROLE");

    uint64 public constant MIN_CHALLENGE_DURATION = 60 seconds;
    uint64 public constant MAX_CHALLENGE_DURATION = 30 days;
    uint64 public constant MIN_EVIDENCE_SUBMISSION_WINDOW = 60 seconds;
    uint64 public constant MAX_EVIDENCE_SUBMISSION_WINDOW = 90 days;

    bytes32 private constant FAST_OUTCOME_TYPEHASH = keccak256(
        "FastOutcome(uint256 obligationId,bytes32 evidenceRoot,bytes32 agreementHash,bytes32 policyHash,uint8 outcome,uint256 amount,uint256 nonce,uint256 expiry)"
    );
    bytes32 private constant MUTUAL_RESOLUTION_TYPEHASH = keccak256(
        "MutualResolution(uint256 obligationId,bytes32 evidenceRoot,bytes32 agreementHash,bytes32 policyHash,uint256 buyerAmount,uint256 supplierAmount,uint256 nonce,uint256 expiry)"
    );
    bytes32 private constant GENLAYER_RESOLUTION_TYPEHASH = keccak256(
        "GenLayerResolution(uint256 sourceChainId,address sourceIntelligentContract,bytes32 caseId,bytes32 genLayerTransactionId,bytes32 genLayerResultHash,uint256 xLayerChainId,address xLayerEscrow,uint256 obligationId,bytes32 agreementHash,bytes32 policyHash,bytes32 evidenceRoot,bytes32 disputePacketHash,uint8 verdict,uint256 nonce,uint256 expiry)"
    );

    enum ObligationState {
        CREATED,
        ACCEPTED,
        FUNDED,
        EVIDENCE_COMMITTED,
        VERDICT_PROPOSED,
        DISPUTED,
        SETTLED,
        REFUNDED,
        CANCELLED
    }
    enum FastOutcome {
        RELEASE_AUTHORISED_AMOUNT,
        REFUND_FULL
    }
    enum GenLayerVerdict {
        RELEASE_FULL,
        REFUND_FULL,
        INSUFFICIENT_EVIDENCE
    }

    struct Obligation {
        address buyer;
        address supplier;
        uint256 amount;
        bytes32 agreementHash;
        bytes32 policyHash;
        uint64 challengeDuration;
        uint64 evidenceSubmissionWindow;
        uint64 fundedAt;
        uint64 challengeDeadline;
        bytes32 evidenceRoot;
        bytes32 disputePacketHash;
        FastOutcome proposedOutcome;
        ObligationState state;
    }

    struct FastOutcomePayload {
        uint256 obligationId;
        bytes32 evidenceRoot;
        bytes32 agreementHash;
        bytes32 policyHash;
        FastOutcome outcome;
        uint256 amount;
        uint256 nonce;
        uint256 expiry;
    }

    struct MutualResolutionPayload {
        uint256 obligationId;
        bytes32 evidenceRoot;
        bytes32 agreementHash;
        bytes32 policyHash;
        uint256 buyerAmount;
        uint256 supplierAmount;
        uint256 nonce;
        uint256 expiry;
    }

    struct GenLayerResolutionPayload {
        uint256 sourceChainId;
        address sourceIntelligentContract;
        bytes32 caseId;
        bytes32 genLayerTransactionId;
        bytes32 genLayerResultHash;
        uint256 xLayerChainId;
        address xLayerEscrow;
        uint256 obligationId;
        bytes32 agreementHash;
        bytes32 policyHash;
        bytes32 evidenceRoot;
        bytes32 disputePacketHash;
        GenLayerVerdict verdict;
        uint256 nonce;
        uint256 expiry;
    }

    IERC20 public immutable settlementToken;
    uint256 public immutable sourceGenLayerChainId;
    address public immutable sourceGenLayerIntelligentContract;
    uint8 public immutable resolutionAttestationThreshold;

    mapping(uint256 obligationId => Obligation obligation) private _obligations;
    mapping(uint256 obligationId => bool exists) public obligationExists;
    mapping(bytes32 digest => bool used) public usedAuthorizations;

    event ObligationCreated(
        uint256 indexed obligationId,
        address indexed buyer,
        address indexed supplier,
        uint256 amount,
        bytes32 agreementHash,
        bytes32 policyHash,
        uint64 challengeDuration,
        uint64 evidenceSubmissionWindow
    );
    event ObligationAccepted(uint256 indexed obligationId);
    event ObligationFunded(uint256 indexed obligationId, uint256 amount, uint64 evidenceSubmissionDeadline);
    event EvidenceCommitted(uint256 indexed obligationId, bytes32 indexed evidenceRoot);
    event OutcomeProposed(
        uint256 indexed obligationId, FastOutcome outcome, uint64 challengeDeadline, bytes32 authorizationDigest
    );
    event OutcomeChallenged(uint256 indexed obligationId, address indexed challenger, bytes32 challengeReferenceHash);
    event DisputeEntered(uint256 indexed obligationId, address indexed initiator, bytes32 disputePacketHash);
    event ObligationSettled(uint256 indexed obligationId, uint256 supplierAmount, uint256 buyerAmount);
    event ObligationRefunded(uint256 indexed obligationId, uint256 buyerAmount);
    event ObligationCancelled(uint256 indexed obligationId);
    event GenLayerResolutionAttested(
        uint256 indexed obligationId,
        bytes32 indexed caseId,
        bytes32 genLayerTransactionId,
        bytes32 genLayerResultHash,
        GenLayerVerdict verdict
    );

    error InvalidAddress();
    error InvalidAmount();
    error InvalidHash();
    error InvalidDuration();
    error InvalidThreshold();
    error ObligationAlreadyExists();
    error UnknownObligation();
    error InvalidState();
    error NotBuyer();
    error NotSupplier();
    error NotParty();
    error ExpiredAuthorization();
    error UsedAuthorization();
    error InvalidSignature();
    error InvalidOutcome();
    error EvidenceAlreadyCommitted();
    error EvidenceNotCommitted();
    error TooEarly();
    error ChallengeWindowClosed();
    error IncorrectTokenTransfer();
    error AmountMismatch();
    error DuplicateSigner();
    error InsufficientAttestations();
    error InvalidSource();
    error InvalidCaseId();
    error ZeroDisputePacket();
    error EvidenceSubmissionWindowClosed();

    constructor(
        IERC20 settlementToken_,
        uint256 sourceGenLayerChainId_,
        address sourceGenLayerIntelligentContract_,
        uint8 resolutionAttestationThreshold_,
        address admin
    ) EIP712("ToleranceEscrow", "1") {
        if (
            address(settlementToken_) == address(0) || sourceGenLayerIntelligentContract_ == address(0)
                || admin == address(0)
        ) revert InvalidAddress();
        if (resolutionAttestationThreshold_ < 2) revert InvalidThreshold();
        settlementToken = settlementToken_;
        sourceGenLayerChainId = sourceGenLayerChainId_;
        sourceGenLayerIntelligentContract = sourceGenLayerIntelligentContract_;
        resolutionAttestationThreshold = resolutionAttestationThreshold_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function getObligation(uint256 obligationId) external view returns (Obligation memory) {
        _requireExists(obligationId);
        return _obligations[obligationId];
    }

    function toleranceCaseId(uint256 obligationId) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), obligationId));
    }

    function evidenceSubmissionDeadline(uint256 obligationId) public view returns (uint256) {
        _requireExists(obligationId);
        Obligation storage o = _obligations[obligationId];
        return o.fundedAt == 0 ? 0 : uint256(o.fundedAt) + o.evidenceSubmissionWindow;
    }

    function fastOutcomeDigest(FastOutcomePayload calldata p) external view returns (bytes32) {
        return _fastOutcomeDigest(p);
    }

    function mutualResolutionDigest(MutualResolutionPayload calldata p) external view returns (bytes32) {
        return _mutualResolutionDigest(p);
    }

    function genLayerResolutionDigest(GenLayerResolutionPayload calldata p) external view returns (bytes32) {
        return _genLayerResolutionDigest(p);
    }

    function createObligation(
        uint256 obligationId,
        address supplier,
        uint256 amount,
        bytes32 agreementHash,
        bytes32 policyHash,
        uint64 challengeDuration,
        uint64 evidenceWindow
    ) external {
        if (obligationExists[obligationId]) revert ObligationAlreadyExists();
        if (supplier == address(0) || supplier == msg.sender) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (agreementHash == bytes32(0) || policyHash == bytes32(0)) revert InvalidHash();
        if (
            challengeDuration < MIN_CHALLENGE_DURATION || challengeDuration > MAX_CHALLENGE_DURATION
                || evidenceWindow < MIN_EVIDENCE_SUBMISSION_WINDOW || evidenceWindow > MAX_EVIDENCE_SUBMISSION_WINDOW
        ) revert InvalidDuration();
        obligationExists[obligationId] = true;
        _obligations[obligationId] = Obligation(
            msg.sender,
            supplier,
            amount,
            agreementHash,
            policyHash,
            challengeDuration,
            evidenceWindow,
            0,
            0,
            bytes32(0),
            bytes32(0),
            FastOutcome.RELEASE_AUTHORISED_AMOUNT,
            ObligationState.CREATED
        );
        emit ObligationCreated(
            obligationId, msg.sender, supplier, amount, agreementHash, policyHash, challengeDuration, evidenceWindow
        );
    }

    function acceptObligation(uint256 obligationId) external {
        Obligation storage o = _obligation(obligationId);
        if (msg.sender != o.supplier) revert NotSupplier();
        if (o.state != ObligationState.CREATED) revert InvalidState();
        o.state = ObligationState.ACCEPTED;
        emit ObligationAccepted(obligationId);
    }

    function cancelBeforeFunding(uint256 obligationId) external {
        Obligation storage o = _obligation(obligationId);
        if (msg.sender != o.buyer) revert NotBuyer();
        if (o.state != ObligationState.CREATED && o.state != ObligationState.ACCEPTED) revert InvalidState();
        o.state = ObligationState.CANCELLED;
        emit ObligationCancelled(obligationId);
    }

    function fund(uint256 obligationId) external whenNotPaused nonReentrant {
        Obligation storage o = _obligation(obligationId);
        if (msg.sender != o.buyer) revert NotBuyer();
        if (o.state != ObligationState.ACCEPTED) revert InvalidState();
        uint256 beforeBalance = settlementToken.balanceOf(address(this));
        settlementToken.safeTransferFrom(msg.sender, address(this), o.amount);
        if (settlementToken.balanceOf(address(this)) - beforeBalance != o.amount) revert IncorrectTokenTransfer();
        o.fundedAt = uint64(block.timestamp);
        o.state = ObligationState.FUNDED;
        emit ObligationFunded(obligationId, o.amount, uint64(evidenceSubmissionDeadline(obligationId)));
    }

    function commitEvidence(uint256 obligationId, bytes32 evidenceRoot) external {
        Obligation storage o = _obligation(obligationId);
        if (msg.sender != o.supplier) revert NotSupplier();
        if (o.state != ObligationState.FUNDED || evidenceRoot == bytes32(0)) revert InvalidState();
        if (block.timestamp >= evidenceSubmissionDeadline(obligationId)) revert EvidenceSubmissionWindowClosed();
        o.evidenceRoot = evidenceRoot;
        o.state = ObligationState.EVIDENCE_COMMITTED;
        emit EvidenceCommitted(obligationId, evidenceRoot);
    }

    function refundForEvidenceTimeout(uint256 obligationId) external whenNotPaused nonReentrant {
        Obligation storage o = _obligation(obligationId);
        if (msg.sender != o.buyer) revert NotBuyer();
        if (o.state != ObligationState.FUNDED || o.evidenceRoot != bytes32(0)) revert InvalidState();
        if (block.timestamp < evidenceSubmissionDeadline(obligationId)) revert TooEarly();
        _refund(obligationId, o, o.amount);
    }

    function proposeFastOutcome(FastOutcomePayload calldata p, bytes calldata signature) external {
        Obligation storage o = _obligation(p.obligationId);
        if (o.state != ObligationState.EVIDENCE_COMMITTED) revert InvalidState();
        if (p.expiry < block.timestamp) revert ExpiredAuthorization();
        if (p.evidenceRoot != o.evidenceRoot || p.agreementHash != o.agreementHash || p.policyHash != o.policyHash) {
            revert InvalidHash();
        }
        if (
            (p.outcome == FastOutcome.RELEASE_AUTHORISED_AMOUNT && p.amount != o.amount)
                || (p.outcome == FastOutcome.REFUND_FULL && p.amount != 0)
        ) revert InvalidOutcome();
        bytes32 digest = _fastOutcomeDigest(p);
        _consume(digest);
        if (!hasRole(ADJUDICATOR_ROLE, ECDSA.recover(digest, signature))) revert InvalidSignature();
        o.proposedOutcome = p.outcome;
        o.challengeDeadline = uint64(block.timestamp + o.challengeDuration);
        o.state = ObligationState.VERDICT_PROPOSED;
        emit OutcomeProposed(p.obligationId, p.outcome, o.challengeDeadline, digest);
    }

    function challenge(uint256 obligationId, bytes32 challengeReferenceHash) external {
        Obligation storage o = _obligation(obligationId);
        _requireParty(o);
        if (o.state != ObligationState.VERDICT_PROPOSED) revert InvalidState();
        if (block.timestamp >= o.challengeDeadline) revert ChallengeWindowClosed();
        o.state = ObligationState.DISPUTED;
        emit OutcomeChallenged(obligationId, msg.sender, challengeReferenceHash);
    }

    function enterDispute(uint256 obligationId, bytes32 disputePacketHash) external {
        Obligation storage o = _obligation(obligationId);
        _requireParty(o);
        if (o.state != ObligationState.EVIDENCE_COMMITTED) revert InvalidState();
        if (disputePacketHash == bytes32(0)) revert ZeroDisputePacket();
        o.disputePacketHash = disputePacketHash;
        o.state = ObligationState.DISPUTED;
        emit DisputeEntered(obligationId, msg.sender, disputePacketHash);
    }

    function finalizeFastOutcome(uint256 obligationId) external whenNotPaused nonReentrant {
        Obligation storage o = _obligation(obligationId);
        if (o.state != ObligationState.VERDICT_PROPOSED) revert InvalidState();
        if (block.timestamp < o.challengeDeadline) revert TooEarly();
        if (o.proposedOutcome == FastOutcome.RELEASE_AUTHORISED_AMOUNT) _settle(obligationId, o, o.amount, 0);
        else _refund(obligationId, o, o.amount);
    }

    function executeMutualResolution(
        MutualResolutionPayload calldata p,
        bytes calldata buyerSignature,
        bytes calldata supplierSignature
    ) external whenNotPaused nonReentrant {
        Obligation storage o = _obligation(p.obligationId);
        if (o.state != ObligationState.DISPUTED) revert InvalidState();
        if (p.expiry < block.timestamp) revert ExpiredAuthorization();
        if (p.evidenceRoot != o.evidenceRoot || p.agreementHash != o.agreementHash || p.policyHash != o.policyHash) {
            revert InvalidHash();
        }
        if (p.buyerAmount + p.supplierAmount != o.amount) revert AmountMismatch();
        bytes32 digest = _mutualResolutionDigest(p);
        _consume(digest);
        if (ECDSA.recover(digest, buyerSignature) != o.buyer || ECDSA.recover(digest, supplierSignature) != o.supplier) revert InvalidSignature();
        _resolveAmounts(p.obligationId, o, p.supplierAmount, p.buyerAmount);
    }

    function executeGenLayerResolution(GenLayerResolutionPayload calldata p, bytes[] calldata signatures)
        external
        whenNotPaused
        nonReentrant
    {
        Obligation storage o = _obligation(p.obligationId);
        if (o.state != ObligationState.DISPUTED) revert InvalidState();
        if (p.expiry < block.timestamp) revert ExpiredAuthorization();
        if (
            p.sourceChainId != sourceGenLayerChainId || p.sourceIntelligentContract != sourceGenLayerIntelligentContract
                || p.xLayerChainId != block.chainid || p.xLayerEscrow != address(this)
        ) revert InvalidSource();
        if (p.caseId != toleranceCaseId(p.obligationId)) revert InvalidCaseId();
        if (
            p.agreementHash != o.agreementHash || p.policyHash != o.policyHash || p.evidenceRoot != o.evidenceRoot
                || p.disputePacketHash != o.disputePacketHash
        ) revert InvalidHash();
        bytes32 digest = _genLayerResolutionDigest(p);
        _consume(digest);
        _requireThresholdAttestors(digest, signatures);
        emit GenLayerResolutionAttested(
            p.obligationId, p.caseId, p.genLayerTransactionId, p.genLayerResultHash, p.verdict
        );
        if (p.verdict == GenLayerVerdict.RELEASE_FULL) _settle(p.obligationId, o, o.amount, 0);
        else _refund(p.obligationId, o, o.amount);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _resolveAmounts(uint256 id, Obligation storage o, uint256 supplierAmount, uint256 buyerAmount) private {
        if (supplierAmount == 0) _refund(id, o, buyerAmount);
        else _settle(id, o, supplierAmount, buyerAmount);
    }

    function _settle(uint256 id, Obligation storage o, uint256 supplierAmount, uint256 buyerAmount) private {
        o.state = ObligationState.SETTLED;
        if (supplierAmount > 0) settlementToken.safeTransfer(o.supplier, supplierAmount);
        if (buyerAmount > 0) settlementToken.safeTransfer(o.buyer, buyerAmount);
        emit ObligationSettled(id, supplierAmount, buyerAmount);
    }

    function _refund(uint256 id, Obligation storage o, uint256 buyerAmount) private {
        o.state = ObligationState.REFUNDED;
        settlementToken.safeTransfer(o.buyer, buyerAmount);
        emit ObligationRefunded(id, buyerAmount);
    }

    function _requireThresholdAttestors(bytes32 digest, bytes[] calldata signatures) private view {
        if (signatures.length < resolutionAttestationThreshold) revert InsufficientAttestations();
        for (uint256 i; i < signatures.length; ++i) {
            address signer = ECDSA.recover(digest, signatures[i]);
            if (!hasRole(RESOLUTION_ATTESTOR_ROLE, signer)) revert InvalidSignature();
            for (uint256 j; j < i; ++j) {
                if (signer == ECDSA.recover(digest, signatures[j])) revert DuplicateSigner();
            }
        }
    }

    function _fastOutcomeDigest(FastOutcomePayload calldata p) private view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    FAST_OUTCOME_TYPEHASH,
                    p.obligationId,
                    p.evidenceRoot,
                    p.agreementHash,
                    p.policyHash,
                    p.outcome,
                    p.amount,
                    p.nonce,
                    p.expiry
                )
            )
        );
    }

    function _mutualResolutionDigest(MutualResolutionPayload calldata p) private view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    MUTUAL_RESOLUTION_TYPEHASH,
                    p.obligationId,
                    p.evidenceRoot,
                    p.agreementHash,
                    p.policyHash,
                    p.buyerAmount,
                    p.supplierAmount,
                    p.nonce,
                    p.expiry
                )
            )
        );
    }

    function _genLayerResolutionDigest(GenLayerResolutionPayload calldata p) private view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    GENLAYER_RESOLUTION_TYPEHASH,
                    p.sourceChainId,
                    p.sourceIntelligentContract,
                    p.caseId,
                    p.genLayerTransactionId,
                    p.genLayerResultHash,
                    p.xLayerChainId,
                    p.xLayerEscrow,
                    p.obligationId,
                    p.agreementHash,
                    p.policyHash,
                    p.evidenceRoot,
                    p.disputePacketHash,
                    p.verdict,
                    p.nonce,
                    p.expiry
                )
            )
        );
    }

    function _consume(bytes32 digest) private {
        if (usedAuthorizations[digest]) revert UsedAuthorization();
        usedAuthorizations[digest] = true;
    }

    function _obligation(uint256 id) private view returns (Obligation storage o) {
        _requireExists(id);
        return _obligations[id];
    }

    function _requireExists(uint256 id) private view {
        if (!obligationExists[id]) revert UnknownObligation();
    }

    function _requireParty(Obligation storage o) private view {
        if (msg.sender != o.buyer && msg.sender != o.supplier) revert NotParty();
    }
}
