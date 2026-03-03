import { describe, expect, it, vi } from "vitest";
import { formatError, logError } from "../src/format/formatter.js";
import type { DecodedError } from "../src/types.js";

describe("formatError", () => {
	it("should format a simple error one-line", () => {
		const decoded: DecodedError = {
			name: "ZeroAmount",
			selector: "0x1f2a2005",
			signature: "ZeroAmount()",
			args: {},
			rawArgs: [],
			contractName: "Vault",
		};

		const formatted = formatError(decoded);
		expect(formatted.oneline).toBe("Vault.ZeroAmount()");
	});

	it("should format error with args one-line", () => {
		const decoded: DecodedError = {
			name: "InsufficientBalance",
			selector: "0xabcd1234",
			signature: "InsufficientBalance(address,uint256,uint256)",
			args: {
				user: "0x1234567890123456789012345678901234567890",
				requested: 1000n,
				available: 500n,
			},
			rawArgs: ["0x1234567890123456789012345678901234567890", 1000n, 500n],
			contractName: "Vault",
		};

		const formatted = formatError(decoded);
		expect(formatted.oneline).toContain("InsufficientBalance");
		expect(formatted.oneline).toContain("1000");
		expect(formatted.oneline).toContain("500");
	});

	it("should format detailed output with all fields", () => {
		const decoded: DecodedError = {
			name: "Unauthorized",
			selector: "0xabcd5678",
			signature: "Unauthorized(address,address)",
			args: {
				caller: "0xaaaa",
				required: "0xbbbb",
			},
			rawArgs: ["0xaaaa", "0xbbbb"],
		};

		const formatted = formatError(decoded);
		expect(formatted.detailed).toContain("Unauthorized");
		expect(formatted.detailed).toContain("selector: 0xabcd5678");
		expect(formatted.detailed).toContain("caller:");
		expect(formatted.detailed).toContain("required:");
	});

	it("should format Panic with description", () => {
		const decoded: DecodedError = {
			name: "Panic",
			selector: "0x4e487b71",
			signature: "Panic(uint256)",
			args: {
				code: 17n,
				_panicDescription: "Arithmetic overflow/underflow",
			},
			rawArgs: [17n],
		};

		const formatted = formatError(decoded);
		expect(formatted.detailed).toContain("Arithmetic overflow/underflow");
	});

	it("should produce colored output", () => {
		const decoded: DecodedError = {
			name: "ZeroAmount",
			selector: "0x1f2a2005",
			signature: "ZeroAmount()",
			args: {},
			rawArgs: [],
		};

		const formatted = formatError(decoded);
		expect(formatted.colored.length).toBeGreaterThan(0);
		expect(formatted.colored).toContain("ZeroAmount");
	});

	it("should format error without contractName", () => {
		const decoded: DecodedError = {
			name: "Forbidden",
			selector: "0xabcd0000",
			signature: "Forbidden()",
			args: {},
			rawArgs: [],
		};

		const formatted = formatError(decoded);
		expect(formatted.oneline).toBe("Forbidden()");
		expect(formatted.oneline).not.toContain(".");
	});
});

describe("logError", () => {
	it("should log colored output to console", () => {
		const decoded: DecodedError = {
			name: "ZeroAmount",
			selector: "0x1f2a2005",
			signature: "ZeroAmount()",
			args: {},
			rawArgs: [],
		};

		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		logError(decoded);

		expect(spy).toHaveBeenCalled();
		const output = spy.mock.calls.map((c) => c.join(" ")).join("\n");
		expect(output).toContain("ZeroAmount");
		spy.mockRestore();
	});

	it("should log error with args", () => {
		const decoded: DecodedError = {
			name: "InsufficientBalance",
			selector: "0xdb42144d",
			signature: "InsufficientBalance(address,uint256,uint256)",
			args: { user: "0xdead", requested: 1000n, available: 500n },
			rawArgs: ["0xdead", 1000n, 500n],
			contractName: "Vault",
		};

		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		logError(decoded);

		expect(spy).toHaveBeenCalled();
		const output = spy.mock.calls.map((c) => c.join(" ")).join("\n");
		expect(output).toContain("InsufficientBalance");
		spy.mockRestore();
	});
});
