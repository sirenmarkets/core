import { ethers } from "ethers"
import * as sigUtil from "eth-sig-util"
import * as ethUtil from "ethereumjs-util"
import { SirenExchangeContract } from "../../typechain"

const SECONDS_IN_DAY = 86400
const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000"
export const LIGHT_DOMAIN_NAME = "SWAP_LIGHT_1155"
export const LIGHT_DOMAIN_VERSION = "1"
export const CHAIN_ID = 31337

export declare type UnsignedLightOrder = {
  nonce: string
  expiry: string
  signerWallet: string
  signerToken: string
  signerAmount: string
  senderWallet: string
  senderToken: string
  senderTokenId: string
  senderAmount: string
}

export type LightSignature = {
  v: string
  r: string
  s: string
}

export type LightOrder = {
  nonce: string
  expiry: string
  signerWallet: string
  signerToken: string
  signerAmount: string
  senderToken: string
  senderTokenId: string
  senderAmount: string
} & LightSignature

export const EIP712Light = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
  LightOrder: [
    { name: "nonce", type: "uint256" },
    { name: "expiry", type: "uint256" },
    { name: "signerWallet", type: "address" },
    { name: "signerToken", type: "address" },
    { name: "signerAmount", type: "uint256" },
    { name: "senderWallet", type: "address" },
    { name: "senderToken", type: "address" },
    { name: "senderTokenId", type: "uint256" },
    { name: "senderAmount", type: "uint256" },
  ],
}

// eslint-disable-next-line  @typescript-eslint/explicit-module-boundary-types
export function createLightOrder({
  expiry = Math.round(Date.now() / 1000 + SECONDS_IN_DAY).toString(),
  nonce = Date.now().toString(),
  signerWallet = ADDRESS_ZERO,
  signerToken = ADDRESS_ZERO,
  signerAmount = "0",
  senderWallet = ADDRESS_ZERO,
  senderToken = ADDRESS_ZERO,
  senderTokenId = "1",
  senderAmount = "0",
}: any): UnsignedLightOrder {
  return {
    expiry: String(expiry),
    nonce: String(nonce),
    signerWallet,
    signerToken,
    signerAmount: String(signerAmount),
    senderWallet,
    senderToken,
    senderTokenId: String(senderTokenId),
    senderAmount: String(senderAmount),
  }
}

export async function createLightSignature(
  unsignedOrder: UnsignedLightOrder,
  signer: ethers.VoidSigner | string,
  swapContract: string,
  chainId: number,
): Promise<LightSignature> {
  let sig
  if (typeof signer === "string") {
    sig = sigUtil.signTypedData_v4(ethUtil.toBuffer(signer), {
      data: {
        types: EIP712Light,
        domain: {
          name: LIGHT_DOMAIN_NAME,
          version: LIGHT_DOMAIN_VERSION,
          chainId,
          verifyingContract: swapContract,
        },
        primaryType: "LightOrder",
        message: unsignedOrder,
      },
    })
  } else {
    sig = await signer._signTypedData(
      {
        name: LIGHT_DOMAIN_NAME,
        version: LIGHT_DOMAIN_VERSION,
        chainId,
        verifyingContract: swapContract,
      },
      { LightOrder: EIP712Light.LightOrder },
      unsignedOrder,
    )
  }
  const { r, s, v } = ethers.utils.splitSignature(sig)
  return { r, s, v: String(v) }
}

export declare type SignOrderParams = {
  signerTokenAddress: string
  signerAmount: number
  senderAddress: string
  senderTokenAddress: string
  tokenIndex: string
  senderAmount: number
  lightAddress: string
  expiry: number
}

export async function createSignedOrder(
  params: SignOrderParams,
  signer,
): Promise<LightOrder> {
  const unsignedOrder = createLightOrder({
    signerWallet: signer.address,
    signerToken: params.signerTokenAddress,
    signerAmount: params.signerAmount,
    senderWallet: params.senderAddress,
    senderToken: params.senderTokenAddress,
    senderTokenId: params.tokenIndex,
    senderAmount: params.senderAmount,
    ...params,
  })

  const sig = await createLightSignature(
    unsignedOrder,
    signer,
    params.lightAddress,
    CHAIN_ID,
  )
  return {
    ...unsignedOrder,
    ...sig,
  }
}
