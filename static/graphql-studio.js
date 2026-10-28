import { useCallback as e, useEffect as t, useRef as n, useState as r } from "react";
import { useLocation as i } from "react-router-dom";
import { Button as a, FormField as o, IS_PRODUCTION as s, PageHeader as c, TextInput as l, api as u, extractErrorMessage as d, loadPluginModule as f, showToast as p, usePluginTranslation as m } from "@indramesh/plugin-api";
import { Fragment as h, jsx as g, jsxs as _ } from "react/jsx-runtime";
var v = {
	"nav.label": "GraphQL Studio",
	"page.title": "GraphQL Studio",
	"page.description": "Run queries interactively against /api/v1/graphql, and load or save them as Core saved queries.",
	"production.title": "Not for production",
	"production.banner": "Not intended for production. This editor enables /api/v1/graphql while the plugin is active.",
	"list.error": "Saved queries could not be loaded.",
	"field.name": "Name",
	query_only: "Only query operations are allowed. This document contains a mutation or subscription.",
	variables_invalid: "Variables must be a valid JSON object.",
	"action.reload": "Reload list",
	"action.save": "Save query",
	save_success: "Query saved.",
	save_failure: "The query could not be saved.",
	save_failure_detail: "The query could not be saved: {{reason}}",
	"heavy.heading": "Interactive editor",
	"heavy.loading": "Loading editor…",
	"heavy.retry": "Try again",
	"heavy.hint": "Runs live queries against /api/v1/graphql as you.",
	"heavy.failed_module": "The interactive editor could not be loaded. Try again, or use the GraphQL Library page.",
	"heavy.failed_styles": "The editor styles could not be applied, so the editor is unavailable. Try again; the rest of the page still works.",
	"heavy.failed_worker": "The editor worker could not start, so the editor is unavailable. Try again; other features still work.",
	"field.saved_query": "Saved query",
	"field.saved_query_new": "— New query —",
	"action.save_as_new": "Save as new",
	save_incomplete: "A name and a query are required.",
	"field.saved_query_search": "Search saved queries…",
	"field.saved_query_none": "No matching saved queries."
}, y = {
	"nav.label": "GraphQL Studio",
	"page.title": "GraphQL Studio",
	"page.description": "Führen Sie Abfragen interaktiv gegen /api/v1/graphql aus und laden oder speichern Sie sie als Core-Abfragen.",
	"production.title": "Nicht für Produktion",
	"production.banner": "Nicht für Produktivumgebungen gedacht. Dieser Editor schaltet /api/v1/graphql frei, solange das Plugin aktiv ist.",
	"list.error": "Gespeicherte Abfragen konnten nicht geladen werden.",
	"field.name": "Name",
	query_only: "Nur Query-Operationen sind erlaubt. Dieses Dokument enthält eine Mutation oder Subscription.",
	variables_invalid: "Variablen müssen ein gültiges JSON-Objekt sein.",
	"action.reload": "Liste neu laden",
	"action.save": "Abfrage speichern",
	save_success: "Abfrage gespeichert.",
	save_failure: "Die Abfrage konnte nicht gespeichert werden.",
	save_failure_detail: "Die Abfrage konnte nicht gespeichert werden: {{reason}}",
	"heavy.heading": "Interaktiver Editor",
	"heavy.loading": "Editor wird geladen…",
	"heavy.retry": "Erneut versuchen",
	"heavy.hint": "Führt Live-Abfragen gegen /api/v1/graphql als Sie selbst aus.",
	"heavy.failed_module": "Der interaktive Editor konnte nicht geladen werden. Versuchen Sie es erneut oder nutzen Sie die Seite „GraphQL-Bibliothek“.",
	"heavy.failed_styles": "Die Editor-Styles konnten nicht angewendet werden, daher ist der Editor nicht verfügbar. Versuchen Sie es erneut; der Rest der Seite funktioniert weiterhin.",
	"heavy.failed_worker": "Der Editor-Worker konnte nicht starten, daher ist der Editor nicht verfügbar. Versuchen Sie es erneut; andere Funktionen bleiben nutzbar.",
	"field.saved_query": "Gespeicherte Abfrage",
	"field.saved_query_new": "— Neue Abfrage —",
	"action.save_as_new": "Als neu speichern",
	save_incomplete: "Name und Abfrage sind erforderlich.",
	"field.saved_query_search": "Gespeicherte Abfragen durchsuchen…",
	"field.saved_query_none": "Keine passenden gespeicherten Abfragen."
}, b = Object.freeze({
	IDLE: "idle",
	LOADING: "loading",
	READY: "ready",
	FAILED: "failed"
}), x = Object.freeze({ LIST_LOAD_FAILED: "list_load_failed" });
function S({ onTransition: e } = {}) {
	let t = /* @__PURE__ */ new Set(), n = /* @__PURE__ */ new Set(), r = b.IDLE, i = null, a = 0, o = !1, s = 0;
	function c() {
		return {
			state: r,
			failure: i,
			generation: a,
			running: o
		};
	}
	function l() {
		let n = c();
		t.forEach((e) => {
			try {
				e(n);
			} catch {}
		}), typeof e == "function" && e(n);
	}
	function u(e, t = null) {
		r = e, i = t, l();
	}
	function d(e) {
		return e === a;
	}
	function f() {
		return r === b.LOADING ? {
			started: !1,
			generation: a
		} : (a += 1, u(b.LOADING, null), {
			started: !0,
			generation: a
		});
	}
	function p(e) {
		return !d(e) || r !== b.LOADING || u(b.READY, null), c();
	}
	function m(e, t = x.LIST_LOAD_FAILED) {
		return d(e) && u(b.FAILED, t), c();
	}
	function h() {
		return o || r !== b.READY ? {
			started: !1,
			runGeneration: s
		} : (o = !0, s += 1, l(), {
			started: !0,
			runGeneration: s
		});
	}
	function g(e) {
		return e === s && (o = !1, l()), c();
	}
	function _(e) {
		if (typeof e != "function") return null;
		let t = !1, r = () => {
			if (!t) {
				t = !0, n.delete(r);
				try {
					e();
				} catch {}
			}
		};
		return n.add(r), r;
	}
	function v() {
		[...n].forEach((e) => e());
	}
	function y() {
		return a += 1, s += 1, o = !1, v(), u(b.IDLE, null), c();
	}
	function S(e) {
		return t.add(e), () => t.delete(e);
	}
	return {
		getState: () => r,
		getFailure: () => i,
		getSnapshot: c,
		isRunning: () => o,
		isCurrent: d,
		beginLoad: f,
		loadSucceeded: p,
		loadFailed: m,
		beginRun: h,
		runFinished: g,
		trackResource: _,
		releaseResources: v,
		dispose: y,
		reset: y,
		subscribe: S
	};
}
// studio-heavy-state.js
var C = 1e4, w = Object.freeze({
	LAUNCHER: "launcher",
	LOADING: "loading",
	READY: "ready",
	FAILED: "failed"
}), T = Object.freeze({
	MODULE_LOAD_FAILED: "module_load_failed",
	STYLES_REFUSED: "styles_refused",
	WORKER_BLOCKED: "worker_blocked"
});
function E(e) {
	return e === T.WORKER_BLOCKED;
}
var D = Object.freeze({
	WORKER_CONSTRUCTION_FAILED: "worker_construction_failed",
	WORKER_PROTOCOL_UNAVAILABLE: "worker_protocol_unavailable",
	WORKER_TIMEOUT: "worker_timeout",
	WORKER_FAILURE: "worker_failure"
}), O = /* @__PURE__ */ new Set([w.LOADING]);
function k(e) {
	return e?.message ? String(e.message) : String(e);
}
function A({ timeoutMs: e = C, schedule: t = setTimeout, cancel: n = clearTimeout } = {}) {
	return function(r) {
		return new Promise((i) => {
			let a = !1, o = null, s = (e) => {
				a || (a = !0, o !== null && n(o), i(e));
			};
			o = t(() => s({
				ok: !1,
				reason: D.WORKER_TIMEOUT
			}), e), Promise.resolve().then(() => r()).then((e) => s(e && typeof e == "object" && "ok" in e ? e : { ok: !0 }), (e) => s({
				ok: !1,
				reason: D.WORKER_FAILURE,
				error: k(e)
			}));
		});
	};
}
function j({ timeoutMs: e = C, schedule: t = setTimeout, cancel: n = clearTimeout, onTransition: r } = {}) {
	let i = A({
		timeoutMs: e,
		schedule: t,
		cancel: n
	}), a = /* @__PURE__ */ new Set(), o = w.LAUNCHER, s = null, c = 0, l = 0;
	function u() {
		return {
			state: o,
			failure: s
		};
	}
	function d() {
		let e = u();
		a.forEach((t) => {
			try {
				t(e);
			} catch {}
		}), typeof r == "function" && r(e);
	}
	function f(e, t = null) {
		o = e, s = t, d();
	}
	function p(e) {
		return e === c;
	}
	function m() {
		return O.has(o) || o === w.READY;
	}
	function h() {
		return m() ? {
			started: !1,
			generation: c
		} : (c += 1, l += 1, f(w.LOADING, null), {
			started: !0,
			generation: c
		});
	}
	function g(e, t = T.MODULE_LOAD_FAILED) {
		return p(e) && f(w.FAILED, t), u();
	}
	function _(e, t = T.STYLES_REFUSED) {
		return p(e) && f(w.FAILED, t), u();
	}
	async function v(e, t) {
		if (!p(e) || o !== w.LOADING) return u();
		let n = ++l, r = await i(t);
		return n !== l || !p(e) || (r.ok ? f(w.READY, null) : f(w.FAILED, T.WORKER_BLOCKED)), u();
	}
	function y(e, t = T.WORKER_BLOCKED) {
		return p(e) && f(w.FAILED, t), u();
	}
	function b() {
		return c += 1, l += 1, f(w.LAUNCHER, null), u();
	}
	function x(e) {
		return a.add(e), () => a.delete(e);
	}
	return {
		getState: () => o,
		getFailure: () => s,
		getSnapshot: u,
		getGeneration: () => c,
		isCurrent: p,
		isActive: m,
		beginLoad: h,
		moduleLoadFailed: g,
		stylesRefused: _,
		awaitWorkerReadiness: v,
		workerBlocked: y,
		reset: b,
		subscribe: x
	};
}
// index.jsx
var M = "graphql-studio", N = 500, P = "studio";
function F(e) {
	let t = (e ?? "").trim();
	if (!t) return {
		ok: !0,
		value: null
	};
	try {
		let e = JSON.parse(t);
		return typeof e != "object" || !e || Array.isArray(e) ? {
			ok: !1,
			value: null
		} : {
			ok: !0,
			value: e
		};
	} catch {
		return {
			ok: !1,
			value: null
		};
	}
}
function I(e) {
	return /(^|\n)\s*(mutation|subscription)\b/.test(e ?? "");
}
function L() {
	let e = n(null);
	e.current === null && (e.current = S());
	let i = e.current, [a, o] = r(() => i.getSnapshot());
	return t(() => i.subscribe(o), [i]), t(() => () => i.dispose(), [i]), [i, a];
}
function R(e) {
	if (!e || typeof e.querySelectorAll != "function") return !1;
	let t = e.querySelectorAll("style[data-plugin-owner=\"graphql-studio\"]");
	for (let e of t) if (e.sheet === null) return !0;
	return !1;
}
function z({ initialDocument: i }) {
	let { t: o } = m(M), s = n(null);
	s.current === null && (s.current = j());
	let c = s.current, [l, d] = r(() => c.getSnapshot()), p = n(null), h = n(null);
	t(() => c.subscribe(d), [c]);
	let v = e(() => {
		h.current &&= (h.current.unmount(), null), p.current && p.current.replaceChildren();
	}, []);
	t(() => () => {
		v(), c.reset();
	}, [c, v]);
	let y = e(async ({ query: e, variables: t, operationName: n }) => (await u.post("/api/v1/graphql", {
		query: e,
		variables: t,
		operationName: n
	}, { baseURL: "/" })).data, []), b = e(async () => {
		let { started: e, generation: t } = c.beginLoad();
		if (!e) return;
		v();
		let n = await f(M, P);
		if (!c.isCurrent(t)) return;
		if (!n?.ok) {
			c.moduleLoadFailed(t);
			return;
		}
		let r = n.module?.mountStudioEditor;
		if (typeof r != "function") {
			c.moduleLoadFailed(t);
			return;
		}
		let i = r(p.current, {
			pluginName: M,
			fetcher: y,
			labels: { hint: o("heavy.hint", "Runs live queries against /api/v1/graphql as you.") }
		});
		h.current = i, R(document.head) ? (v(), c.stylesRefused(t)) : (await c.awaitWorkerReadiness(t, i.probe)).state === w.READY ? i.render() : v();
	}, [
		c,
		v,
		y,
		o
	]), x = n(b);
	t(() => {
		x.current = b;
	}, [b]), t(() => {
		x.current();
	}, []);
	let S = e(() => {
		v(), c.reset(), b();
	}, [
		c,
		v,
		b
	]);
	return /* @__PURE__ */ _("section", {
		className: "min-w-0 space-y-3",
		"aria-label": o("heavy.heading", "Interactive editor"),
		"data-testid": "graphql-studio-heavy-panel",
		children: [
			l.state === w.LOADING || l.state === w.LAUNCHER ? /* @__PURE__ */ _("div", {
				className: "rounded-lg border bg-card p-4 space-y-3",
				"aria-busy": "true",
				"data-testid": "graphql-studio-heavy-loading",
				children: [/* @__PURE__ */ g("p", {
					className: "text-sm text-muted-foreground",
					children: o("heavy.loading", "Loading editor…")
				}), /* @__PURE__ */ _("div", {
					className: "space-y-2",
					"aria-hidden": "true",
					children: [/* @__PURE__ */ g("div", { className: "h-4 w-1/3 animate-pulse rounded bg-muted" }), /* @__PURE__ */ g("div", { className: "h-24 w-full animate-pulse rounded bg-muted" })]
				})]
			}) : null,
			l.state === w.FAILED ? /* @__PURE__ */ _("div", {
				className: "rounded-lg border border-destructive bg-card p-4 space-y-4",
				role: "alert",
				"data-testid": "graphql-studio-heavy-failed",
				"data-failure": l.failure,
				children: [/* @__PURE__ */ g("p", {
					className: "text-sm text-destructive",
					children: l.failure === T.STYLES_REFUSED ? o("heavy.failed_styles", "The editor styles could not be applied, so the editor is unavailable. Try again; the rest of the page still works.") : E(l.failure) ? o("heavy.failed_worker", "The editor worker could not start, so the editor is unavailable. Try again; other features still work.") : o("heavy.failed_module", "The interactive editor could not be loaded. Try again, or use the GraphQL Library page.")
				}), /* @__PURE__ */ g("div", {
					className: "flex flex-wrap items-start gap-2",
					children: /* @__PURE__ */ g(a, {
						type: "button",
						variant: "outline",
						size: "sm",
						className: "h-auto min-h-8 whitespace-normal px-4 py-2 font-semibold",
						"data-testid": "graphql-studio-heavy-retry",
						onClick: S,
						children: o("heavy.retry", "Try again")
					})
				})]
			}) : null,
			l.state === w.READY ? /* @__PURE__ */ g(V, {
				controllerRef: h,
				initialDocument: i
			}) : null,
			/* @__PURE__ */ g("div", {
				ref: p,
				className: "min-w-0 overflow-x-hidden",
				"data-testid": "graphql-studio-heavy-mount"
			})
		]
	});
}
function B({ id: e, items: i, selectedId: a, onSelect: o, disabled: s, newLabel: c, searchPlaceholder: u, emptyLabel: d }) {
	let [f, p] = r(!1), [m, v] = r(""), [y, b] = r(0), x = n(null), S = `${e}-listbox`, C = i.find((e) => e.id === a), w = m.trim().toLowerCase(), T = w ? i.filter((e) => (e.name ?? "").toLowerCase().includes(w) || (e.query_text ?? "").toLowerCase().includes(w)) : i, E = [{
		id: "",
		name: c
	}, ...T];
	t(() => {
		f && x.current?.querySelector(`[data-index="${y}"]`)?.scrollIntoView?.({ block: "nearest" });
	}, [f, y]);
	let D = () => {
		v(""), b(0), p(!0);
	}, O = (e) => {
		p(!1), v(""), o(e.id);
	};
	return /* @__PURE__ */ _("div", {
		className: "relative",
		children: [/* @__PURE__ */ g(l, {
			id: e,
			"data-testid": "graphql-studio-load",
			role: "combobox",
			"aria-expanded": f,
			"aria-controls": S,
			"aria-autocomplete": "list",
			"aria-activedescendant": f ? `${e}-option-${y}` : void 0,
			autoComplete: "off",
			disabled: s,
			placeholder: f ? u : c,
			value: f ? m : C?.name ?? "",
			onFocus: D,
			onClick: () => {
				f || D();
			},
			onBlur: () => p(!1),
			onChange: (e) => {
				v(e.target.value), b(+!!e.target.value.trim()), p(!0);
			},
			onKeyDown: (e) => {
				if (e.key === "ArrowDown" || e.key === "ArrowUp") {
					if (e.preventDefault(), !f) {
						D();
						return;
					}
					let t = e.key === "ArrowDown" ? 1 : -1;
					b((e) => Math.min(Math.max(e + t, 0), E.length - 1));
				} else if (e.key === "Enter" && f) {
					e.preventDefault();
					let t = E[y];
					t && O(t);
				} else e.key === "Escape" && f && (e.preventDefault(), p(!1), v(""));
			}
		}), f ? /* @__PURE__ */ _("ul", {
			ref: x,
			id: S,
			role: "listbox",
			className: "absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-popover py-1 text-popover-foreground shadow-lg",
			"data-testid": "graphql-studio-load-list",
			children: [E.map((t, n) => /* @__PURE__ */ g("li", {
				id: `${e}-option-${n}`,
				"data-index": n,
				role: "option",
				"aria-selected": n === y,
				onMouseDown: (e) => e.preventDefault(),
				onClick: () => O(t),
				onMouseEnter: () => b(n),
				className: "cursor-pointer px-3 py-1.5 " + (n === y ? "bg-accent text-accent-foreground " : "") + (t.id === "" ? "text-sm text-muted-foreground" : ""),
				"data-testid": t.id ? "graphql-studio-load-option-" + t.id : "graphql-studio-load-option-new",
				children: t.id ? /* @__PURE__ */ _(h, { children: [/* @__PURE__ */ g("span", {
					className: "block truncate text-sm font-semibold",
					children: t.name
				}), /* @__PURE__ */ g("span", {
					className: "block truncate font-mono text-xs text-muted-foreground",
					children: t.query_text ?? ""
				})] }) : t.name
			}, t.id || "new")), T.length === 0 && w ? /* @__PURE__ */ g("li", {
				className: "px-3 py-1.5 text-sm text-muted-foreground",
				"aria-disabled": "true",
				children: d
			}) : null]
		}) : null]
	});
}
function V({ controllerRef: n, initialDocument: i }) {
	let { t: s } = m(M), [c, f] = L(), h = f.state === b.LOADING, [v, y] = r([]), [x, S] = r(null), [C, w] = r(i?.id ?? ""), [T, E] = r(i?.name ?? ""), [D, O] = r(!1), [k, A] = r(null);
	t(() => {
		i && n.current?.setDocument(i);
	}, [n, i]);
	let j = e(async () => {
		let { started: e, generation: t } = c.beginLoad();
		if (!e) return;
		S(null);
		let n = new AbortController(), r = c.trackResource(() => n.abort());
		try {
			let e = await u.get("/saved-queries/", {
				params: {
					skip: 0,
					limit: N
				},
				signal: n.signal
			});
			if (!c.isCurrent(t)) return;
			y(Array.isArray(e.data) ? e.data : []), c.loadSucceeded(t);
		} catch (e) {
			if (!c.isCurrent(t)) return;
			S(d(e)), c.loadFailed(t);
		} finally {
			typeof r == "function" && r();
		}
	}, [c]);
	t(() => {
		j();
	}, [j]);
	let P = (e) => {
		w(e), A(null);
		let t = v.find((t) => t.id === e);
		t ? (E(t.name ?? ""), n.current?.setDocument({
			query: t.query_text ?? "",
			variables: t.variables ? JSON.stringify(t.variables, null, 2) : ""
		})) : (E(""), n.current?.setDocument({
			query: "",
			variables: ""
		}));
	}, R = async ({ asNew: e }) => {
		let t = n.current?.getDocument();
		if (!t || D) return;
		if (!T.trim() || !t.query.trim()) {
			A(s("save_incomplete", "A name and a query are required."));
			return;
		}
		if (I(t.query)) {
			A(s("query_only", "Only query operations are allowed. This document contains a mutation or subscription."));
			return;
		}
		let r = F(t.variables);
		if (!r.ok) A(s("variables_invalid", "Variables must be a valid JSON object."));
		else {
			O(!0), A(null);
			try {
				let n = {
					name: T.trim(),
					query_text: t.query,
					variables: r.value
				}, i = C && !e ? (await u.patch(`/saved-queries/${C}`, n)).data : (await u.post("/saved-queries/", n)).data;
				p(s("save_success", "Query saved.")), await j(), w(i.id), E(i.name ?? T);
			} catch (e) {
				A(s("save_failure_detail", "The query could not be saved: {{reason}}", { reason: d(e) })), p(s("save_failure", "The query could not be saved."), { type: "error" });
			} finally {
				O(!1);
			}
		}
	};
	return /* @__PURE__ */ _("div", {
		className: "space-y-2 rounded-lg border bg-card p-3",
		"data-testid": "graphql-studio-saved-bar",
		children: [
			/* @__PURE__ */ _("div", {
				className: "flex flex-wrap items-end gap-3",
				children: [
					/* @__PURE__ */ g("div", {
						className: "min-w-64 flex-1",
						children: /* @__PURE__ */ g(o, {
							id: "graphql-studio-load",
							label: s("field.saved_query", "Saved query"),
							children: /* @__PURE__ */ g(B, {
								id: "graphql-studio-load",
								items: v,
								selectedId: C,
								onSelect: P,
								disabled: h,
								newLabel: s("field.saved_query_new", "— New query —"),
								searchPlaceholder: s("field.saved_query_search", "Search saved queries…"),
								emptyLabel: s("field.saved_query_none", "No matching saved queries.")
							})
						})
					}),
					/* @__PURE__ */ g("div", {
						className: "min-w-64 flex-1",
						children: /* @__PURE__ */ g(o, {
							id: "graphql-studio-name",
							label: s("field.name", "Name"),
							required: !0,
							children: /* @__PURE__ */ g(l, {
								id: "graphql-studio-name",
								"data-testid": "graphql-studio-name",
								value: T,
								maxLength: 255,
								onChange: (e) => E(e.target.value)
							})
						})
					}),
					/* @__PURE__ */ _("div", {
						className: "flex flex-wrap items-center gap-2",
						children: [
							/* @__PURE__ */ g(a, {
								type: "button",
								variant: "primary",
								size: "md",
								onClick: () => void R({ asNew: !1 }),
								loading: D,
								disabled: D,
								className: "h-auto min-h-9 whitespace-normal font-semibold",
								"data-testid": "graphql-studio-save",
								children: s("action.save", "Save query")
							}),
							C ? /* @__PURE__ */ g(a, {
								type: "button",
								variant: "outline",
								size: "md",
								onClick: () => void R({ asNew: !0 }),
								disabled: D,
								className: "h-auto min-h-9 whitespace-normal",
								"data-testid": "graphql-studio-save-as-new",
								children: s("action.save_as_new", "Save as new")
							}) : null,
							/* @__PURE__ */ g(a, {
								type: "button",
								variant: "outline",
								size: "md",
								onClick: () => void j(),
								disabled: h,
								className: "h-auto min-h-9 whitespace-normal",
								"data-testid": "graphql-studio-reload",
								children: s("action.reload", "Reload list")
							})
						]
					})
				]
			}),
			x ? /* @__PURE__ */ _("p", {
				role: "alert",
				className: "text-sm text-destructive",
				"data-testid": "graphql-studio-list-error",
				children: [
					s("list.error", "Saved queries could not be loaded."),
					" ",
					x
				]
			}) : null,
			k ? /* @__PURE__ */ g("p", {
				role: "alert",
				className: "text-sm text-destructive",
				"data-testid": "graphql-studio-save-error",
				children: k
			}) : null
		]
	});
}
function H() {
	let { t: e } = m(M), t = i();
	return /* @__PURE__ */ _("div", {
		className: "space-y-6",
		"data-testid": "graphql-studio-page",
		children: [
			s ? /* @__PURE__ */ _("div", {
				role: "status",
				"data-testid": "graphql-studio-production-banner",
				className: "rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
				children: [/* @__PURE__ */ g("p", {
					className: "font-semibold",
					children: e("production.title", "Not for production")
				}), /* @__PURE__ */ g("p", { children: e("production.banner", "Not intended for production. This editor enables /api/v1/graphql while the plugin is active.") })]
			}) : null,
			/* @__PURE__ */ g(c, {
				title: e("page.title", "GraphQL Studio"),
				description: e("page.description", "Run queries interactively against /api/v1/graphql, and load or save them as Core saved queries."),
				icon: "square-terminal"
			}),
			/* @__PURE__ */ g(z, { initialDocument: t.state?.studioDocument }, t.key)
		]
	});
}
var U = {
	translations: {
		en: v,
		de: y
	},
	pages: [{
		id: "graphql-studio-page",
		path: "studio",
		component: H
	}],
	navItems: [{
		id: "graphql-studio-nav",
		label: "GraphQL Studio",
		labelKey: "nav.label",
		path: "/plugins/graphql-studio/studio",
		icon: "square-terminal",
		group: "Tools",
		permission: "graphql-studio:use"
	}]
};
export { U as default };
