// config.js — settings and credentials persistence for the CLI.
// Settings live in $DSH_HOME/cli-settings.json; API keys in the shared
// $DSH_HOME/.credentials.yaml (same store as the web Models page).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { dshHome } from "./utils.js";

/** The CLI's own settings file under $DSH_HOME. */
export function settingsPath() {
	return join(dshHome(), "cli-settings.json");
}

/** Load settings; tolerant of a missing file and a UTF-8 BOM (PowerShell writes one). */
export function loadSettings() {
	try {
		const raw = readFileSync(settingsPath(), "utf8").replace(/^\uFEFF/, "");
		const parsed = JSON.parse(raw);
		return {
			mode: typeof parsed.mode === "string" ? parsed.mode : "workspace-write",
			cwd: typeof parsed.cwd === "string" && existsSync(parsed.cwd) ? parsed.cwd : process.cwd(),
			provider: typeof parsed.provider === "string" ? parsed.provider : "deepseek-official",
			model: typeof parsed.model === "string" ? parsed.model : "deepseek-v4-flash",
			showReasoning: parsed.showReasoning === true,
			effort: typeof parsed.effort === "string" ? parsed.effort : "off",
			preset: typeof parsed.preset === "string" ? parsed.preset : "standard",
			language: typeof parsed.language === "string" ? parsed.language : "zh",
			busyAction: typeof parsed.busyAction === "string" ? parsed.busyAction : "queue",
			cwdHistory: Array.isArray(parsed.cwdHistory) ? parsed.cwdHistory.filter((p) => typeof p === "string" && existsSync(p)).slice(0, 10) : []
		};
	} catch {
		return { mode: "workspace-write", cwd: process.cwd(), provider: "deepseek-official", model: "deepseek-v4-flash", showReasoning: false, effort: "off", preset: "standard", language: "zh", busyAction: "queue", cwdHistory: [] };
	}
}

/** Persist settings (best-effort). */
export function saveSettings(s) {
	try {
		const file = settingsPath();
		mkdirSync(join(file, ".."), { recursive: true });
		writeFileSync(file, JSON.stringify(s, null, 2), "utf8");
	} catch {
		// persistence is best-effort
	}
}

/** The credentials document path (same store the web Models page writes). */
export function credentialsPath() {
	return join(dshHome(), ".credentials.yaml");
}

/** Whether a DEEPSEEK_API_KEY is present in the credentials document. */
export function apiKeyConfigured() {
	try {
		const raw = readFileSync(credentialsPath(), "utf8");
		return /\bDEEPSEEK_API_KEY\s*:\s*["']?[^\s"']+/.test(raw);
	} catch {
		return false;
	}
}

/** Write (or replace) the DEEPSEEK_API_KEY in the credentials document. */
export function saveApiKey(key) {
	const file = credentialsPath();
	mkdirSync(dirname(file), { recursive: true });
	let content = "";
	if (existsSync(file)) {
		content = readFileSync(file, "utf8")
			.split("\n")
			.filter((line) => {
				const t = line.trim();
				return !t.startsWith("DEEPSEEK_API_KEY") && !t.startsWith("#");
			})
			.join("\n")
			.trim();
		if (content !== "") content += "\n";
	}
	content += `DEEPSEEK_API_KEY: "${key}"\n`;
	writeFileSync(file, content, { encoding: "utf8", mode: 0o600 });
}
