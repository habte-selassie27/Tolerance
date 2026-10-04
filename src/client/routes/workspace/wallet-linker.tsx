import { useState } from "react";
import { useRevalidator } from "react-router";

import { errorMessage, jsonBody, submit } from "../../lib/api";

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
