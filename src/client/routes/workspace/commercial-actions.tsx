import { useState } from "react";
import type { Hex } from "viem";

import { errorMessage, jsonBody, submit } from "../../lib/api";

/**
 * The action union is defined server-side. This client copy only labels the
 * actions the API has already determined this actor is authorized to take.
 */
type CommercialAction =
  | "CREATE_OBLIGATION"
  | "ACCEPT_OBLIGATION"
  | "APPROVE_TOKEN"
  | "FUND_OBLIGATION"
  | "COMMIT_EVIDENCE"
  | "CHALLENGE_OUTCOME"
  | "FINALIZE_UNCONTESTED"
  | "REFUND_EVIDENCE_TIMEOUT";

const copy: Record<CommercialAction, { label: string; description: string }> = {
  CREATE_OBLIGATION: {
    label: "Create obligation on X Layer",
    description:
      "Create this milestone with its exact parties, amount, terms, and deadlines.",
  },
  ACCEPT_OBLIGATION: {
    label: "Accept obligation",
    description: "Confirm the supplier's participation in this milestone.",
  },
  APPROVE_TOKEN: {
    label: "Approve test token",
    description:
      "Allow the Tolerance escrow to use this exact test USD₮0 amount for funding.",
  },
  FUND_OBLIGATION: {
    label: "Fund milestone",
    description:
      "Transfer the agreed test-token amount into the frozen escrow.",
  },
  COMMIT_EVIDENCE: {
    label: "Commit inspection evidence",
    description:
      "Commit only the deterministic evidence root; private documents remain offchain.",
  },
  CHALLENGE_OUTCOME: {
    label: "Challenge proposed outcome",
    description:
      "Move a contested proposed outcome into the dispute path before the deadline.",
  },
  FINALIZE_UNCONTESTED: {
    label: "Finalize uncontested outcome",
    description:
      "Execute the frozen outcome after the challenge period has ended.",
  },
  REFUND_EVIDENCE_TIMEOUT: {
    label: "Claim evidence-timeout refund",
    description:
      "Refund the buyer after the evidence window expires without a valid commitment.",
  },
};

const xLayerTestnetChainId = "0x7a0";

export function CommercialActions({
  obligationId,
  actions,
  counterparty,
  amount,
}: {
  obligationId: string;
  actions: CommercialAction[];
  counterparty: string;
  amount: string;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function execute(action: CommercialAction) {
    setBusy(true);
    setMessage("");
    try {
      if (!window.ethereum)
        throw new Error(
          "Connect an EVM wallet to authorize this X Layer action.",
        );
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      const prepared = await submit<{
        intentId: string;
        to: string;
        data: string;
        expectedWallet: string | null;
      }>(
        `/api/obligations/${obligationId}/commercial-actions`,
        jsonBody({ action }),
        "Tolerance could not prepare that X Layer action.",
      );
      if (!prepared.ok) throw new Error(prepared.message);
      const call = prepared.data;
      if (
        call.expectedWallet &&
        accounts[0]?.toLowerCase() !== call.expectedWallet.toLowerCase()
      )
        throw new Error("Connect the wallet assigned to this obligation.");
      const chainId = (await window.ethereum.request({
        method: "eth_chainId",
      })) as string;
      if (chainId !== xLayerTestnetChainId) {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: xLayerTestnetChainId }],
        });
      }
      const hash = (await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: accounts[0],
            to: call.to,
            data: call.data,
            value: "0x0",
          },
        ],
      })) as Hex;
      const recorded = await submit<{ ok: boolean }>(
        `/api/commercial-actions/${call.intentId}/submission`,
        jsonBody({ transactionHash: hash }),
        "Tolerance could not record that transaction.",
      );
      if (!recorded.ok) throw new Error(recorded.message);
      setMessage(
        "Transaction submitted. Tolerance will verify finality and the exact escrow state before advancing.",
      );
    } catch (error) {
      setMessage(errorMessage(error, "The wallet action was not completed."));
    } finally {
      setBusy(false);
    }
  }
  if (!actions.length)
    return (
      <p className="muted">
        No party-signed action is currently available to this account.
      </p>
    );
  return (
    <div className="action-stack">
      <div className="transaction-review">
        <p>
          <b>Network</b> X Layer Testnet
        </p>
        <p>
          <b>Counterparty</b> {counterparty}
        </p>
        <p>
          <b>Amount</b> {amount} test-token units
        </p>
      </div>
      {actions.map((action, index) => (
        <article key={action} className="action-row">
          <div>
            <h3>{copy[action].label}</h3>
            <p>{copy[action].description}</p>
          </div>
          <button
            className={`button ${index === 0 ? "commitment" : "secondary"}`}
            disabled={busy}
            onClick={() => execute(action)}
          >
            {busy ? "Waiting for wallet…" : copy[action].label}
          </button>
        </article>
      ))}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </div>
  );
}

export function PendingCommercialAction({
  intentId,
  action,
  transactionHash,
}: {
  intentId: string;
  action: string;
  transactionHash: string;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="notice">
      <strong>Waiting for X Layer confirmation</strong>
      <p>
        {action.replaceAll("_", " ").toLowerCase()} was submitted. Tolerance
        will reuse this transaction and will not create a duplicate.
      </p>
      <code>{transactionHash}</code>
      <p>
        <button
          className="button secondary"
          disabled={busy}
          type="button"
          onClick={async () => {
            setBusy(true);
            try {
              const confirmed = await submit<{ ok: boolean }>(
                `/api/commercial-actions/${intentId}/confirm`,
                jsonBody({}),
                "Finality is not established yet. The existing transaction remains recorded.",
              );
              setMessage(
                confirmed.ok
                  ? "Finalized transaction and escrow state verified."
                  : confirmed.message,
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Checking…" : "Recheck status"}
        </button>
      </p>
      {message && <p role="status">{message}</p>}
    </div>
  );
}

declare global {
  interface Window {
    ethereum?: {
      request(args: { method: string; params?: unknown[] }): Promise<unknown>;
    };
  }
}
