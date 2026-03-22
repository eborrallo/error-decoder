import { describe, expect, it } from "vitest";
import { encodeAbiParameters, keccak256, toBytes } from "viem";
import { ErrorRegistry } from "../src/abi/errorRegistry.js";
import { decodeRevertData } from "../src/decode/decoder.js";
import { createShortStringResolver } from "../src/helpers/shortStringResolver.js";
import { formatError } from "../src/format/formatter.js";
import type { DecodedError } from "../src/types.js";

function encodeError(
	name: string,
	types: string[],
	values: unknown[],
): `0x${string}` {
	const sig = `${name}(${types.join(",")})`;
	const selector = keccak256(toBytes(sig)).slice(0, 10);
	if (types.length === 0) return selector as `0x${string}`;

	const encoded = encodeAbiParameters(
		types.map((t) => ({ type: t })),
		values,
	);

	return `${selector}${encoded.slice(2)}` as `0x${string}`;
}

/** Example client-side map (normally generated from Solidity). */
const EXAMPLE_SHORT_MAP: Readonly<Record<string, string>> = Object.freeze({
	A1: "ErrorText1",
	A2: "ErrorText2",
	A3: "ErrorText3",
});

describe("short string error codes (client resolver)", () => {
	const resolve = createShortStringResolver(EXAMPLE_SHORT_MAP);

	it("createShortStringResolver maps codes to labels", () => {
		expect(resolve("A1")).toBe("ErrorText1");
		expect(resolve("  A2  ")).toBe("ErrorText2");
		expect(resolve("unknown")).toBeNull();
	});

	it("decodeRevertData enriches Error(string) when resolver is passed", () => {
		const registry = new ErrorRegistry(true);
		const data = encodeError("Error", ["string"], ["A1"]);

		const result = decodeRevertData(data, registry, {
			resolveShortStringMessage: resolve,
		});

		expect(result).not.toBeNull();
		expect(result!.name).toBe("Error");
		expect(result!.args.message).toBe("A1");
		expect(result!.args._shortStringDescription).toBe("ErrorText1");
	});

	it("does not add _shortStringDescription without resolver", () => {
		const registry = new ErrorRegistry(true);
		const data = encodeError("Error", ["string"], ["A1"]);

		const result = decodeRevertData(data, registry);

		expect(result!.args._shortStringDescription).toBeUndefined();
	});

	it("does not add _shortStringDescription for unknown messages with resolver", () => {
		const registry = new ErrorRegistry(true);
		const data = encodeError("Error", ["string"], ["Insufficient funds"]);

		const result = decodeRevertData(data, registry, {
			resolveShortStringMessage: resolve,
		});

		expect(result!.args._shortStringDescription).toBeUndefined();
	});

	it("formatError includes short resolution in oneline and detailed", () => {
		const decoded: DecodedError = {
			name: "Error",
			selector: "0x08c379a0",
			signature: "Error(string)",
			args: {
				message: "A1",
				_shortStringDescription: "ErrorText1",
			},
			rawArgs: ["A1"],
		};

		const fmt = formatError(decoded);
		expect(fmt.oneline).toContain("[short: ErrorText1]");
		expect(fmt.detailed).toContain("short: ErrorText1");
	});
});
