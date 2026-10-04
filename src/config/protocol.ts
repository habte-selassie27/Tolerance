import { z } from "zod";

const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

const protocolConfigSchema = z.object({
  xLayer: z.object({
    chainId: z.literal(1952),
    escrow: address,
    settlementToken: address,
  }),
  genLayer: z.object({
    chainId: z.literal(61999),
    judge: address,
    rpcUrl: z.url(),
  }),
  automaticAttestationEnabled: z.literal(false),
});

export const protocolConfig = protocolConfigSchema.parse({
  xLayer: {
    chainId: 1952,
    escrow: "0xb0E937fd0AA0864167C85ccCBde282F847FC5eBd",
    settlementToken: "0x9e29b3aada05bf2d2c827af80bd28dc0b9b4fb0c",
  },
  genLayer: {
    chainId: 61999,
    judge: "0xFF1de4Ec0D3E26eC3BCa080Fd4587901dB48a56b",
    rpcUrl: "https://studio.genlayer.com/api",
  },
  automaticAttestationEnabled: false,
});

/** A deployment is selected from the obligation's persisted version, never
 * from a global "latest" address. V2 is deliberately undeployed in RC5B1. */
export const protocolVersions = ["V1", "V2"] as const;
export type ProtocolVersion = (typeof protocolVersions)[number];

export type ProtocolDeployment = {
  version: ProtocolVersion;
  packetVersion: 1 | 2;
  deployed: boolean;
  xLayer: {
    chainId: 1952;
    escrow: string | null;
    settlementToken: string;
  };
  genLayer: { chainId: 61999; judge: string | null; rpcUrl: string };
};

export const protocolDeployments: Record<ProtocolVersion, ProtocolDeployment> =
  {
    V1: { version: "V1", packetVersion: 1, deployed: true, ...protocolConfig },
    V2: {
      version: "V2",
      packetVersion: 2,
      deployed: false,
      xLayer: {
        chainId: 1952,
        escrow: null,
        settlementToken: "0x9e29b3aada05bf2d2c827af80bd28dc0b9b4fb0c",
      },
      genLayer: {
        chainId: 61999,
        judge: "0x01e95c90d1108695f81f939513E9a4814c1A688D",
        rpcUrl: "https://studio.genlayer.com/api",
      },
    },
  };

export function deploymentForProtocol(
  version: ProtocolVersion,
): ProtocolDeployment {
  return protocolDeployments[version];
}

export function assertDeployedProtocol(
  version: ProtocolVersion,
): ProtocolDeployment {
  const deployment = deploymentForProtocol(version);
  if (
    !deployment.deployed ||
    !deployment.xLayer.escrow ||
    !deployment.genLayer.judge
  )
    throw new Error(`PROTOCOL_${version}_NOT_DEPLOYED`);
  return deployment;
}

export { protocolConfigSchema };
