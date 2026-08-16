// commands.js — pure slash-command parsing for the CLI. No I/O, no state:
// feed it one line of user input, get back a command object or null.

/**
 * Parse a slash-command line into { cmd, arg, rest }.
 * - "/mode read-only"            → { cmd: "mode", rest: ["read-only"], arg: "read-only" }
 * - "/preset new my-agent"       → { cmd: "preset", rest: ["new", "my-agent"], arg: "new my-agent" }
 * - "/cd C:\my dir"              → { cmd: "cd", rest: ["C:\my", "dir"], arg: "C:\my dir" }
 * - "hello" / ""                 → null (not a command)
 * - "/"                          → { cmd: "", rest: [], arg: "" } (matches the runner's
 *                                   existing split semantics; handled as unknown)
 * @param {string} line - raw user input (leading/trailing whitespace tolerated).
 * @returns {{cmd: string, rest: string[], arg: string} | null}
 */
export function parseCommand(line) {
	if (typeof line !== "string") return null;
	const text = line.trim();
	if (!text.startsWith("/")) return null;
	const [cmd, ...rest] = text.slice(1).split(/\s+/);
	return { cmd, rest, arg: rest.join(" ").trim() };
}
