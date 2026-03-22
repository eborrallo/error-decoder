import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	parseSolidityStringConstants,
	writeShortStringCodesFromSolidity,
} from "../src/helpers/shortStringCodesGen.js";

describe("parseSolidityStringConstants", () => {
	it("parses file-level string constant (no library)", () => {
		const src = `
pragma solidity 0.8.30;
string constant Plain1 = "P1";
string constant Plain2 = "P2";
`;
		const pairs = parseSolidityStringConstants(src);
		expect(pairs).toEqual([
			{ name: "Plain1", code: "P1" },
			{ name: "Plain2", code: "P2" },
		]);
	});

	it("parses library-wrapped constants", () => {
		const src = `
pragma solidity 0.8.30;
library L {
    string internal constant ErrorText1 = "A1";
    string internal constant ErrorText2 = "A2";
}
`;
		const pairs = parseSolidityStringConstants(src);
		expect(pairs).toEqual([
			{ name: "ErrorText1", code: "A1" },
			{ name: "ErrorText2", code: "A2" },
		]);
	});

	it("parses contract and private visibility", () => {
		const src = `
pragma solidity 0.8.30;
contract C {
    string private constant Z = "Z9";
}
`;
		const pairs = parseSolidityStringConstants(src);
		expect(pairs).toEqual([{ name: "Z", code: "Z9" }]);
	});

	it("parses public constant", () => {
		const src = `
library L {
    string public constant Q = "Q1";
}
`;
		expect(parseSolidityStringConstants(src)).toEqual([
			{ name: "Q", code: "Q1" },
		]);
	});

	it("rejects duplicate short code with different names", () => {
		const src = `
string constant A = "X1";
string constant B = "X1";
`;
		expect(() => parseSolidityStringConstants(src)).toThrow(
			/Duplicate short code "X1"/,
		);
	});

	it("merges multiple declarations in one file (library + file-level)", () => {
		const src = `
pragma solidity 0.8.30;
string constant Top = "T1";
library L {
    string internal constant InLib = "L1";
}
`;
		const pairs = parseSolidityStringConstants(src);
		expect(pairs).toEqual([
			{ name: "Top", code: "T1" },
			{ name: "InLib", code: "L1" },
		]);
	});
});

describe("writeShortStringCodesFromSolidity (multi-file)", () => {
	it("merges two Solidity files", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "edc-"));
		const a = path.join(dir, "a.sol");
		const b = path.join(dir, "b.sol");
		fs.writeFileSync(a, 'pragma solidity 0.8.30;\nstring constant X = "M1";\n');
		fs.writeFileSync(b, 'pragma solidity 0.8.30;\nstring constant Y = "M2";\n');
		const out = path.join(dir, "out.ts");
		const { count } = writeShortStringCodesFromSolidity({
			inputPaths: [a, b],
			outputPath: out,
			cwd: dir,
			regenerateHint: "test",
		});
		expect(count).toBe(2);
		const generated = fs.readFileSync(out, "utf8");
		expect(generated).toContain("M1");
		expect(generated).toContain("M2");
		fs.rmSync(dir, { recursive: true, force: true });
	});
});
