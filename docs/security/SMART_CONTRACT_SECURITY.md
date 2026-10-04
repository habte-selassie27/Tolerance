# Smart-contract security

Phase 2B uses SafeERC20, balance-delta funding to reject fee-on-transfer accounting, checks-effects-interactions and ReentrancyGuard. Economic recipients are always the immutable buyer/supplier; terminal states cannot transition.

Final closure review (2026-08-08): no unresolved HIGH finding. Expected timestamp comparisons are bounded commercial deadlines. Residual administrative trust remains because `DEFAULT_ADMIN_ROLE` can rotate operational signers, but it has no direct settlement or beneficiary-selection function. After evidence commitment, unavailable threshold attestors plus no mutual agreement can leave funds disputed; this is an accepted cross-network liveness assumption for Phase 2C/2D, not an admin escape hatch.

The accepted liveness rule is `block.timestamp >= fundedAt + evidenceSubmissionWindow`: only buyer may refund, only from `FUNDED`, and only where no evidence root exists. Once evidence exists, time does not determine a winner. Pausing stops transfers, not commit-evidence, challenge or dispute protections.

Fast outcomes are role-checked EIP-712 proposals and remain challengeable. Mutual outcomes require identical buyer and supplier signatures. GenLayer outcomes require at least two unique current attestors over identical bound data. This is a threshold trusted bridge: colluding attestors could mis-settle buyer versus supplier but cannot redirect funds to a third party.
