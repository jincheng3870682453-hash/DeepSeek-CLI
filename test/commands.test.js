// test/commands.test.js — unit tests for slash-command parsing (pure, no I/O)
import { describe, it, expect } from "vitest";
import { parseCommand } from "../profiles/cli/cli-runner/commands.js";

describe("parseCommand", () => {
	it("parses a bare command", () => {
		expect(parseCommand("/exit")).toEqual({ cmd: "exit", rest: [], arg: "" });
	});

	it("parses a command with one argument", () => {
		expect(parseCommand("/mode read-only")).toEqual({ cmd: "mode", rest: ["read-only"], arg: "read-only" });
	});

	it("parses a command with multiple arguments", () => {
		expect(parseCommand("/preset new my-agent")).toEqual({ cmd: "preset", rest: ["new", "my-agent"], arg: "new my-agent" });
	});

	it("rejoins argument tokens with spaces (paths with spaces survive)", () => {
		expect(parseCommand("/cd C:\\my dir")).toEqual({ cmd: "cd", rest: ["C:\\my", "dir"], arg: "C:\\my dir" });
	});

	it("tolerates leading/trailing whitespace", () => {
		expect(parseCommand("  /lang en  ")).toEqual({ cmd: "lang", rest: ["en"], arg: "en" });
	});

	it("collapses runs of whitespace between tokens", () => {
		expect(parseCommand("/busy   queue")).toEqual({ cmd: "busy", rest: ["queue"], arg: "queue" });
	});

	it("returns null for plain messages", () => {
		expect(parseCommand("hello world")).toBeNull();
	});

	it("returns null for empty / whitespace-only input", () => {
		expect(parseCommand("")).toBeNull();
		expect(parseCommand("   ")).toBeNull();
	});

	it("returns null for non-string input", () => {
		expect(parseCommand(null)).toBeNull();
		expect(parseCommand(undefined)).toBeNull();
		expect(parseCommand(42)).toBeNull();
	});

	it("handles a lone slash like the runner's split semantics (unknown command)", () => {
		expect(parseCommand("/")).toEqual({ cmd: "", rest: [], arg: "" });
	});
});
