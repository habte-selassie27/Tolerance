import { useState } from "react";
import type { Hex } from "viem";
import { useRevalidator } from "react-router";

import type { CommercialAction } from "../../../lib/api-types";
import { errorMessage, jsonBody, submit } from "../../lib/api";

/** X Layer Testnet, the only network these commercial actions may reach. */
const xLayerTestnetChainId = "0x7a0";
const xLayerTestnetChainIdDecimal = 1952;

export function WalletLinker() {
  const [status, setStatus] = useState("");
  const revalidator = useRevalidator();
  async function connect() {
    try {
      if (!window.ethereum)
        throw new Error(
          "No EVM wallet was found. You can skip this step and link one later.",
        );
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      const address = accounts[0];
      if (!address) throw new Error("The wallet did not provide an account.");
      const requested = await submit<{ id: string; message: string }>(
        "/api/wallets/challenges",
        jsonBody({ address }),
        "Tolerance could not start wallet verification.",
      );
      if (!requested.ok) throw new Error(requested.message);
      const challenge = requested.data;
      const signature = (await window.ethereum.request({
        method: "personal_sign",
        params: [challenge.message, address],
      })) as string;
      const verified = await submit<{ ok: boolean }>(
        `/api/wallets/challenges/${challenge.id}/verification`,
        jsonBody({ signature }),
        "Wallet verification failed.",
      );
      if (!verified.ok) throw new Error(verified.message);
      setStatus(
        `Verified ${address.slice(0, 6)}…${address.slice(-4)} on X Layer Testnet.`,
      );
      revalidator.revalidate();
    } catch (error) {
      setStatus(errorMessage(error, "Wallet verification failed."));
    }
  }
  return (
    <div className="wallet-linker">
      <button className="button secondary" type="button" onClick={connect}>
        Connect and verify wallet
      </button>
      {status && <p role="status">{status}</p>}
    </div>
  );
}

export function WalletDispute({
  workflowId,
  workflowVersion,
  expectedParty,
}: {
  workflowId: string;
  workflowVersion: number;
  expectedParty: string;
}) {
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function enter() {
    try {
      setBusy(true);
      if (!window.ethereum)
        throw new Error("Connect an EVM wallet to continue.");
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (accounts[0]?.toLowerCase() !== expectedParty.toLowerCase())
        throw new Error(
          "Connect the buyer or supplier wallet for this obligation.",
        );
      const chain = (await window.ethereum.request({
        method: "eth_chainId",
      })) as string;
      if (Number.parseInt(chain, 16) !== xLayerTestnetChainIdDecimal) {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: xLayerTestnetChainId }],
        });
      }
      const prepared = await submit<{
        workflowVersion: number;
        transaction: { to: string; data: string };
      }>(
        `/api/disputes/${workflowId}/prepare`,
        jsonBody({ workflowVersion }),
        "Tolerance could not prepare the X Layer dispute call.",
      );
      if (!prepared.ok) throw new Error(prepared.message);
      const hash = (await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: accounts[0],
            to: prepared.data.transaction.to,
            data: prepared.data.transaction.data,
            value: "0x0",
          },
        ],
      })) as string;
      const confirmed = await submit<{ ok: boolean }>(
        `/api/disputes/${workflowId}/confirm`,
        jsonBody({ transactionHash: hash }),
        "Tolerance could not record that dispute transaction.",
      );
      if (!confirmed.ok) throw new Error(confirmed.message);
      setMessage("Transaction sent. Waiting for X Layer confirmation.");
    } catch (error) {
      setMessage(errorMessage(error, "Wallet request could not be completed."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="wallet-action">
      <button className="button" disabled={busy} onClick={enter}>
        {busy ? "Preparing wallet request…" : "Enter dispute on X Layer"}
      </button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}

/**
 * The action union is defined server-side. This client copy only labels the
 * actions the API has already determined this actor is authorized to take.
 */

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
