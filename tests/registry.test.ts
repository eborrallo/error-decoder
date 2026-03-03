import { describe, expect, it } from "vitest";
import { ErrorRegistry } from "../src/abi/errorRegistry.js";
import type { AbiErrorItem } from "../src/types.js";

describe("ErrorRegistry", () => {
	it("should include builtins by default", () => {
		const registry = new ErrorRegistry();

		expect(registry.size).toBe(2);
		expect(registry.getBySelector("0x08c379a0")).toBeDefined();
		expect(registry.getBySelector("0x4e487b71")).toBeDefined();
	});

	it("should register custom errors from ABI", () => {
		const registry = new ErrorRegistry(false);
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
		];

		registry.registerAbiErrors(errors, "Vault");
		expect(registry.size).toBe(2);
	});

	it("should compute correct selectors", () => {
		const registry = new ErrorRegistry(false);
		const errors: AbiErrorItem[] = [
			{
				type: "error",
				name: "Error",
				inputs: [{ name: "message", type: "string" }],
			},
		];

		registry.registerAbiErrors(errors);
		// Error(string) selector is 0x08c379a0
		expect(registry.getBySelector("0x08c379a0")).toBeDefined();
	});

	it("should deduplicate by selector", () => {
		const registry = new ErrorRegistry(false);
		const errors: AbiErrorItem[] = [
			{
				type: "error",
				name: "MyError",
				inputs: [{ name: "x", type: "uint256" }],
			},
			{
				type: "error",
				name: "MyError",
				inputs: [{ name: "x", type: "uint256" }],
			},
		];

		registry.registerAbiErrors(errors);
		expect(registry.size).toBe(1);
	});

	it("should support hasSelector", () => {
		const registry = new ErrorRegistry(true);

		// Error(string) selector
		expect(
			registry.hasSelector(
				"0x08c379a0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000046f6f70730000000000000000000000000000000000000000000000000000000000",
			),
		).toBe(true);

		expect(registry.hasSelector("0xdeadbeef")).toBe(false);
	});

	it("should merge registries", () => {
		const a = new ErrorRegistry(false);
		const b = new ErrorRegistry(false);

		a.registerAbiErrors([{ type: "error", name: "ErrorA", inputs: [] }]);
		b.registerAbiErrors([{ type: "error", name: "ErrorB", inputs: [] }]);

		a.merge(b);
		expect(a.size).toBe(2);
	});

	it("should register errors via registerErrorDefs", () => {
		const registry = new ErrorRegistry(false);
		registry.registerErrorDefs(
			[
				{
					name: "CustomError",
					inputs: [
						{ name: "code", type: "uint256" },
						{ name: "message", type: "string" },
					],
				},
			],
			"MyContract",
		);

		expect(registry.size).toBe(1);
		const entry = registry.entries[0];
		expect(entry.error.name).toBe("CustomError");
		expect(entry.contractName).toBe("MyContract");
		expect(entry.error.inputs).toHaveLength(2);
	});

	it("should return all selectors via getSelectors", () => {
		const registry = new ErrorRegistry(false);
		registry.registerAbiErrors([
			{ type: "error", name: "ErrorA", inputs: [] },
			{
				type: "error",
				name: "ErrorB",
				inputs: [{ name: "x", type: "uint256" }],
			},
		]);

		const selectors = registry.getSelectors();
		expect(selectors).toHaveLength(2);
		for (const sel of selectors) {
			expect(sel).toMatch(/^0x[0-9a-f]{8}$/);
		}
	});

	it("should expose entries as readonly array", () => {
		const registry = new ErrorRegistry(false);
		registry.registerAbiErrors([
			{ type: "error", name: "TestError", inputs: [] },
		]);

		const entries = registry.entries;
		expect(entries).toHaveLength(1);
		expect(entries[0].error.name).toBe("TestError");
		expect(entries[0].signature).toBe("TestError()");
	});

	it("should register errors from a full ABI via registerAbi", () => {
		const registry = new ErrorRegistry(false);
		const fullAbi = [
			{ type: "function", name: "transfer", inputs: [], outputs: [] },
			{
				type: "error",
				name: "Unauthorized",
				inputs: [{ name: "caller", type: "address" }],
			},
			{ type: "event", name: "Transfer", inputs: [] },
			{ type: "error", name: "Paused", inputs: [] },
		];

		registry.registerAbi(fullAbi as any);
		expect(registry.size).toBe(2);
	});
});
