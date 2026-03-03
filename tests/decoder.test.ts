import { describe, expect, it } from "vitest";
import { encodeAbiParameters, keccak256, toBytes } from "viem";
import { ErrorRegistry } from "../src/abi/errorRegistry.js";
import { decodeRevertData, tryDecode } from "../src/decode/decoder.js";
import type { AbiErrorItem } from "../src/types.js";

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

describe("decodeRevertData", () => {
	const errors: AbiErrorItem[] = [
		{
			type: "error",
			name: "InsufficientBalance",
			inputs: [
				{ name: "user", type: "address" },
				{ name: "requested", type: "uint256" },
				{ name: "available", type: "uint256" },
			],
		},
		{
			type: "error",
			name: "ZeroAmount",
			inputs: [],
		},
		{
			type: "error",
			name: "Unauthorized",
			inputs: [
				{ name: "caller", type: "address" },
				{ name: "required", type: "address" },
			],
		},
	];

	it("should decode InsufficientBalance", () => {
		const registry = new ErrorRegistry(false);
		registry.registerAbiErrors(errors, "Vault");

		const data = encodeError(
			"InsufficientBalance",
			["address", "uint256", "uint256"],
			["0x1234567890123456789012345678901234567890", 1000n, 500n],
		);

		const result = decodeRevertData(data, registry);

		expect(result).not.toBeNull();
		expect(result!.name).toBe("InsufficientBalance");
		expect(result!.args.user).toBe(
			"0x1234567890123456789012345678901234567890",
		);
		expect(result!.args.requested).toBe(1000n);
		expect(result!.args.available).toBe(500n);
		expect(result!.contractName).toBe("Vault");
	});

	it("should decode ZeroAmount (no args)", () => {
		const registry = new ErrorRegistry(false);
		registry.registerAbiErrors(errors, "Vault");

		const data = encodeError("ZeroAmount", [], []);
		const result = decodeRevertData(data, registry);

		expect(result).not.toBeNull();
		expect(result!.name).toBe("ZeroAmount");
		expect(result!.rawArgs).toHaveLength(0);
	});

	it("should decode builtin Error(string)", () => {
		const registry = new ErrorRegistry(true);
		const data = encodeError("Error", ["string"], ["insufficient funds"]);

		const result = decodeRevertData(data, registry);

		expect(result).not.toBeNull();
		expect(result!.name).toBe("Error");
		expect(result!.args.message).toBe("insufficient funds");
	});

	it("should decode builtin Panic(uint256) with description", () => {
		const registry = new ErrorRegistry(true);
		// Panic code 0x11 = arithmetic overflow
		const data = encodeError("Panic", ["uint256"], [0x11n]);

		const result = decodeRevertData(data, registry);

		expect(result).not.toBeNull();
		expect(result!.name).toBe("Panic");
		expect(result!.args.code).toBe(17n);
		expect(result!.args._panicDescription).toBe(
			"Arithmetic overflow/underflow",
		);
	});

	it("should decode Panic(uint256) assert failed", () => {
		const registry = new ErrorRegistry(true);
		const data = encodeError("Panic", ["uint256"], [0x01n]);

		const result = decodeRevertData(data, registry);
		expect(result).not.toBeNull();
		expect(result!.args._panicDescription).toBe("Assert failed");
	});

	it("should return null for unknown selector", () => {
		const registry = new ErrorRegistry(false);
		const result = decodeRevertData("0xdeadbeef", registry);
		expect(result).toBeNull();
	});

	it("should return null for data too short", () => {
		const registry = new ErrorRegistry(true);
		const result = decodeRevertData("0x08c3", registry);
		expect(result).toBeNull();
	});
});

describe("tryDecode", () => {
	it("should return UnknownError for unmatched data", () => {
		const registry = new ErrorRegistry(false);
		const result = tryDecode("0xdeadbeef11223344", registry);

		expect(result.name).toBe("UnknownError");
		expect("raw" in result).toBe(true);
	});

	it("should handle data without 0x prefix", () => {
		const registry = new ErrorRegistry(true);
		const data = encodeError("Error", ["string"], ["test"]);
		const result = tryDecode(data.slice(2), registry);

		expect(result.name).toBe("Error");
	});
});
