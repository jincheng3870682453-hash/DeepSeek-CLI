// test/config.test.js — unit tests for cli-runner/config.js (settings & credentials persistence)
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import {
	settingsPath,
	loadSettings,
	saveSettings,
	credentialsPath,
	apiKeyConfigured,
	saveApiKey
} from "../profiles/cli/cli-runner/config.js";

let tmp;

beforeEach(() => {
	tmp = join(tmpdir(), `dsh-cli-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	process.env.DSH_HOME = tmp;
});

afterEach(() => {
	delete process.env.DSH_HOME;
	rmSync(tmp, { recursive: true, force: true });
});

const defaults = {
	mode: "workspace-write",
	provider: "deepseek-official",
	model: "deepseek-v4-flash",
	showReasoning: false,
	effort: "high",
	preset: "standard",
	language: "zh",
	busyAction: "queue",
	cwdHistory: []
};

describe("loadSettings", () => {
	it("returns defaults when the file is missing", () => {
		const s = loadSettings();
		expect(s).toMatchObject(defaults);
		expect(typeof s.cwd).toBe("string");
	});

	it("tolerates a UTF-8 BOM (PowerShell writes one)", () => {
		mkdirSync(tmp, { recursive: true });
		writeFileSync(
			join(tmp, "cli-settings.json"),
			"\uFEFF" + JSON.stringify({ mode: "read-only", model: "custom-model" }),
			"utf8"
		);
		const s = loadSettings();
		expect(s.mode).toBe("read-only");
		expect(s.model).toBe("custom-model");
		expect(s.language).toBe("zh"); // untouched fields keep defaults
	});

	it("returns defaults on invalid JSON", () => {
		mkdirSync(tmp, { recursive: true });
		writeFileSync(join(tmp, "cli-settings.json"), "{ not json !!", "utf8");
		expect(loadSettings()).toMatchObject(defaults);
	});

	it("ignores a cwd that no longer exists", () => {
		mkdirSync(tmp, { recursive: true });
		writeFileSync(
			join(tmp, "cli-settings.json"),
			JSON.stringify({ cwd: join(tmp, "gone-dir") }),
			"utf8"
		);
		expect(loadSettings().cwd).toBe(process.cwd());
	});

	it("keeps only real cwdHistory entries, capped at 10", () => {
		mkdirSync(tmp, { recursive: true });
		const real = join(tmp, "real");
		mkdirSync(real, { recursive: true });
		const fake = join(tmp, "fake");
		const hist = Array.from({ length: 15 }, (_, i) => (i % 2 ? real : fake));
		writeFileSync(join(tmp, "cli-settings.json"), JSON.stringify({ cwdHistory: hist }), "utf8");
		const s = loadSettings();
		expect(s.cwdHistory.length).toBeLessThanOrEqual(10);
		expect(s.cwdHistory.every((p) => p === real)).toBe(true);
	});
});

describe("saveSettings round-trip", () => {
	it("persists and reloads identical values", () => {
		const want = { ...defaults, mode: "danger-full-access", language: "en", showReasoning: true, cwd: process.cwd() };
		saveSettings(want);
		expect(existsSync(join(tmp, "cli-settings.json"))).toBe(true);
		expect(loadSettings()).toEqual(want);
	});
});

describe("credentials", () => {
	it("credentialsPath points under $DSH_HOME", () => {
		expect(credentialsPath()).toBe(join(tmp, ".credentials.yaml"));
	});

	it("apiKeyConfigured is false without a credentials file", () => {
		expect(apiKeyConfigured()).toBe(false);
	});

	it("saveApiKey creates the file and is detected", () => {
		saveApiKey("sk-test-1234");
		expect(apiKeyConfigured()).toBe(true);
		const raw = readFileSync(join(tmp, ".credentials.yaml"), "utf8");
		expect(raw).toContain('DEEPSEEK_API_KEY: "sk-test-1234"');
	});

	it("saveApiKey replaces an old key and drops comments", () => {
		mkdirSync(tmp, { recursive: true });
		writeFileSync(
			join(tmp, ".credentials.yaml"),
			"# 网络凭据，请勿提交到 git\nDEEPSEEK_API_KEY: \"sk-old-key\"\nOTHER: keep-me\n",
			"utf8"
		);
		saveApiKey("sk-new-key");
		const raw = readFileSync(join(tmp, ".credentials.yaml"), "utf8");
		expect(raw).not.toContain("sk-old-key");
		expect(raw).not.toContain("#");
		expect(raw).toContain('DEEPSEEK_API_KEY: "sk-new-key"');
		expect(raw).toContain("OTHER: keep-me");
	});
});
