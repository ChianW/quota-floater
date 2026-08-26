/**
 * Quota Floater bridge for Pi.
 * Runs the local Token Monitor probe (collect.js). Does not invent HTTP.
 * No secrets in UI.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const ROOT = "C:\\Users\\wangq\\Desktop\\quota-floater";
const COLLECT = join(ROOT, "collect.js");
const SNAPSHOT = join(ROOT, "snapshot.json");
const STATUS_ID = "quota-floater";

function readSnapshot(): any | null {
	try {
		const raw = readFileSync(SNAPSHOT);
		const text =
			raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf
				? raw.subarray(3).toString("utf8")
				: raw.toString("utf8");
		return JSON.parse(text);
	} catch {
		return null;
	}
}

function pct(n: unknown): string {
	return typeof n === "number" && Number.isFinite(n) ? `${n}%` : "-";
}

function fmtReset(iso: unknown): string {
	if (!iso || typeof iso !== "string") return "-";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "-";
	const mm = String(d.getMonth() + 1).padStart(2, "0");
	const dd = String(d.getDate()).padStart(2, "0");
	const hh = String(d.getHours()).padStart(2, "0");
	const mi = String(d.getMinutes()).padStart(2, "0");
	return `${mm}-${dd} ${hh}:${mi}`;
}

function pick(windows: any[], kind: string) {
	return (windows || []).find((w) => w && w.kind === kind) || null;
}

function formatLines(snap: any): string[] {
	const lines = ["PLATFORM     MODEL            5H       WEEK     MONTH    RESET          USAGE"];
	for (const p of snap.providers || []) {
		if (!p) continue;
		const ws = Array.isArray(p.windows) ? p.windows : [];
		const s = pick(ws, "session");
		const w = pick(ws, "weekly");
		const m = pick(ws, "billing") || pick(ws, "monthly");
		const reset = fmtReset((s && s.resetsAt) || (w && w.resetsAt) || (m && m.resetsAt));
		const model = String(p.plan || p.name || p.id || "").slice(0, 16);
		const usage = String(p.usage || p.note || "-");
		lines.push(
			`${String(p.name || p.id).padEnd(12).slice(0, 12)} ${model.padEnd(16).slice(0, 16)} ${pct(s && s.remainPct).padEnd(8)} ${pct(w && w.remainPct).padEnd(8)} ${pct(m && m.remainPct).padEnd(8)} ${reset.padEnd(14)} ${usage}`,
		);
	}
	const n = (snap.providers || []).length;
	const probe = snap.elapsedMs != null ? ` probe ${snap.elapsedMs}ms` : "";
	lines.push(`${n} providers${probe}`);
	return lines;
}

function compactStatus(snap: any): string {
	const bits: string[] = [];
	for (const p of snap.providers || []) {
		if (!p || typeof p.lowestPct !== "number") continue;
		bits.push(`${p.name}:${p.lowestPct}%`);
	}
	return bits.length ? bits.join(" ") : "quota n/a";
}

function runCollect(): Promise<{ ok: boolean; detail: string }> {
	return new Promise((resolve) => {
		const child = spawn("node", [COLLECT], {
			cwd: ROOT,
			windowsHide: true,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let err = "";
		child.stderr.on("data", (buf) => {
			err += String(buf);
		});
		const timer = setTimeout(() => {
			child.kill();
			resolve({ ok: false, detail: "probe timeout" });
		}, 60_000);
		child.on("close", (code) => {
			clearTimeout(timer);
			if (code === 0) resolve({ ok: true, detail: "" });
			else resolve({ ok: false, detail: err.trim().slice(0, 120) || `exit ${code}` });
		});
		child.on("error", (e) => {
			clearTimeout(timer);
			resolve({ ok: false, detail: e instanceof Error ? e.message : "spawn failed" });
		});
	});
}

function show(ctx: ExtensionContext, snap: any) {
	const lines = formatLines(snap);
	ctx.ui.setWidget(STATUS_ID, lines);
	ctx.ui.setStatus(STATUS_ID, compactStatus(snap));
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("quota", {
		description: "Official remaining quota via Token Monitor probe (collect.js)",
		handler: async (_args, ctx) => {
			ctx.ui.setStatus(STATUS_ID, "quota probing...");
			const result = await runCollect();
			const snap = readSnapshot();
			if (!snap) {
				ctx.ui.notify(result.ok ? "quota: no snapshot" : `quota failed: ${result.detail}`, "error");
				return;
			}
			show(ctx, snap);
			if (!result.ok) ctx.ui.notify(`quota probe: ${result.detail}`, "warning");
			else ctx.ui.notify("quota updated", "info");
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		const snap = readSnapshot();
		if (snap) {
			ctx.ui.setStatus(STATUS_ID, compactStatus(snap));
		}
	});
}
