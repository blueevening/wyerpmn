/* smoke: load app.js in a minimal DOM/localStorage mock and exercise key flows */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = "C:/Users/21941/XiaomiMiMoProjects/.mimo-sessions/2026-09-12/文员ERP";
const src = fs.readFileSync(path.join(root, "app.js"), "utf8");

const store = {};
const localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};

const handlers = {};
const el = {
  innerHTML: "",
  id: "app",
  addEventListener: (t, fn) => { handlers[t] = fn; },
  appendChild: () => {},
};
const document = {
  readyState: "complete",
  getElementById: (id) => (id === "app" ? el : null),
  createElement: () => ({ click: () => {}, set href(v) {}, get href() { return ""; }, download: "" }),
  addEventListener: (t, fn) => { handlers["doc:" + t] = fn; },
  body: { appendChild: () => {} },
  querySelectorAll: () => [],
};
let printed = false;
const window = { print: () => { printed = true; } };
const confirmFn = () => true;

const sandbox = {
  console,
  localStorage,
  document,
  window,
  confirm: confirmFn,
  alert: () => {},
  URL: { createObjectURL: () => "blob:x", revokeObjectURL: () => {} },
  Blob: function () {},
  Date, Math, JSON, Number, String, Array, Object, Set, Map, RegExp, Error,
  parseInt, parseFloat, isNaN, Boolean,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

let failed = 0;
function ok(cond, msg) {
  if (cond) console.log("PASS", msg);
  else { console.log("FAIL", msg); failed++; }
}

function click(attrs) {
  // attrs: {data-act, data-nav, data-menu, data-id}
  const target = {
    closest: (sel) => {
      if (sel === "[data-menu]" && attrs["data-menu"]) return { dataset: { menu: attrs["data-menu"] } };
      if (sel === "[data-nav]" && attrs["data-nav"]) return { dataset: { nav: attrs["data-nav"] } };
      if (sel === "[data-act]" && attrs["data-act"]) {
        return { dataset: Object.assign({}, attrs, { act: attrs["data-act"] }) };
      }
      return null;
    },
  };
  handlers.click({ target });
}

try {
  vm.runInContext(src, sandbox, { filename: "app.js" });
  ok(true, "app.js loaded without throw");
} catch (e) {
  ok(false, "app.js load: " + e.stack);
  process.exit(1);
}

const html0 = el.innerHTML;
ok(html0.includes("管家婆辉煌版") || html0.includes("工作台"), "boot rendered shell");
ok(html0.includes("实训任务"), "task banner present on home");

// source-level feature presence
ok(src.includes("sales-return") && src.includes("purchase-return"), "return routes in source");
ok(src.includes("XSTH-") && src.includes("CGTH-"), "return doc number prefixes");
ok(src.includes("rpt-invsum") && src.includes("进销存汇总"), "invsum route");
ok(src.includes("rpt-reconcile") && src.includes("往来对账"), "reconcile route");
ok(src.includes("将超卖"), "oversell warning text");
ok(src.includes("Ctrl+S") || src.includes("ctrlKey"), "keyboard shortcuts");
ok(src.includes("@media print") || fs.readFileSync(path.join(root, "styles.css"), "utf8").includes("@media print"), "print styles");
ok(src.includes("logAction"), "operation logging");

// seed
const raw = store["gjp-erp-clerk-v1"];
ok(!!raw, "seed saved to localStorage");
const db = JSON.parse(raw);
ok(db.v === 2, "db v2");
ok(db.salesReturns.length >= 1, "seed salesReturns");
ok(db.purchaseReturns.length >= 1, "seed purchaseReturns");
ok(db.stockChecks.length >= 1, "seed stockChecks");
ok(Array.isArray(db.logs), "logs array");
ok(db.counters.xsth != null && db.counters.cgth != null, "return counters");
ok(db.flags && typeof db.flags.exportedInv === "boolean", "export flag");

// navigate menus
click({ "data-menu": "sales" });
ok(el.innerHTML.includes("销售退货"), "sales menu shows 销售退货");
click({ "data-nav": "sales-return" });
ok(el.innerHTML.includes("销售退货单列表") || el.innerHTML.includes("新增销售退货"), "sales return page");
click({ "data-act": "new-xsth" });
ok(el.innerHTML.includes("库存变动预览") || el.innerHTML.includes("销售退货"), "xsth form with preview");
click({ "data-act": "cancel-xsth" });

click({ "data-menu": "purchase" });
ok(el.innerHTML.includes("采购退货"), "purchase menu shows 采购退货");
click({ "data-nav": "purchase-return" });
ok(el.innerHTML.includes("采购退货单列表") || el.innerHTML.includes("新增采购退货"), "purchase return page");

click({ "data-menu": "rpt" });
ok(el.innerHTML.includes("进销存汇总") && el.innerHTML.includes("往来对账"), "report menu new pages");
click({ "data-nav": "rpt-invsum" });
ok(el.innerHTML.includes("期初") && el.innerHTML.includes("期末"), "invsum table headers");
click({ "data-nav": "rpt-reconcile" });
ok(el.innerHTML.includes("结存"), "reconcile table");

click({ "data-menu": "stock" });
click({ "data-nav": "stock-check" });
ok(el.innerHTML.includes("盘点"), "stock check page");
click({ "data-act": "new-pdd" });
ok(el.innerHTML.includes("实盘") || el.innerHTML.includes("盘点"), "pdd form");

click({ "data-menu": "home" });
click({ "data-nav": "tasks" });
ok(el.innerHTML.includes("L1") && el.innerHTML.includes("L6"), "tasks L1-L6");
click({ "data-nav": "sys-logs" });
ok(el.innerHTML.includes("操作日志") || el.innerHTML.includes("时间"), "logs page");

// Ctrl+S on empty forms -> info modal (no throw)
handlers["doc:keydown"]({ key: "s", ctrlKey: true, preventDefault: () => {}, target: { tagName: "BODY", blur: () => {} } });
ok(el.innerHTML.includes("系统提示") || el.innerHTML.includes("快捷键") || el.innerHTML.includes("Ctrl"), "Ctrl+S feedback");

// Esc closes modal
handlers["doc:keydown"]({ key: "Escape", preventDefault: () => {}, target: { tagName: "BODY", blur: () => {} } });

console.log(failed ? "SMOKE FAILED: " + failed : "SMOKE OK");
process.exit(failed ? 1 : 0);
