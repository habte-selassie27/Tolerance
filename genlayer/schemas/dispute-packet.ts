import { sha256, stringToHex, type Hex } from "viem";

export type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJson[]
  | { readonly [key: string]: CanonicalJson };

function compareUnicodeScalars(left: string, right: string): number {
  const a = Array.from(left);
  const b = Array.from(right);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = a[index].codePointAt(0)! - b[index].codePointAt(0)!;
    if (difference !== 0) return difference;
  }
  return a.length - b.length;
}

function assertScalarString(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdfff) {
      const paired =
        code <= 0xdbff &&
        index + 1 < value.length &&
        value.charCodeAt(index + 1) >= 0xdc00 &&
        value.charCodeAt(index + 1) <= 0xdfff;
      if (!paired)
        throw new Error(
          "strings must not contain unpaired surrogate code points",
        );
      index += 1;
    }
  }
}

/** Mirrors Python json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=False). */
export function canonicalDisputePacketJson(value: CanonicalJson): string {
  if (value === null || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value))
      throw new Error("floats and unsafe integers are forbidden");
    return String(value);
  }
  if (typeof value === "string") {
    assertScalarString(value);
    return JSON.stringify(value);
  }
  if (Array.isArray(value))
    return `[${value.map(canonicalDisputePacketJson).join(",")}]`;
  if (typeof value !== "object")
    throw new Error("non-JSON values are forbidden");
  const object = value as { readonly [key: string]: CanonicalJson };
  return `{${Object.keys(object)
    .sort(compareUnicodeScalars)
    .map((key) => {
      assertScalarString(key);
      return `${JSON.stringify(key)}:${canonicalDisputePacketJson(object[key])}`;
    })
    .join(",")}}`;
}

export function hashDisputePacketV1(
  packetWithoutHash: { readonly disputePacketHash?: never } & Record<
    string,
    CanonicalJson
  >,
): Hex {
  if ("disputePacketHash" in packetWithoutHash)
    throw new Error("packet hash input must omit disputePacketHash");
  return sha256(stringToHex(canonicalDisputePacketJson(packetWithoutHash)));
}
