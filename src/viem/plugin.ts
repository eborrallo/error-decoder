import {
	type Abi,
	type CallParameters,
	type CallReturnType,
	type Client,
	type Hex,
	type SendTransactionParameters,
	type SendTransactionReturnType,
	type SimulateContractParameters,
	type SimulateContractReturnType,
	type WriteContractParameters,
	type WriteContractReturnType,
	encodeErrorResult,
} from "viem";
import { ErrorRegistry } from "../abi/errorRegistry.js";
import { decodeRevertData, tryDecode } from "../decode/decoder.js";
import { formatError, logError } from "../format/formatter.js";
import type { DecodedError, FormattedError } from "../types.js";

export interface ErrorDecoderPluginOptions {
	/** Pre-generated error ABI (from the CLI generate command). */
	errorAbis?: readonly Abi[];
	/** Include builtin Error(string) and Panic(uint256). Default: true. */
	includeBuiltins?: boolean;
}

/**
 * Custom error class thrown when a decoded revert is detected.
 * Extends the original viem error with decoded information.
 */
export class DecodedRevertError extends Error {
	readonly decoded: DecodedError;
	readonly revertData: Hex;
	readonly originalError: unknown;

	constructor(decoded: DecodedError, revertData: Hex, originalError: unknown) {
		const formatted = formatError(decoded);
		super(`Reverted: ${formatted.oneline}`);
		this.name = "DecodedRevertError";
		this.decoded = decoded;
		this.revertData = revertData;
		this.originalError = originalError;
	}
}

/** Walk the cause chain looking for raw hex revert data (e.g. from RPC errors). */
function extractRevertData(err: unknown): Hex | null {
	const e = err as any;
	if (e?.data && typeof e.data === "string" && e.data.startsWith("0x"))
		return e.data as Hex;
	if (e?.cause) return extractRevertData(e.cause);
	return null;
}

/**
 * Walk the cause chain looking for viem's pre-decoded error info
 * (ContractFunctionRevertedError stores `{ abiItem, errorName, args }`).
 * Re-encode it to raw hex so our decoder can handle it uniformly.
 */
function extractRevertDataFromViemError(err: unknown): Hex | null {
	let e = err as any;
	while (e) {
		if (e.data?.abiItem && e.data?.errorName) {
			try {
				return encodeErrorResult({
					abi: [e.data.abiItem],
					errorName: e.data.errorName,
					args: e.data.args ?? [],
				}) as Hex;
			} catch {
				/* ignore encoding failures */
			}
		}
		e = e.cause;
	}
	return null;
}

function decodeAndThrow(err: unknown, registry: ErrorRegistry): never {
	const revertData =
		extractRevertData(err) ?? extractRevertDataFromViemError(err);
	if (revertData) {
		const decoded = decodeRevertData(revertData, registry);
		if (decoded) throw new DecodedRevertError(decoded, revertData, err);
	}
	throw err;
}

/**
 * Actions added to the client by the errorDecoder plugin.
 *
 * The overridden methods (`call`, `simulateContract`, `writeContract`,
 * `sendTransaction`) are intentionally NOT declared here so they don't
 * conflict with viem's generic signatures. They still work at runtime —
 * the base client's types win in the intersection.
 */
export interface ErrorDecoderActions {
	decodeError(data: Hex): DecodedError | null;
	tryDecodeError(
		data: string,
	): DecodedError | { name: "UnknownError"; selector: string; raw: string };
	formatError(data: Hex): FormattedError | null;
	logError(data: Hex): void;
	registerErrorAbi(abi: Abi): void;
	readonly errorRegistrySize: number;
	[key: string]: unknown;
}

/**
 * Viem client plugin that overrides `call`, `simulateContract`,
 * `writeContract`, and `sendTransaction` to automatically decode
 * custom errors on revert.
 *
 * Works with both PublicClient and WalletClient — extend whichever
 * you use (or both) so every revert throws `DecodedRevertError`.
 *
 * @example
 * ```ts
 * import { createPublicClient, createWalletClient, http } from "viem";
 * import { errorDecoder, DecodedRevertError } from "@abiregistry/error-decoder/viem";
 * import { ERROR_ABI } from "./generated/index.js";
 *
 * const plugin = errorDecoder({ errorAbis: [ERROR_ABI] });
 *
 * const client = createPublicClient({ chain, transport: http() }).extend(plugin);
 * const wallet = createWalletClient({ account, chain, transport: http() }).extend(plugin);
 *
 * try {
 *   await wallet.writeContract({ address, abi, functionName: "withdraw", args: [1000n] });
 * } catch (err) {
 *   if (err instanceof DecodedRevertError) {
 *     console.log(err.decoded.name);  // "InsufficientBalance"
 *     console.log(err.decoded.args);  // { user: "0x...", requested: 1000n, available: 0n }
 *   }
 * }
 * ```
 */
export function errorDecoder(options: ErrorDecoderPluginOptions = {}) {
	const registry = new ErrorRegistry(options.includeBuiltins ?? true);

	if (options.errorAbis) {
		for (const abi of options.errorAbis) {
			registry.registerAbi(abi);
		}
	}

	return (client: Client): ErrorDecoderActions => ({
		async call(params: CallParameters): Promise<CallReturnType> {
			try {
				return await (client as any).call(params);
			} catch (err) {
				decodeAndThrow(err, registry);
			}
		},

		async simulateContract(
			params: SimulateContractParameters,
		): Promise<SimulateContractReturnType> {
			try {
				return await (client as any).simulateContract(params);
			} catch (err) {
				decodeAndThrow(err, registry);
			}
		},

		async writeContract(
			params: WriteContractParameters,
		): Promise<WriteContractReturnType> {
			try {
				return await (client as any).writeContract(params);
			} catch (err) {
				decodeAndThrow(err, registry);
			}
		},

		async sendTransaction(
			params: SendTransactionParameters,
		): Promise<SendTransactionReturnType> {
			try {
				return await (client as any).sendTransaction(params);
			} catch (err) {
				decodeAndThrow(err, registry);
			}
		},

		decodeError(data: Hex): DecodedError | null {
			return decodeRevertData(data, registry);
		},

		tryDecodeError(
			data: string,
		): DecodedError | { name: "UnknownError"; selector: string; raw: string } {
			return tryDecode(data, registry);
		},

		formatError(data: Hex): FormattedError | null {
			const decoded = decodeRevertData(data, registry);
			if (!decoded) return null;
			return formatError(decoded);
		},

		logError(data: Hex): void {
			const decoded = decodeRevertData(data, registry);
			if (!decoded) {
				console.log(`Unknown error: ${data.slice(0, 10)}...`);
				return;
			}
			logError(decoded);
		},

		registerErrorAbi(abi: Abi): void {
			registry.registerAbi(abi);
		},

		get errorRegistrySize(): number {
			return registry.size;
		},
	});
}
