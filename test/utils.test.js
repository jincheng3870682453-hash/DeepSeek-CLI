// test/utils.test.js — unit tests for cli-runner/utils.js (pure helpers, no DSH engine)
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import {
	VERSION,
	makeT,
	MODE_LABELS,
	displayWidth,
	padCjk,
	expandPath,
	isDirectory,
	maskKey,
	dshHome,
	customSkillDir,
	customPresetDir,
	createSkillTemplate,
	listCustomPresets
} from "../profiles/cli/cli-runner/utils.js";

let tmp;

beforeEach(() => {
	tmp = join(tmpdir(), `dsh-cli-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	process.env.DSH_HOME = tmp;
	process.env.USERPROFILE = tmp; // os.homedir() reads USERPROFILE on Windows
	process.env.HOME = tmp; // ...and HOME on Linux/macOS
});

afterEach(() => {
	delete process.env.DSH_HOME;
	delete process.env.USERPROFILE;
	delete process.env.HOME;
	rmSync(tmp, { recursive: true, force: true });
});

describe("VERSION / constants", () => {
	it("matches the packaged release", () => {
		expect(VERSION).toBe("1.3.0");
	});
	it("covers all three permission modes", () => {
		expect(Object.keys(MODE_LABELS).sort()).toEqual([
			"danger-full-access",
			"read-only",
			"workspace-write"
		]);
	});
});

describe("makeT", () => {
	it("returns the key itself when missing in both dictionaries", () => {
		expect(makeT("zh")("no.such.key")).toBe("no.such.key");
	});
	it("falls back to zh for unknown languages", () => {
		expect(makeT("xx")("bannerSub")).toBe("DeepSeek Harness · 交互式命令行 · v{0}");
	});
	it("substitutes {0} and {1} placeholders", () => {
		const t = makeT("zh");
		expect(t("modelSet", "deepseek-v4-flash", "official")).toBe("✓ 模型：deepseek-v4-flash (official)");
		expect(t("keySaved", "sk-******1234")).toBe("✓ API Key 已保存（sk-******1234）");
	});
	it("provides the English dictionary", () => {
		const t = makeT("en");
		expect(t("modelSet", "deepseek-v4-flash", "official")).toBe("✓ Model: deepseek-v4-flash (official)");
	});
});

describe("displayWidth", () => {
	it("counts ASCII as 1 column", () => {
		expect(displayWidth("DeepSeek")).toBe(8);
	});
	it("counts CJK as 2 columns", () => {
		expect(displayWidth("中文")).toBe(4);
	});
	it("mixes widths correctly", () => {
		expect(displayWidth("A中B")).toBe(4);
		expect(displayWidth("")).toBe(0);
	});
});

describe("padCjk", () => {
	it("pads to the display width", () => {
		expect(padCjk("ab", 4)).toBe("ab  ");
	});
	it("CJK-aware: two CJK chars occupy 4 columns", () => {
		expect(padCjk("中文", 6)).toBe("中文  ");
	});
	it("always keeps at least one gap", () => {
		expect(padCjk("中文", 3)).toBe("中文 ");
	});
});

describe("expandPath", () => {
	it("resolves ~ to the home directory", () => {
		expect(expandPath("~")).toBe(resolve(tmp));
	});
	it("resolves ~/child paths", () => {
		expect(expandPath("~/sub")).toBe(join(resolve(tmp), "sub"));
		expect(expandPath("~\\sub")).toBe(join(resolve(tmp), "sub"));
	});
	it("resolves relative paths against cwd", () => {
		expect(expandPath("a/b")).toBe(resolve("a/b"));
	});
});

describe("isDirectory", () => {
	it("true for a real directory", () => {
		mkdirSync(join(tmp, "dir"), { recursive: true });
		expect(isDirectory(join(tmp, "dir"))).toBe(true);
	});
	it("false for a file or a missing path", () => {
		mkdirSync(tmp, { recursive: true });
		writeFileSync(join(tmp, "f.txt"), "x");
		expect(isDirectory(join(tmp, "f.txt"))).toBe(false);
		expect(isDirectory(join(tmp, "nope"))).toBe(false);
	});
});

describe("maskKey", () => {
	it("keeps head and tail, masks the middle", () => {
		expect(maskKey("sk-abcdefgh1234")).toBe("sk-******1234");
	});
	it("masks short keys entirely", () => {
		expect(maskKey("short")).toBe("*****");
		expect(maskKey("")).toBe("");
	});
});

describe("dshHome & derived dirs", () => {
	it("respects $DSH_HOME", () => {
		expect(dshHome()).toBe(tmp);
	});
	it("derives the skill and preset roots", () => {
		expect(customSkillDir()).toBe(join(tmp, "skills"));
		expect(customPresetDir()).toBe(join(tmp, ".agent-presets"));
	});
});

describe("createSkillTemplate", () => {
	it("creates a SKILL.md template and reports its path", () => {
		const r = createSkillTemplate("my-skill");
		expect(r.ok).toBe(true);
		expect(r.path).toBe(join(tmp, "skills", "my-skill"));
		expect(existsSync(join(r.path, "SKILL.md"))).toBe(true);
	});
	it("refuses to overwrite an existing skill", () => {
		createSkillTemplate("dup");
		const second = createSkillTemplate("dup");
		expect(second.ok).toBe(false);
	});
});

describe("listCustomPresets", () => {
	it("returns [] when no preset root exists", () => {
		expect(listCustomPresets()).toEqual([]);
	});
	it("lists only dirs that hold agent.cordis.yml", () => {
		mkdirSync(join(tmp, ".agent-presets", "good"), { recursive: true });
		writeFileSync(join(tmp, ".agent-presets", "good", "agent.cordis.yml"), "name: good\n");
		mkdirSync(join(tmp, ".agent-presets", "empty"), { recursive: true });
		expect(listCustomPresets().sort()).toEqual(["good"]);
	});
});
