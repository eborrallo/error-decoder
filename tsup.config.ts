import { defineConfig } from "tsup";

export default defineConfig([
	{
		entry: {
			index: "src/index.ts",
			"extract/index": "src/extract/index.ts",
			"decode/index": "src/decode/index.ts",
			"format/index": "src/format/index.ts",
			"viem/index": "src/viem/index.ts",
		},
		format: ["esm", "cjs"],
		dts: true,
		sourcemap: true,
		clean: true,
		splitting: true,
		treeshake: true,
		target: "node18",
		external: ["viem"],
	},
	{
		entry: {
			"cli/generate": "src/cli/generate.ts",
		},
		format: ["esm"],
		sourcemap: true,
		target: "node18",
		banner: {
			js: "#!/usr/bin/env node",
		},
		platform: "node",
		external: ["viem", "commander", "chalk"],
	},
]);
