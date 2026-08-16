// test/menu.test.js — unit tests for the arrow-key menu controller.
// Navigation is driven directly via onKey(), so no readline is needed:
// a capture stdout + no-op colors are enough.
import { describe, it, expect } from "vitest";
import { createMenuController, makePalette } from "../profiles/cli/cli-runner/menu.js";
import { makeT } from "../profiles/cli/cli-runner/utils.js";

function makeCtx(tty = true) {
	let text = "";
	const io = {
		stdin: { isTTY: tty },
		stdout: {
			isTTY: tty,
			write: (s) => {
				text += s;
			}
		}
	};
	const menu = createMenuController(io, makePalette(false), makeT("zh"), tty);
	return { menu, io, get text() { return text; } };
}

const options = [
	{ label: "A", value: "a" },
	{ label: "B", value: "b" },
	{ label: "C", value: "c" }
];

describe("createMenuController", () => {
	it("renders the title, options and nav hint on open", async () => {
		const ctx = makeCtx();
		const promise = ctx.menu.pick("标题", options);
		expect(ctx.menu.isOpen()).toBe(true);
		const lines = ctx.text.split("\n");
		expect(lines[0]).toContain("标题");
		expect(lines[1]).toContain("❯ A"); // cursor starts on the first option
		expect(lines[2]).toContain("B");
		expect(lines.some((l) => l.includes("↑↓"))).toBe(true);
		ctx.menu.close(null);
		await promise;
	});

	it("down/up move the cursor and wrap around", async () => {
		const ctx = makeCtx();
		const promise = ctx.menu.pick("t", options);
		ctx.menu.onKey(undefined, { name: "down" });
		ctx.menu.onKey(undefined, { name: "down" });
		// The last draw is the tail of the accumulated output.
		const tail = () => ctx.text.split("\n").slice(-6).join("\n");
		expect(tail()).toContain("❯ C");
		ctx.menu.onKey(undefined, { name: "down" });
		expect(tail()).toContain("❯ A"); // wraps back to the top
		ctx.menu.close(null);
		await promise;
	});

	it("Enter resolves with the selected option and closes", async () => {
		const ctx = makeCtx();
		const promise = ctx.menu.pick("t", options);
		ctx.menu.onKey(undefined, { name: "down" });
		ctx.menu.onKey(undefined, { name: "enter" });
		expect(await promise).toEqual({ label: "B", value: "b" });
		expect(ctx.menu.isOpen()).toBe(false);
	});

	it("Enter arms consumeLine to drop the following 'line' event exactly once", async () => {
		const ctx = makeCtx();
		const promise = ctx.menu.pick("t", options);
		ctx.menu.onKey(undefined, { name: "enter" });
		await promise;
		expect(ctx.menu.consumeLine("")).toBe(true);
		expect(ctx.menu.consumeLine("")).toBe(false);
	});

	it("escape cancels with null", async () => {
		const ctx = makeCtx();
		const promise = ctx.menu.pick("t", options);
		ctx.menu.onKey(undefined, { name: "escape" });
		expect(await promise).toBeNull();
		expect(ctx.menu.isOpen()).toBe(false);
	});

	it("numeric keys pick the matching option", async () => {
		const ctx = makeCtx();
		const promise = ctx.menu.pick("t", options);
		ctx.menu.onKey("3", { name: "3" });
		expect(await promise).toEqual({ label: "C", value: "c" });
	});

	it("out-of-range numbers are ignored", async () => {
		const ctx = makeCtx();
		const promise = ctx.menu.pick("t", options);
		ctx.menu.onKey("9", { name: "9" });
		expect(ctx.menu.isOpen()).toBe(true);
		ctx.menu.close(null);
		await promise;
	});

	it("onKey returns false when no menu is open (keys pass through)", () => {
		const ctx = makeCtx();
		expect(ctx.menu.onKey(undefined, { name: "up" })).toBe(false);
		expect(ctx.menu.isOpen()).toBe(false);
	});

	it("reopens cleanly after a close (state resets)", async () => {
		const ctx = makeCtx();
		const first = ctx.menu.pick("t", options);
		ctx.menu.onKey(undefined, { name: "enter" });
		await first;
		const second = ctx.menu.pick("t2", options);
		ctx.menu.onKey(undefined, { name: "down" });
		ctx.menu.onKey(undefined, { name: "enter" });
		expect(await second).toEqual({ label: "B", value: "b" });
	});

	it("non-TTY sessions do not arm line swallowing", async () => {
		const ctx = makeCtx(false);
		const promise = ctx.menu.pick("t", options);
		ctx.menu.onKey(undefined, { name: "enter" });
		await promise;
		expect(ctx.menu.consumeLine("")).toBe(false);
	});
});
