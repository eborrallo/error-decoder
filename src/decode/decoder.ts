import { decodeAbiParameters } from "viem";
import type { ErrorRegistry } from "../abi/errorRegistry.js";
import type { DecodeRevertOptions, DecodedError } from "../types.js";
import { PANIC_CODES } from "../types.js";

/**
 * Decode raw revert data (`0x...`) into a structured DecodedError.
 *
 * Fast path: lookup selector in the registry map (O(1)),
 * then ABI-decode the remaining bytes.
 */
export function decodeRevertData(
	data: `0x${string}`,
	registry: ErrorRegistry,
	options?: DecodeRevertOptions,
): DecodedError | null {
	if (data.length < 10) return null;

	const selector = data.slice(0, 10).toLowerCase();
	const entry = registry.getBySelector(selector);

	if (!entry) return null;

	const encodedArgs = `0x${data.slice(10)}` as `0x${string}`;

	let rawArgs: readonly unknown[] = [];
	if (entry.error.inputs.length > 0 && encodedArgs.length > 2) {
		try {
			rawArgs = decodeAbiParameters(
				entry.error.inputs.map((i) => ({
					type: i.type,
					name: i.name || undefined,
					components: i.components as
						| { type: string; name: string }[]
						| undefined,
				})),
				encodedArgs,
			);
		} catch {
			return null;
		}
	}

	const args: Record<string, unknown> = {};
	entry.error.inputs.forEach((input, i) => {
		const key = input.name || `arg${i}`;
		args[key] = rawArgs[i];
	});

	const decoded: DecodedError = {
		name: entry.error.name,
		selector: entry.selector,
		signature: entry.signature,
		args,
		rawArgs,
		contractName: entry.contractName,
	};

	if (entry.error.name === "Panic" && typeof rawArgs[0] === "bigint") {
		const code = Number(rawArgs[0]);
		const meaning = PANIC_CODES[code];
		if (meaning) {
			decoded.args["_panicDescription"] = meaning;
		}
	}

	if (entry.error.name === "Error" && typeof args.message === "string") {
		const resolve = options?.resolveShortStringMessage;
		if (resolve) {
			const shortDesc = resolve(args.message);
			if (shortDesc) {
				decoded.args["_shortStringDescription"] = shortDesc;
			}
		}
	}

	return decoded;
}

/**
 * Try to decode, returning a human-friendly message even on failure.
 */
export function tryDecode(
	data: string,
	registry: ErrorRegistry,
	options?: DecodeRevertOptions,
): DecodedError | { name: "UnknownError"; selector: string; raw: string } {
	const hex = data.startsWith("0x") ? data : `0x${data}`;
	const result = decodeRevertData(hex as `0x${string}`, registry, options);

	if (result) return result;

	return {
		name: "UnknownError",
		selector: hex.slice(0, 10),
		raw: hex,
	};
}
