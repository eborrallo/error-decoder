import { describe, expect, it, vi } from "vitest";
import type { Abi, Hex } from "viem";
import { DecodedRevertError, errorDecoder } from "../src/viem/plugin.js";

const TEST_ABI: Abi = [
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
];

const INSUFFICIENT_BALANCE_DATA =
	"0xdb42144d000000000000000000000000000000000000000000000000000000000000dead00000000000000000000000000000000000000000000000000000000000003e800000000000000000000000000000000000000000000000000000000000001f4" as Hex;

const ZERO_AMOUNT_DATA = "0x1f2a2005" as Hex;

function createMockClient(overrides: Record<string, unknown> = {}) {
	return {
		call: vi.fn(),
		simulateContract: vi.fn(),
		writeContract: vi.fn(),
		sendTransaction: vi.fn(),
		...overrides,
	} as any;
}

describe("errorDecoder plugin", () => {
	it("should create a plugin with registered errors", () => {
		const plugin = errorDecoder({ errorAbis: [TEST_ABI] });
		const mockClient = createMockClient();
		const actions = plugin(mockClient);

		// 2 custom + 2 builtins (Error, Panic)
		expect(actions.errorRegistrySize).toBe(4);
	});

	it("should include builtins by default", () => {
		const plugin = errorDecoder();
		const actions = plugin(createMockClient());

		expect(actions.errorRegistrySize).toBe(2);
	});

	it("should exclude builtins when disabled", () => {
		const plugin = errorDecoder({ includeBuiltins: false });
		const actions = plugin(createMockClient());

		expect(actions.errorRegistrySize).toBe(0);
	});

	describe("decodeError", () => {
		it("should decode known error data", () => {
			const plugin = errorDecoder({ errorAbis: [TEST_ABI] });
			const actions = plugin(createMockClient());

			const result = actions.decodeError(INSUFFICIENT_BALANCE_DATA);
			expect(result).not.toBeNull();
			expect(result!.name).toBe("InsufficientBalance");
			expect(result!.args.requested).toBe(1000n);
			expect(result!.args.available).toBe(500n);
		});

		it("should decode error with no args", () => {
			const plugin = errorDecoder({ errorAbis: [TEST_ABI] });
			const actions = plugin(createMockClient());

			const result = actions.decodeError(ZERO_AMOUNT_DATA);
			expect(result).not.toBeNull();
			expect(result!.name).toBe("ZeroAmount");
		});

		it("should return null for unknown selector", () => {
			const plugin = errorDecoder({ errorAbis: [TEST_ABI] });
			const actions = plugin(createMockClient());

			expect(actions.decodeError("0xdeadbeef" as Hex)).toBeNull();
		});
	});

	describe("tryDecodeError", () => {
		it("should return decoded error for known selector", () => {
			const plugin = errorDecoder({ errorAbis: [TEST_ABI] });
			const actions = plugin(createMockClient());

			const result = actions.tryDecodeError(ZERO_AMOUNT_DATA);
			expect(result.name).toBe("ZeroAmount");
		});

		it("should return UnknownError for unknown selector", () => {
			const plugin = errorDecoder({ errorAbis: [TEST_ABI] });
			const actions = plugin(createMockClient());

			const result = actions.tryDecodeError("0xdeadbeef1234");
			expect(result.name).toBe("UnknownError");
		});
	});

	describe("formatError", () => {
		it("should decode and format known error", () => {
			const plugin = errorDecoder({ errorAbis: [TEST_ABI] });
			const actions = plugin(createMockClient());

			const result = actions.formatError(INSUFFICIENT_BALANCE_DATA);
			expect(result).not.toBeNull();
			expect(result!.oneline).toContain("InsufficientBalance");
			expect(result!.oneline).toContain("1000");
		});

		it("should return null for unknown error", () => {
			const plugin = errorDecoder({ errorAbis: [TEST_ABI] });
			const actions = plugin(createMockClient());

			expect(actions.formatError("0xdeadbeef" as Hex)).toBeNull();
		});
	});

	describe("logError", () => {
		it("should log decoded error to console", () => {
			const plugin = errorDecoder({ errorAbis: [TEST_ABI] });
			const actions = plugin(createMockClient());
			const spy = vi.spyOn(console, "log").mockImplementation(() => {});

			actions.logError(ZERO_AMOUNT_DATA);

			expect(spy).toHaveBeenCalled();
			const output = spy.mock.calls.map((c) => c.join(" ")).join("\n");
			expect(output).toContain("ZeroAmount");
			spy.mockRestore();
		});

		it("should log unknown for unrecognized data", () => {
			const plugin = errorDecoder({ errorAbis: [TEST_ABI] });
			const actions = plugin(createMockClient());
			const spy = vi.spyOn(console, "log").mockImplementation(() => {});

			actions.logError("0xdeadbeef" as Hex);

			expect(spy).toHaveBeenCalledWith(
				expect.stringContaining("Unknown error"),
			);
			spy.mockRestore();
		});
	});

	describe("registerErrorAbi", () => {
		it("should register additional ABIs at runtime", () => {
			const plugin = errorDecoder({ includeBuiltins: false });
			const actions = plugin(createMockClient());

			expect(actions.errorRegistrySize).toBe(0);

			actions.registerErrorAbi(TEST_ABI);
			expect(actions.errorRegistrySize).toBe(2);

			const result = actions.decodeError(ZERO_AMOUNT_DATA);
			expect(result).not.toBeNull();
			expect(result!.name).toBe("ZeroAmount");
		});
	});

	describe("call override", () => {
		it("should pass through successful calls", async () => {
			const mockClient = createMockClient({
				call: vi.fn().mockResolvedValue({ data: "0x1234" }),
			});
			const plugin = errorDecoder({ errorAbis: [TEST_ABI] });
			const actions = plugin(mockClient);

			const result = await actions.call({ to: "0x1234" as Hex });
			expect(result).toEqual({ data: "0x1234" });
		});

		it("should throw DecodedRevertError on revert with raw hex data", async () => {
			const rpcError = new Error("execution reverted");
			(rpcError as any).data = INSUFFICIENT_BALANCE_DATA;

			const mockClient = createMockClient({
				call: vi.fn().mockRejectedValue(rpcError),
			});
			const plugin = errorDecoder({ errorAbis: [TEST_ABI] });
			const actions = plugin(mockClient);

			await expect(actions.call({ to: "0x1234" as Hex })).rejects.toThrow(
				DecodedRevertError,
			);

			try {
				await actions.call({ to: "0x1234" as Hex });
			} catch (err) {
				expect(err).toBeInstanceOf(DecodedRevertError);
				const decoded = (err as DecodedRevertError).decoded;
				expect(decoded.name).toBe("InsufficientBalance");
				expect(decoded.args.requested).toBe(1000n);
				expect((err as DecodedRevertError).revertData).toBe(
					INSUFFICIENT_BALANCE_DATA,
				);
				expect((err as DecodedRevertError).originalError).toBe(rpcError);
			}
		});

		it("should re-throw original error if selector is unknown", async () => {
			const rpcError = new Error("execution reverted");
			(rpcError as any).data = "0xdeadbeef";

			const mockClient = createMockClient({
				call: vi.fn().mockRejectedValue(rpcError),
			});
			const plugin = errorDecoder({ errorAbis: [TEST_ABI] });
			const actions = plugin(mockClient);

			await expect(actions.call({ to: "0x1234" as Hex })).rejects.toBe(
				rpcError,
			);
		});

		it("should re-throw original error if no data", async () => {
			const rpcError = new Error("network error");
			const mockClient = createMockClient({
				call: vi.fn().mockRejectedValue(rpcError),
			});
			const plugin = errorDecoder({ errorAbis: [TEST_ABI] });
			const actions = plugin(mockClient);

			await expect(actions.call({ to: "0x1234" as Hex })).rejects.toBe(
				rpcError,
			);
		});
	});

	describe("simulateContract override", () => {
		it("should pass through successful simulations", async () => {
			const mockResult = { result: 42n, request: {} };
			const mockClient = createMockClient({
				simulateContract: vi.fn().mockResolvedValue(mockResult),
			});
			const plugin = errorDecoder({ errorAbis: [TEST_ABI] });
			const actions = plugin(mockClient);

			const result = await actions.simulateContract({
				address: "0x1234" as Hex,
				abi: TEST_ABI,
				functionName: "test",
			} as any);
			expect(result).toEqual(mockResult);
		});

		it("should decode viem pre-decoded error from cause chain", async () => {
			const innerError = new Error("reverted");
			(innerError as any).data = {
				abiItem: TEST_ABI[0],
				errorName: "InsufficientBalance",
				args: ["0x000000000000000000000000000000000000dEaD", 1000n, 500n],
			};

			const outerError = new Error("ContractFunctionExecutionError");
			(outerError as any).cause = innerError;

			const mockClient = createMockClient({
				simulateContract: vi.fn().mockRejectedValue(outerError),
			});
			const plugin = errorDecoder({ errorAbis: [TEST_ABI] });
			const actions = plugin(mockClient);

			try {
				await actions.simulateContract({
					address: "0x1234" as Hex,
					abi: TEST_ABI,
					functionName: "test",
				} as any);
				expect.unreachable("should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(DecodedRevertError);
				expect((err as DecodedRevertError).decoded.name).toBe(
					"InsufficientBalance",
				);
			}
		});
	});

	describe("writeContract override", () => {
		it("should pass through successful writes", async () => {
			const hash = "0xabcdef" as Hex;
			const mockClient = createMockClient({
				writeContract: vi.fn().mockResolvedValue(hash),
			});
			const plugin = errorDecoder({ errorAbis: [TEST_ABI] });
			const actions = plugin(mockClient);

			const result = await actions.writeContract({
				address: "0x1234" as Hex,
				abi: TEST_ABI,
				functionName: "test",
			} as any);
			expect(result).toBe(hash);
		});

		it("should throw DecodedRevertError on write revert", async () => {
			const rpcError = new Error("reverted");
			(rpcError as any).data = ZERO_AMOUNT_DATA;

			const mockClient = createMockClient({
				writeContract: vi.fn().mockRejectedValue(rpcError),
			});
			const plugin = errorDecoder({ errorAbis: [TEST_ABI] });
			const actions = plugin(mockClient);

			try {
				await actions.writeContract({
					address: "0x1234" as Hex,
					abi: TEST_ABI,
					functionName: "test",
				} as any);
				expect.unreachable("should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(DecodedRevertError);
				expect((err as DecodedRevertError).decoded.name).toBe("ZeroAmount");
			}
		});
	});

	describe("sendTransaction override", () => {
		it("should pass through successful transactions", async () => {
			const hash = "0xabcdef" as Hex;
			const mockClient = createMockClient({
				sendTransaction: vi.fn().mockResolvedValue(hash),
			});
			const plugin = errorDecoder({ errorAbis: [TEST_ABI] });
			const actions = plugin(mockClient);

			const result = await actions.sendTransaction({
				to: "0x1234" as Hex,
			} as any);
			expect(result).toBe(hash);
		});

		it("should throw DecodedRevertError on tx revert", async () => {
			const rpcError = new Error("reverted");
			(rpcError as any).data = INSUFFICIENT_BALANCE_DATA;

			const mockClient = createMockClient({
				sendTransaction: vi.fn().mockRejectedValue(rpcError),
			});
			const plugin = errorDecoder({ errorAbis: [TEST_ABI] });
			const actions = plugin(mockClient);

			try {
				await actions.sendTransaction({
					to: "0x1234" as Hex,
				} as any);
				expect.unreachable("should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(DecodedRevertError);
				expect((err as DecodedRevertError).decoded.name).toBe(
					"InsufficientBalance",
				);
			}
		});
	});

	describe("revert data extraction from nested causes", () => {
		it("should walk cause chain to find hex data", async () => {
			const deepError = new Error("rpc error");
			(deepError as any).data = ZERO_AMOUNT_DATA;
			const midError = new Error("call error");
			(midError as any).cause = deepError;
			const topError = new Error("contract error");
			(topError as any).cause = midError;

			const mockClient = createMockClient({
				call: vi.fn().mockRejectedValue(topError),
			});
			const plugin = errorDecoder({ errorAbis: [TEST_ABI] });
			const actions = plugin(mockClient);

			try {
				await actions.call({ to: "0x1234" as Hex });
				expect.unreachable("should have thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(DecodedRevertError);
				expect((err as DecodedRevertError).decoded.name).toBe("ZeroAmount");
			}
		});
	});
});

describe("DecodedRevertError", () => {
	it("should have correct name and properties", () => {
		const decoded = {
			name: "ZeroAmount",
			selector: "0x1f2a2005",
			signature: "ZeroAmount()",
			args: {},
			rawArgs: [] as readonly unknown[],
		};

		const err = new DecodedRevertError(decoded, ZERO_AMOUNT_DATA, null);

		expect(err).toBeInstanceOf(Error);
		expect(err.name).toBe("DecodedRevertError");
		expect(err.message).toContain("ZeroAmount");
		expect(err.decoded).toBe(decoded);
		expect(err.revertData).toBe(ZERO_AMOUNT_DATA);
		expect(err.originalError).toBeNull();
	});

	it("should format message from decoded error", () => {
		const decoded = {
			name: "InsufficientBalance",
			selector: "0xdb42144d",
			signature: "InsufficientBalance(address,uint256,uint256)",
			args: {
				user: "0x000000000000000000000000000000000000dEaD",
				requested: 1000n,
				available: 500n,
			},
			rawArgs: [
				"0x000000000000000000000000000000000000dEaD",
				1000n,
				500n,
			] as readonly unknown[],
		};

		const err = new DecodedRevertError(
			decoded,
			INSUFFICIENT_BALANCE_DATA,
			new Error("original"),
		);

		expect(err.message).toContain("InsufficientBalance");
		expect(err.message).toContain("1000");
		expect(err.originalError).toBeInstanceOf(Error);
	});
});
