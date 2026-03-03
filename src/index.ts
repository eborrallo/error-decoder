import type { Abi } from "viem";
import { ErrorRegistry } from "./abi/errorRegistry.js";
import { decodeRevertData, tryDecode } from "./decode/decoder.js";
import {
	scanFoundryOut,
	scanHardhatArtifacts,
} from "./extract/foundryParser.js";
import { formatError, logError } from "./format/formatter.js";
import type { DecodedError, DecoderOptions, FormattedError } from "./types.js";

export interface SolidityErrorDecoder {
	/** Decode raw revert data. Returns null if no match. */
	decode(data: `0x${string}`): DecodedError | null;

	/** Decode with fallback — always returns something. */
	tryDecode(
		data: string,
	): DecodedError | { name: "UnknownError"; selector: string; raw: string };

	/** Decode and format for display. */
	decodeAndFormat(data: `0x${string}`): FormattedError | null;

	/** Decode and log to console with colors. */
	decodeAndLog(data: `0x${string}`): void;

	/** Register additional ABI(s) at runtime. */
	registerAbi(abi: Abi, contractName?: string): void;

	/** Number of registered error selectors. */
	readonly registrySize: number;

	/** Access the underlying registry for advanced use. */
	readonly registry: ErrorRegistry;
}

/**
 * Create a decoder instance from various sources.
 *
 * @example
 * ```ts
 * const decoder = createDecoder({ foundryOut: "./out" });
 * const result = decoder.decode(revertData);
 * if (result) console.log(result.name, result.args);
 * ```
 */
export function createDecoder(
	options: DecoderOptions = {},
): SolidityErrorDecoder {
	const registry = new ErrorRegistry(options.includeBuiltins ?? true);

	if (options.foundryOut) {
		const artifacts = scanFoundryOut(options.foundryOut);
		for (const artifact of artifacts) {
			registry.registerAbi(artifact.abi, artifact.contractName);
		}
	}

	if (options.hardhatArtifacts) {
		const artifacts = scanHardhatArtifacts(options.hardhatArtifacts);
		for (const artifact of artifacts) {
			registry.registerAbi(artifact.abi, artifact.contractName);
		}
	}

	if (options.abis) {
		for (const abi of options.abis) {
			registry.registerAbi(abi as Abi);
		}
	}

	return {
		decode(data: `0x${string}`): DecodedError | null {
			return decodeRevertData(data, registry);
		},

		tryDecode(data: string) {
			return tryDecode(data, registry);
		},

		decodeAndFormat(data: `0x${string}`): FormattedError | null {
			const decoded = decodeRevertData(data, registry);
			if (!decoded) return null;
			return formatError(decoded);
		},

		decodeAndLog(data: `0x${string}`): void {
			const decoded = decodeRevertData(data, registry);
			if (!decoded) {
				console.log(`Unknown error: ${data.slice(0, 10)}...`);
				return;
			}
			logError(decoded);
		},

		registerAbi(abi: Abi, contractName?: string): void {
			registry.registerAbi(abi, contractName);
		},

		get registrySize() {
			return registry.size;
		},

		get registry() {
			return registry;
		},
	};
}

// Re-export everything for power users
export { ErrorRegistry } from "./abi/errorRegistry.js";
export { decodeRevertData, tryDecode } from "./decode/decoder.js";
export {
	scanFoundryOut,
	scanHardhatArtifacts,
} from "./extract/foundryParser.js";
export { formatError, logError } from "./format/formatter.js";
export type {
	AbiErrorItem,
	DecodedError,
	DecoderOptions,
	ErrorRegistryEntry,
	FormattedError,
	SolidityErrorABI,
	SolidityErrorInput,
} from "./types.js";
export { BUILTIN_ERRORS, PANIC_CODES } from "./types.js";
