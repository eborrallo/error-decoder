import path from "node:path";
import { describe, expect, it } from "vitest";
import { encodeAbiParameters, keccak256, toBytes } from "viem";
import {
	createDecoder,
	createShortStringResolver,
} from "../src/index.js";
import { SHORT_STRING_ERROR_CODES } from "../example/generated/shortStringCodes.js";

const FOUNDRY_OUT = path.resolve(__dirname, "../example-contracts/out");

const resolveShortStringMessage = createShortStringResolver(
	SHORT_STRING_ERROR_CODES,
);

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

describe("createDecoder (end-to-end)", () => {
	it("should load errors from Foundry out/ and decode them", () => {
		const decoder = createDecoder({
			foundryOut: FOUNDRY_OUT,
		});

		// Should have loaded errors from all 3 contracts + 2 builtins
		expect(decoder.registrySize).toBeGreaterThanOrEqual(10);

		// Decode a Vault error
		const data = encodeError(
			"InsufficientBalance",
			["address", "uint256", "uint256"],
			["0x000000000000000000000000000000000000dEaD", 1000n, 100n],
		);

		const result = decoder.decode(data);
		expect(result).not.toBeNull();
		expect(result!.name).toBe("InsufficientBalance");
		expect(result!.args.user).toBe(
			"0x000000000000000000000000000000000000dEaD",
		);
		expect(result!.args.requested).toBe(1000n);
		expect(result!.args.available).toBe(100n);
	});

	it("should decode DEX errors", () => {
		const decoder = createDecoder({ foundryOut: FOUNDRY_OUT });

		const data = encodeError(
			"DeadlineExpired",
			["uint256", "uint256"],
			[1700000000n, 1700000100n],
		);

		const result = decoder.decode(data);
		expect(result).not.toBeNull();
		expect(result!.name).toBe("DeadlineExpired");
		expect(result!.args.deadline).toBe(1700000000n);
		expect(result!.args.currentTime).toBe(1700000100n);
	});

	it("should decode Lending errors", () => {
		const decoder = createDecoder({ foundryOut: FOUNDRY_OUT });

		const data = encodeError(
			"HealthFactorTooLow",
			["uint256", "uint256", "uint256"],
			[42n, 800n, 1000n],
		);

		const result = decoder.decode(data);
		expect(result).not.toBeNull();
		expect(result!.name).toBe("HealthFactorTooLow");
		expect(result!.args.positionId).toBe(42n);
		expect(result!.args.healthFactor).toBe(800n);
		expect(result!.args.minHealthFactor).toBe(1000n);
	});

	it("should decodeAndFormat producing all three formats", () => {
		const decoder = createDecoder({ foundryOut: FOUNDRY_OUT });

		const data = encodeError("ZeroAmount", [], []);
		const formatted = decoder.decodeAndFormat(data);

		expect(formatted).not.toBeNull();
		expect(formatted!.oneline).toContain("ZeroAmount");
		expect(formatted!.detailed).toContain("selector:");
		expect(formatted!.colored).toContain("ZeroAmount");
	});

	it("should handle Error(string) builtin", () => {
		const decoder = createDecoder({ foundryOut: FOUNDRY_OUT });

		const data = encodeError("Error", ["string"], ["not enough ETH"]);
		const result = decoder.decode(data);

		expect(result).not.toBeNull();
		expect(result!.name).toBe("Error");
		expect(result!.args.message).toBe("not enough ETH");
	});

	it("should enrich Error(string) with short-code labels from generated map (library A1, file-level P1, library A2)", () => {
		const decoder = createDecoder({
			foundryOut: FOUNDRY_OUT,
			resolveShortStringMessage,
		});

		const cases: { message: string; label: string }[] = [
			{ message: "A1", label: "ErrorText1" },
			{ message: "P1", label: "PlainErrorText1" },
			{ message: "A2", label: "ErrorText2" },
		];

		for (const { message, label } of cases) {
			const data = encodeError("Error", ["string"], [message]);
			const result = decoder.decode(data);
			expect(result).not.toBeNull();
			expect(result!.name).toBe("Error");
			expect(result!.args.message).toBe(message);
			expect(result!.args._shortStringDescription).toBe(label);
		}
	});

	it("should not set _shortStringDescription for unknown short strings when resolver is used", () => {
		const decoder = createDecoder({
			foundryOut: FOUNDRY_OUT,
			resolveShortStringMessage,
		});

		const data = encodeError("Error", ["string"], ["not in map"]);
		const result = decoder.decode(data);

		expect(result!.args.message).toBe("not in map");
		expect(result!.args._shortStringDescription).toBeUndefined();
	});

	it("should handle Panic(uint256) with description", () => {
		const decoder = createDecoder({ foundryOut: FOUNDRY_OUT });

		const data = encodeError("Panic", ["uint256"], [0x12n]);
		const result = decoder.decode(data);

		expect(result).not.toBeNull();
		expect(result!.name).toBe("Panic");
		expect(result!.args._panicDescription).toBe("Division or modulo by zero");
	});

	it("should support runtime ABI registration", () => {
		const decoder = createDecoder({ includeBuiltins: false });

		expect(decoder.registrySize).toBe(0);

		decoder.registerAbi([
			{
				type: "error",
				name: "CustomError",
				inputs: [{ name: "code", type: "uint256" }],
			},
		] as any);

		expect(decoder.registrySize).toBe(1);

		const data = encodeError("CustomError", ["uint256"], [42n]);
		const result = decoder.decode(data);

		expect(result).not.toBeNull();
		expect(result!.name).toBe("CustomError");
		expect(result!.args.code).toBe(42n);
	});

	it("tryDecode should never return null", () => {
		const decoder = createDecoder({ foundryOut: FOUNDRY_OUT });

		const result = decoder.tryDecode("0xdeadbeef11223344aabbccdd");
		expect(result).toBeDefined();
		expect(result.name).toBe("UnknownError");
	});
});
