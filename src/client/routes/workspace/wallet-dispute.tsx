import { useState } from "react";

import { errorMessage, jsonBody, submit } from "../../lib/api";

const xLayerTestnetChainId = "0x7a0";
const xLayerTestnetChainIdDecimal = 1952;

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
