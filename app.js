/* 进销存单证实训沙盘 · 文员后台模拟（独立实现，非任何商业 ERP 官方产品） */
(function () {
  "use strict";

  const KEY = "gjp-erp-clerk-v1";
  const THEME_KEY = "gjp-erp-theme"; // light | dark | auto
  const DB_VERSION = 3;
  const TOUR_VERSION = 2; /* 教程大改后 +1：老账套会自动重开新教程 */
  const TASK_DEFAULT = {
    baseProduct: false, baseSupplier: false,
    poSubmit: false, poReceive: false,
    soSubmit: false, soShip: false,
    returnConfirm: false, stockConfirm: false,
    exportInv: false,
  };
  let today = new Date();

  /* 跨夜/长时间挂机后回到页面：自动把“今天”和新单默认日期推到当天 */
  function refreshToday() {
    const now = new Date();
    if (now.toDateString() === today.toDateString()) return false;
    const oldDate = fmtD(today);
    today = now;
    [state.poForm, state.soForm, state.xsthForm, state.cgthForm, state.pddForm].forEach((f) => {
      if (f && f.date === oldDate) f.date = fmtD(now);
    });
    ["rptTo", "ledTo", "moveTo", "invTo"].forEach((k) => {
      if (state.f[k] === oldDate) state.f[k] = fmtD(now);
    });
    return true;
  }

  /* 数据损坏 / 写入失败 / 多窗口冲突的恢复状态 */
  let loadError = null;
  let corruptRaw = "";
  let lastSaveFailAt = 0;

  /* ---------- 主题：跟随系统 + 手动切换（独立于业务数据） ---------- */
  function applyTheme() {
    try {
      if (typeof document === "undefined" || !document.documentElement) return;
      const saved = localStorage.getItem(THEME_KEY) || "auto";
      let mode = saved;
      if (saved === "auto") {
        const mq = (typeof window !== "undefined" && window.matchMedia)
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
          : false;
        mode = mq ? "dark" : "light";
      }
      const root = document.documentElement;
      if (root) root.setAttribute("data-theme", mode);
    } catch (e) { /* 测试环境无 DOM，忽略 */ }
  }
  function toggleTheme() {
    let next = "dark";
    try {
      const cur = (typeof document !== "undefined" && document.documentElement)
        ? document.documentElement.getAttribute("data-theme")
        : "light";
      const saved = localStorage.getItem(THEME_KEY) || "auto";
      // 若当前是 auto，则按当前实际渲染色反向切；否则按 saved 反向
      if (saved === "auto") next = (cur === "dark") ? "light" : "dark";
      else next = (saved === "dark") ? "light" : "dark";
      localStorage.setItem(THEME_KEY, next);
    } catch (e) {}
    applyTheme();
    render();
  }

  /* 搜索输入防抖（仅前端 UI，不影响业务逻辑） */
  const _debounceTimer = {};
  function debounceRender(key, delay) {
    if (typeof setTimeout !== "function") { render(); return; }
    if (_debounceTimer[key]) clearTimeout(_debounceTimer[key]);
    _debounceTimer[key] = setTimeout(() => { _debounceTimer[key] = null; render(); }, delay || 220);
  }
  const fmtD = (d) =>
    d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const fmtDT = (ts) => {
    const d = new Date(ts);
    return (
      fmtD(d) +
      " " +
      String(d.getHours()).padStart(2, "0") +
      ":" +
      String(d.getMinutes()).padStart(2, "0")
    );
  };
  const money = (n) => Number(n || 0).toFixed(2);
  const pad = (n, w) => String(n).padStart(w, "0");
  const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

  function uid(p) {
    return p + "_" + Math.random().toString(36).slice(2, 10);
  }

  /* 从编码后缀取最大序号 +1，删除后不撞号 */
  function nextSeqCode(prefix, list) {
    let max = 0;
    (list || []).forEach((x) => {
      const m = String(x && x.code || "").match(new RegExp("^" + prefix + "-(\\d+)$"));
      if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
    });
    return prefix + "-" + pad(max + 1, 3);
  }

  /* 手机号 / 座机号格式 */
  function isPhone(v) {
    const s = String(v || "").trim();
    if (!s) return true; // 选填
    return /^1[3-9]\d{9}$/.test(s) || /^0\d{2,3}-?\d{7,8}(-\d{1,5})?$/.test(s);
  }

  /* CSV 单元格：防止公式注入 + 含逗号/引号/换行时加引号 */
  function csvCell(v) {
    let s = String(v == null ? "" : v);
    // 仅对文本做转义；数字（含负数）保持原样，避免 Excel 把金额当文本
    if (typeof v !== "number" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function daysAgo(n) {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return fmtD(d);
  }

  /* ---------- 种子数据：虚构演示账套 ---------- */
  function seed() {
    const products = [
      { id: "P001", code: "SP-001", name: "原味花生", spec: "500g/包", unit: "包", category: "农副食品", cost: 8.5, price: 12.8, minStock: 20, active: true },
      { id: "P002", code: "SP-002", name: "老友粉(袋装)", spec: "120g*5/袋", unit: "袋", category: "农副食品", cost: 15.0, price: 22.0, minStock: 15, active: true },
      { id: "P003", code: "SP-003", name: "桂林米粉", spec: "1kg/袋", unit: "袋", category: "农副食品", cost: 9.8, price: 15.5, minStock: 20, active: true },
      { id: "P004", code: "SP-004", name: "白砂糖", spec: "400g/袋", unit: "袋", category: "农副食品", cost: 5.2, price: 7.9, minStock: 30, active: true },
      { id: "P005", code: "SP-005", name: "酱油(海天)", spec: "500ml/瓶", unit: "瓶", category: "调味品", cost: 9.0, price: 13.5, minStock: 24, active: true },
      { id: "P006", code: "SP-006", name: "食盐(加碘)", spec: "350g/袋", unit: "袋", category: "调味品", cost: 1.8, price: 2.5, minStock: 50, active: true },
      { id: "P007", code: "SP-007", name: "抽纸(三层)", spec: "120抽*10/提", unit: "提", category: "日用百货", cost: 18.0, price: 26.0, minStock: 12, active: true },
      { id: "P008", code: "SP-008", name: "洗衣皂", spec: "202g/块", unit: "块", category: "日用百货", cost: 3.5, price: 5.5, minStock: 40, active: true },
      { id: "P009", code: "SP-009", name: "洗洁精", spec: "500g/瓶", unit: "瓶", category: "日用百货", cost: 7.2, price: 11.0, minStock: 20, active: true },
      { id: "P010", code: "SP-010", name: "垃圾袋(中号)", spec: "50只/卷", unit: "卷", category: "日用百货", cost: 4.0, price: 6.5, minStock: 30, active: true },
      { id: "P011", code: "SP-011", name: "豆豉鲮鱼罐头", spec: "227g/罐", unit: "罐", category: "罐头食品", cost: 12.5, price: 18.0, minStock: 15, active: true },
      { id: "P012", code: "SP-012", name: "八宝粥", spec: "370g*6/组", unit: "组", category: "罐头食品", cost: 16.0, price: 24.0, minStock: 10, active: true },
    ];

    const suppliers = [
      { id: "S001", code: "GYS-001", name: "南宁桂味食品有限公司", contact: "黄经理", phone: "0771-2888111", addr: "南宁市江南区食品城A栋", active: true },
      { id: "S002", code: "GYS-002", name: "广西盐业集团南宁公司", contact: "韦主管", phone: "0771-2888222", addr: "南宁市青秀区民族大道", active: true },
      { id: "S003", code: "GYS-003", name: "柳州市日杂批发部", contact: "罗老板", phone: "0772-2888333", addr: "柳州市柳南区批发市场", active: true },
      { id: "S004", code: "GYS-004", name: "北海水产食品加工厂", contact: "陈厂长", phone: "0779-2888444", addr: "北海市海城区工业园", active: true },
    ];

    const customers = [
      { id: "C001", code: "KH-001", name: "老街坊便利店（建政店）", contact: "李店长", phone: "13877110001", addr: "南宁市青秀区建政路", active: true },
      { id: "C002", code: "KH-002", name: "邕宁惠民超市", contact: "周经理", phone: "13877110002", addr: "南宁市邕宁区蒲庙镇", active: true },
      { id: "C003", code: "KH-003", name: "西乡塘社区团购点", contact: "吴团长", phone: "13877110003", addr: "南宁市西乡塘区大学路", active: true },
      { id: "C004", code: "KH-004", name: "江南批发部（二级）", contact: "赵老板", phone: "13877110004", addr: "南宁市江南区五一西路", active: true },
      { id: "C005", code: "KH-005", name: "武鸣区联华小卖部", contact: "陆老板", phone: "13877110005", addr: "南宁市武鸣区城厢镇", active: true },
    ];

    const stock = {};
    products.forEach((p) => {
      stock[p.id] = 0;
    });
    // 期初
    const openQty = {
      P001: 80, P002: 45, P003: 60, P004: 100, P005: 72, P006: 200,
      P007: 36, P008: 150, P009: 48, P010: 90, P011: 30, P012: 18,
    };
    Object.keys(openQty).forEach((k) => (stock[k] = openQty[k]));

    const moves = [];
    products.forEach((p) => {
      if (openQty[p.id] > 0) {
        moves.push({
          id: uid("M"), date: daysAgo(30), type: "期初",
          productCode: p.code, productName: p.name, unit: p.unit,
          qty: openQty[p.id], refNo: "QC-INIT", operator: "系统", note: "期初建账",
        });
      }
    });

    // 历史采购入库（已审核执行）
    const po1 = {
      id: "PO1", no: "CGRK-" + fmtD(today).replace(/-/g, "").slice(0, 8) + "-0001",
      supplierId: "S001", date: daysAgo(12), status: "已入库",
      lines: [
        { productId: "P001", qty: 60, price: 8.5, receivedQty: 60 },
        { productId: "P002", qty: 40, price: 15.0, receivedQty: 40 },
      ],
      createdBy: "文员小陈", createdAt: Date.now() - 86400000 * 12,
      note: "常规补货",
      timeline: [
        { act: "录入草稿", who: "文员小陈", at: Date.now() - 86400000 * 12 },
        { act: "财务审核通过", who: "财务主管", at: Date.now() - 86400000 * 12 + 3600000 },
        { act: "仓库入库确认", who: "仓管老黄", at: Date.now() - 86400000 * 12 + 7200000 },
      ],
    };
    po1.lines.forEach((l) => {
      const p = products.find((x) => x.id === l.productId);
      stock[l.productId] += l.qty;
      moves.push({
        id: uid("M"), date: po1.date, type: "采购入库",
        productCode: p.code, productName: p.name, unit: p.unit,
        qty: l.qty, refNo: po1.no, operator: "仓管老黄", note: "",
      });
    });

    const po2 = {
      id: "PO2", no: "CGRK-" + fmtD(today).replace(/-/g, "").slice(0, 8) + "-0002",
      supplierId: "S003", date: daysAgo(7), status: "已入库",
      lines: [
        { productId: "P007", qty: 24, price: 18.0, receivedQty: 24 },
        { productId: "P008", qty: 80, price: 3.5, receivedQty: 80 },
        { productId: "P009", qty: 30, price: 7.2, receivedQty: 30 },
      ],
      createdBy: "文员小陈", createdAt: Date.now() - 86400000 * 7,
      note: "日百补货",
      timeline: [
        { act: "录入草稿", who: "文员小陈", at: Date.now() - 86400000 * 7 },
        { act: "财务审核通过", who: "财务主管", at: Date.now() - 86400000 * 7 + 3600000 },
        { act: "仓库入库确认", who: "仓管老黄", at: Date.now() - 86400000 * 7 + 7200000 },
      ],
    };
    po2.lines.forEach((l) => {
      const p = products.find((x) => x.id === l.productId);
      stock[l.productId] += l.qty;
      moves.push({
        id: uid("M"), date: po2.date, type: "采购入库",
        productCode: p.code, productName: p.name, unit: p.unit,
        qty: l.qty, refNo: po2.no, operator: "仓管老黄", note: "",
      });
    });

    // 待审核采购单（文员刚录的）
    const po3 = {
      id: "PO3", no: "CGRK-" + fmtD(today).replace(/-/g, "").slice(0, 8) + "-0003",
      supplierId: "S001", date: daysAgo(0), status: "待审核",
      lines: [{ productId: "P004", qty: 50, price: 5.2 }],
      createdBy: "文员小陈", createdAt: Date.now() - 3600000,
      note: "白砂糖补货",
      timeline: [{ act: "录入并提交审核", who: "文员小陈", at: Date.now() - 3600000 }],
    };

    // 历史销售
    const so1 = {
      id: "SO1", no: "XSCK-" + fmtD(today).replace(/-/g, "").slice(0, 8) + "-0001",
      customerId: "C001", date: daysAgo(5), status: "已出库",
      lines: [
        { productId: "P001", qty: 20, price: 12.8, shippedQty: 20 },
        { productId: "P005", qty: 12, price: 13.5, shippedQty: 12 },
        { productId: "P006", qty: 30, price: 2.5, shippedQty: 30 },
      ],
      createdBy: "文员小陈", createdAt: Date.now() - 86400000 * 5,
      note: "",
      timeline: [
        { act: "录入草稿", who: "文员小陈", at: Date.now() - 86400000 * 5 },
        { act: "财务审核通过", who: "财务主管", at: Date.now() - 86400000 * 5 + 1800000 },
        { act: "仓库出库确认", who: "仓管老黄", at: Date.now() - 86400000 * 5 + 3600000 },
      ],
    };
    so1.lines.forEach((l) => {
      const p = products.find((x) => x.id === l.productId);
      stock[l.productId] = Math.max(0, stock[l.productId] - l.qty);
      moves.push({
        id: uid("M"), date: so1.date, type: "销售出库",
        productCode: p.code, productName: p.name, unit: p.unit,
        qty: -l.qty, refNo: so1.no, operator: "仓管老黄", note: "",
      });
    });

    const so2 = {
      id: "SO2", no: "XSCK-" + fmtD(today).replace(/-/g, "").slice(0, 8) + "-0002",
      customerId: "C002", date: daysAgo(3), status: "部分出库",
      lines: [
        { productId: "P003", qty: 10, price: 15.5, shippedQty: 10 },
        { productId: "P011", qty: 8, price: 18.0, shippedQty: 0 },
      ],
      createdBy: "文员小陈", createdAt: Date.now() - 86400000 * 3,
      note: "先发部分",
      timeline: [
        { act: "录入草稿", who: "文员小陈", at: Date.now() - 86400000 * 3 },
        { act: "财务审核通过", who: "财务主管", at: Date.now() - 86400000 * 3 + 1800000 },
        { act: "部分出库（P003×10）", who: "仓管老黄", at: Date.now() - 86400000 * 2 },
      ],
    };
    // 部分出库只出 P003
    {
      const p = products.find((x) => x.id === "P003");
      stock.P003 = Math.max(0, stock.P003 - 10);
      moves.push({
        id: uid("M"), date: daysAgo(2), type: "销售出库",
        productCode: p.code, productName: p.name, unit: p.unit,
        qty: -10, refNo: so2.no, operator: "仓管老黄", note: "部分出库",
      });
    }

    const so3 = {
      id: "SO3", no: "XSCK-" + fmtD(today).replace(/-/g, "").slice(0, 8) + "-0003",
      customerId: "C004", date: daysAgo(0), status: "草稿",
      lines: [{ productId: "P010", qty: 15, price: 6.5 }],
      createdBy: "文员小陈", createdAt: Date.now() - 1800000,
      note: "待完善后提交",
      timeline: [{ act: "创建草稿", who: "文员小陈", at: Date.now() - 1800000 }],
    };

    /* 种子：一笔销售退货、一笔采购退货、一笔盘点 */
    const xsth1 = {
      id: "XSTH1",
      no: "XSTH-" + fmtD(today).replace(/-/g, "") + "-0001",
      date: daysAgo(2),
      customerId: "C001",
      soId: "SO1",
      soNo: so1.no,
      lines: [{ productId: "P001", qty: 5, price: 12.8 }],
      status: "已退货",
      createdBy: "文员小陈",
      createdAt: Date.now() - 86400000 * 2,
      note: "客户拆包破损退货",
      timeline: [
        { act: "录入退货草稿", who: "文员小陈", at: Date.now() - 86400000 * 2 },
        { act: "提交待审", who: "文员小陈", at: Date.now() - 86400000 * 2 + 600000 },
        { act: "模拟仓管确认（库存回加）", who: "仓管老黄", at: Date.now() - 86400000 * 2 + 1200000 },
      ],
    };
    xsth1.lines.forEach((l) => {
      const p = products.find((x) => x.id === l.productId);
      stock[l.productId] += l.qty;
      moves.push({
        id: uid("M"), date: xsth1.date, type: "销售退货",
        productCode: p.code, productName: p.name, unit: p.unit,
        qty: l.qty, refNo: xsth1.no, operator: "仓管老黄", note: "退货入库",
      });
    });

    const cgth1 = {
      id: "CGTH1",
      no: "CGTH-" + fmtD(today).replace(/-/g, "") + "-0001",
      date: daysAgo(1),
      supplierId: "S003",
      poId: "PO2",
      poNo: po2.no,
      lines: [{ productId: "P008", qty: 6, price: 3.5 }],
      status: "已退货",
      createdBy: "文员小陈",
      createdAt: Date.now() - 86400000,
      note: "到货破损退回供应商",
      timeline: [
        { act: "录入退货草稿", who: "文员小陈", at: Date.now() - 86400000 },
        { act: "提交待审", who: "文员小陈", at: Date.now() - 86400000 + 600000 },
        { act: "模拟仓管确认（库存扣减）", who: "仓管老黄", at: Date.now() - 86400000 + 1200000 },
      ],
    };
    cgth1.lines.forEach((l) => {
      const p = products.find((x) => x.id === l.productId);
      stock[l.productId] = Math.max(0, stock[l.productId] - l.qty);
      moves.push({
        id: uid("M"), date: cgth1.date, type: "采购退货",
        productCode: p.code, productName: p.name, unit: p.unit,
        qty: -l.qty, refNo: cgth1.no, operator: "仓管老黄", note: "退货出库",
      });
    });

    const pdd1 = {
      id: "PDD1",
      no: "PDD-" + fmtD(today).replace(/-/g, "") + "-0001",
      date: daysAgo(15),
      warehouse: "主仓",
      status: "已盘点",
      note: "月末例行盘点，差异已由仓管确认",
      createdBy: "文员小陈",
      createdAt: Date.now() - 86400000 * 15,
      lines: [
        { productId: "P001", bookQty: 80, realQty: 80 },
        { productId: "P004", bookQty: 100, realQty: 98 },
      ],
      timeline: [
        { act: "录入盘点单", who: "文员小陈", at: Date.now() - 86400000 * 15 },
        { act: "提交待审", who: "文员小陈", at: Date.now() - 86400000 * 15 + 600000 },
        { act: "模拟仓管确认（差异入账）", who: "仓管老黄", at: Date.now() - 86400000 * 15 + 3600000 },
      ],
    };

    /* 种子盘点差异必须真实入账：P004 盘亏 2，否则「已盘点」与库存自相矛盾 */
    {
      const p = products.find((x) => x.id === "P004");
      const diff = 98 - 100;
      stock.P004 = 98;
      pdd1.lines[1].confirmBookQty = 100;
      moves.push({
        id: uid("M"), date: pdd1.date, type: "盘点调整", productId: "P004",
        productCode: p.code, productName: p.name, unit: p.unit,
        qty: diff, refNo: pdd1.no, operator: "仓管老黄", note: "种子盘点差异入账（盘亏 2）",
      });
    }

    /* 历史流水补主键：后续所有报表按 productId 聚合，编码/名称只作快照 */
    moves.forEach((m) => {
      if (!m.productId) {
        const p = products.find((x) => x.code === m.productCode);
        if (p) m.productId = p.id;
      }
    });

    const logs = [      { id: uid("LG"), at: Date.now() - 86400000 * 15, who: "文员小陈", act: "盘点确认", detail: "盘点单 " + pdd1.no },
      { id: uid("LG"), at: Date.now() - 86400000 * 2, who: "文员小陈", act: "销售退货确认", detail: "退货单 " + xsth1.no },
      { id: uid("LG"), at: Date.now() - 86400000, who: "文员小陈", act: "采购退货确认", detail: "退货单 " + cgth1.no },
    ];

    return {
      v: DB_VERSION,
      rev: 0,
      updatedAt: Date.now(),
      products,
      suppliers,
      customers,
      stock,
      purchases: [po1, po2, po3],
      sales: [so1, so2, so3],
      salesReturns: [xsth1],
      purchaseReturns: [cgth1],
      stockChecks: [pdd1],
      moves,
      logs,
      counters: { po: 3, so: 3, xsth: 1, cgth: 1, pdd: 1 },
      flags: { exportedInv: false, tasks: Object.assign({}, TASK_DEFAULT) },
      user: { name: "文员小陈", role: "商务文员" },
      company: "南宁云岭商贸有限公司（虚构演示）",
      tourOn: true,
      tourStep: 0,
      tourDone: false,
      tourVer: TOUR_VERSION,
    };
  }

  function migrate(d) {
    if (!d || typeof d !== "object") return seed();
    /* 旧账套沿用旧公司名（可能是真实企业名），迁移为虚构演示主体 */
    const LEGACY_COMPANIES = ["广西老街坊商贸有限公司"];
    if (LEGACY_COMPANIES.indexOf(d.company) !== -1) d.company = "南宁云岭商贸有限公司（虚构演示）";
    if (!d.products) d.products = [];
    if (!d.suppliers) d.suppliers = [];
    if (!d.customers) d.customers = [];
    if (!d.stock) d.stock = {};
    if (!d.moves) d.moves = [];
    if (!d.purchases) d.purchases = [];
    if (!d.sales) d.sales = [];
    if (!d.salesReturns) d.salesReturns = [];
    if (!d.purchaseReturns) d.purchaseReturns = [];
    if (!d.stockChecks) d.stockChecks = [];
    if (!d.logs) d.logs = [];
    if (!d.counters) d.counters = { po: 3, so: 3, xsth: 0, cgth: 0, pdd: 0 };
    if (d.counters.xsth == null) d.counters.xsth = 0;
    if (d.counters.cgth == null) d.counters.cgth = 0;
    if (d.counters.pdd == null) d.counters.pdd = 0;
    if (!d.flags) d.flags = {};
    if (!d.flags.tasks) d.flags.tasks = Object.assign({}, TASK_DEFAULT);
    else d.flags.tasks = Object.assign({}, TASK_DEFAULT, d.flags.tasks);
    if (d.rev == null) d.rev = 0;
    if (!d.updatedAt) d.updatedAt = Date.now();

    /* 流水补 productId：先按编码，再按唯一名称；无法唯一确定则保留空值并在报表单列 */
    const byCode = {};
    const byName = {};
    d.products.forEach((p) => {
      byCode[p.code] = p;
      if (!byName[p.name]) byName[p.name] = [];
      byName[p.name].push(p);
    });
    d.moves.forEach((m) => {
      if (m.productId) return;
      let p = m.productCode ? byCode[m.productCode] : null;
      if (!p && m.productName && byName[m.productName] && byName[m.productName].length === 1) {
        p = byName[m.productName][0];
      }
      if (p) m.productId = p.id;
    });

    const moveSum = (refNo, type, productId) =>
      d.moves
        .filter((m) => m.refNo === refNo && m.type === type && (!productId || m.productId === productId))
        .reduce((s, m) => s + Math.abs(Number(m.qty) || 0), 0);

    /* 采购/销售明细补「已执行数量」，用于部分入库/出库与红冲 */
    d.purchases.forEach((po) => {
      (po.lines || []).forEach((l) => {
        if (l.receivedQty == null) {
          const fromMoves = moveSum(po.no, "采购入库", l.productId);
          l.receivedQty = po.status === "已入库" ? (fromMoves || l.qty) : fromMoves;
        }
      });
    });
    d.sales.forEach((so) => {
      (so.lines || []).forEach((l) => {
        if (l.shippedQty == null) {
          const fromMoves = moveSum(so.no, "销售出库", l.productId);
          l.shippedQty = fromMoves || (so.status === "已出库" ? l.qty : 0);
        }
      });
    });
    d.stockChecks.forEach((d0) => {
      (d0.lines || []).forEach((l) => {
        if (l.confirmBookQty == null) l.confirmBookQty = l.bookQty;
      });
    });

    /* 教程升级：旧账套只重开教程，不动业务数据 */
    if (d.tourVer !== TOUR_VERSION) {
      d.tourVer = TOUR_VERSION;
      d.tourOn = true;
      d.tourStep = 0;
      d.tourDone = false;
    }

    d.v = DB_VERSION;
    return d;
  }

  function load() {
    let raw = null;
    try {
      raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        const version = d && typeof d.v === "number" ? d.v : 1; /* 老账套无版本号按 v1 迁移 */
        if (d && version <= DB_VERSION) return migrate(d);
        throw new Error("账套版本不兼容（v" + (d && d.v) + "）");
      }
    } catch (e) {
      loadError = e;
      corruptRaw = raw || "";
      /* 原始数据另存一份，绝不覆盖；等用户确认后再重置 */
      try { if (raw) localStorage.setItem(KEY + ".corrupt", raw); } catch (e2) {}
    }
    const d = seed();
    if (!loadError) {
      try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {}
    }
    return d;
  }

  let db = load();

  function dbSizeKB() {
    try { return Math.round(JSON.stringify(db).length / 1024); } catch (e) { return 0; }
  }

  /* 保存：返回布尔值。失败/冲突/恢复模式都不允许调用方再提示“成功”。 */
  function save(opts) {
    const force = !!(opts && opts.force);
    if (loadError && !force) {
      alertBox(
        "err",
        "数据处于恢复模式",
        "检测到本地账套损坏或版本不兼容，系统已停止写入，避免覆盖原始数据。",
        "请先在顶部恢复条下载原始数据，再点「重置演示数据」，或导入一份备份。"
      );
      return false;
    }
    try {
      if (!force) {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          const cur = JSON.parse(raw);
          if (cur && Number(cur.rev || 0) > Number(db.rev || 0)) {
            lastSaveFailAt = Date.now();
            alertBox(
              "err",
              "检测到其他窗口已修改",
              "当前页面的数据已过期，本次保存被阻止，避免覆盖另一窗口的修改。",
              "请刷新页面后重新操作；如需保留当前编辑内容，请先复制到记事本。"
            );
            return false;
          }
        }
      }
      db.rev = (Number(db.rev) || 0) + 1;
      db.updatedAt = Date.now();
      localStorage.setItem(KEY, JSON.stringify(db));
      return true;
    } catch (e) {
      lastSaveFailAt = Date.now();
      alertBox(
        "warn",
        "本地存储写入失败",
        "本次修改没有保存成功。浏览器 localStorage 空间不足或被禁用。",
        "当前数据约 " + dbSizeKB() + " KB。请先「导出整库备份」，再清理浏览器存储或重置数据后重试。"
      );
      return false;
    }
  }

  /* 操作日志：新建 / 提交 / 退货确认 / 导出 / 重置 等关键动作 */
  function logAction(act, detail) {
    if (!db.logs) db.logs = [];
    db.logs.unshift({
      id: uid("LG"),
      at: Date.now(),
      who: (db.user && db.user.name) || "文员",
      act: act,
      detail: detail || "",
    });
    if (db.logs.length > 200) db.logs.length = 200;
  }

  /* ---------- 路由 / 状态 ---------- */
  const state = {
    route: "home", // home | base-products | ...
    // 列表筛选
    f: {
      prodQ: "",
      prodCat: "",
      supQ: "",
      cusQ: "",
      poStatus: "",
      poQ: "",
      soStatus: "",
      soQ: "",
      stockQ: "",
      moveFrom: daysAgo(30),
      moveTo: fmtD(today),
      moveType: "",
      moveQ: "",
      rptType: "stock",
      rptFrom: daysAgo(30),
      rptTo: fmtD(today),
      ledFrom: daysAgo(30),
      ledTo: fmtD(today),
      ledQ: "",
      xsthStatus: "",
      xsthQ: "",
      cgthStatus: "",
      cgthQ: "",
      invFrom: daysAgo(30),
      invTo: fmtD(today),
      recType: "supplier",
      recId: "",
      poPage: 1,
      soPage: 1,
      xsthPage: 1,
      cgthPage: 1,
      prodPage: 1,
      supPage: 1,
      cusPage: 1,
      movePage: 1,
      ledPage: 1,
    },
    // 编辑态
    editProduct: null,
    editSupplier: null,
    editCustomer: null,
    poForm: null,
    soForm: null,
    xsthForm: null,
    cgthForm: null,
    pddForm: null,
    viewDoc: null, // {kind, doc}
    selectedId: null,
    formDirty: false, // 当前编辑表单是否有未保存修改
  };

  /* ---------- 弹窗 ---------- */
  const modal = {
    show: false,
    type: "info", // info|ok|err|warn
    title: "",
    text: "",
    extra: "",
    queue: [],
  };

  function alertBox(type, title, text, extra) {
    /* 刚发生写入失败时，3 秒内不允许再弹“成功”，避免覆盖失败提示 */
    if (type === "ok" && Date.now() - lastSaveFailAt < 3000) return;
    const msg = { type: type, title: title, text: text || "", extra: extra || "" };
    if (modal.show) {
      modal.queue.push(msg);
      if (modal.queue.length > 5) modal.queue.shift();
      return;
    }
    modal.show = true;
    modal.type = msg.type;
    modal.title = msg.title;
    modal.text = msg.text;
    modal.extra = msg.extra;
    render();
  }

  function closeModal() {
    modal.show = false;
    modal.title = modal.text = modal.extra = "";
    if (modal.queue.length) {
      const next = modal.queue.shift();
      modal.show = true;
      modal.type = next.type;
      modal.title = next.title;
      modal.text = next.text;
      modal.extra = next.extra;
    }
    render();
  }

  function needField(label) {
    alertBox("err", "请完善表单", "「" + label + "」为必填项", "请填写完整后再保存。带 * 的字段为必填。");
  }

  /* 校验单据明细：qty>0、price≥0；停用商品仅允许保留在已开草稿中 */
  function validateLines(rawLines, kind, existingIds) {
    const errors = [];
    const lines = [];
    const allowInactive = existingIds || new Set();
    (rawLines || []).forEach((l, i) => {
      const row = i + 1;
      const pid = l.productId;
      if (!pid) {
        if (Number(l.qty) || Number(l.price)) {
          errors.push("第 " + row + " 行：请先选择商品");
        }
        return;
      }
      const p = productById(pid);
      if (!p) {
        errors.push("第 " + row + " 行：商品不存在或已删除");
        return;
      }
      if (!p.active && !allowInactive.has(pid)) {
        errors.push("第 " + row + " 行：「" + p.name + "」已停用，不能加入新单");
        return;
      }
      const qty = Number(l.qty);
      const price = Number(l.price);
      if (!Number.isFinite(qty) || qty <= 0) {
        errors.push("第 " + row + " 行：数量必须大于 0");
        return;
      }
      if (!Number.isFinite(price) || price < 0) {
        errors.push("第 " + row + " 行：单价不能为负数");
        return;
      }
      lines.push({ productId: pid, qty: qty, price: round2(price) });
    });
    if (errors.length) {
      alertBox("err", "明细校验未通过", errors[0], errors.slice(1).join("；") || "请修正后重新保存。");
      return null;
    }
    if (!lines.length) {
      needField("商品明细（至少一行有效商品和数量）");
      return null;
    }
    return lines;
  }

  function existingLineIds(form) {
    if (!form || !form.id) return new Set();
    let src = null;
    if (form.kind === "so") src = db.sales.find((x) => x.id === form.id);
    else if (form.kind === "xsth") src = (db.salesReturns || []).find((x) => x.id === form.id);
    else if (form.kind === "cgth") src = (db.purchaseReturns || []).find((x) => x.id === form.id);
    else src = db.purchases.find((x) => x.id === form.id);
    return new Set((src && src.lines ? src.lines : []).map((l) => l.productId));
  }

  function noPermission(what) {
    alertBox(
      "warn",
      "权限不足",
      "当前账号「文员小陈」权限不足，无法执行该操作。",
      what
        ? "禁止操作：" + what + "。文员仅可进行资料维护、单据录入（草稿/提交）、查询与导出，不可财务审核、成本结转、红冲、收付款核销、直接调整库存。"
        : "文员仅可进行资料维护、单据录入（草稿/提交）、查询与导出。"
    );
  }

  /* ---------- 教程 ---------- */
  /* 每步：
     - route  页面路由
     - target 高亮元素的 CSS selector（橙色脉冲框 + 👆点这里气泡）
     - expect 用户真的点了哪个 data-act 按钮后自动进下一步（null 表示等用户点【下一步】）
     - text   步骤说明
     点了高亮按钮 → 教程自动推进；没点也可以手动点【下一步】跳过。 */
  const TOUR = [
    {
      route: "home", target: null, expect: null,
      title: "第 0 步 · 先认识这套系统",
      text: "你登录的是「商务文员」演示账号，数据只存在这台电脑的浏览器里。\n\n" +
            "🟦 顶部【主菜单】：工作台 / 基础资料 / 采购 / 销售 / 库存 / 报表。\n" +
            "⬜ 左侧【二级菜单】：当前模块的子页面。\n" +
            "📄 右侧白色区域：实际操作页面。\n" +
            "🔘 右下角小卡片：本教程，可点「—」最小化。\n\n" +
            "整套流程是：建档 → 采购审核入库 → 销售审核出库 → 退货 → 盘点 → 备份 → 报表。\n" +
            "👉 点【下一步】，我们从新建商品开始。",
    },
    {
      route: "base-products", target: '[data-act="new-product"]', expect: "new-product",
      title: "第 1 步 · 打开新增商品",
      text: "📍 已切到：基础资料 → 商品档案\n\n" +
            "👆 点右上角橙色框里的【+ 新增商品】。\n\n" +
            "💡 为什么先建商品：采购、销售、库存、报表都靠商品档案串起来，编码不能重复。",
    },
    {
      route: "base-products", target: '[data-act="save-product"]', expect: "save-product",
      title: "第 2 步 · 填商品并保存",
      text: "📍 现在打开了「新增商品档案」表单。\n\n" +
            "✍️ 按下面填（带 * 必填）：\n" +
            "   · 商品编码*：SP001\n" +
            "   · 品名*：原味花生\n" +
            "   · 规格：500g/包\n" +
            "   · 单位*：包\n" +
            "   · 分类：农副食品\n" +
            "   · 最低库存：10\n\n" +
            "💾 拉到表单底部，点【保存】。\n" +
            "✅ 保存成功才会清空表单；如果失败，表单会保留，按提示改。",
    },
    {
      route: "base-suppliers", target: '[data-act="new-supplier"]', expect: "new-supplier",
      title: "第 3 步 · 打开新增供应商",
      text: "📍 已切到：基础资料 → 供应商资料\n\n" +
            "👆 点右上角【+ 新增供应商】。\n\n" +
            "💡 采购单只能选已启用的供应商，所以先建档。",
    },
    {
      route: "base-suppliers", target: '[data-act="save-supplier"]', expect: "save-supplier",
      title: "第 4 步 · 填供应商并保存",
      text: "📍 现在打开了「新增供应商」表单。\n\n" +
            "✍️ 填写：\n" +
            "   · 编码*：GYS001\n" +
            "   · 名称*：南宁桂味食品批发部\n" +
            "   · 联系人：李经理\n" +
            "   · 电话：13800001111\n\n" +
            "💾 点底部【保存】。\n" +
            "✅ 到这里，任务卡 L1（商品+供应商建档）会自动打勾。",
    },
    {
      route: "purchase-list", target: '[data-act="new-po"]', expect: "new-po",
      title: "第 5 步 · 新建采购订单",
      text: "📍 已切到：采购管理 → 采购订单\n\n" +
            "👆 点右上角【+ 新增采购订单】。\n\n" +
            "💡 采购单先保存为草稿或直接提交审核，审核通过后才允许入库。",
    },
    {
      route: "purchase-list", target: '[data-act="save-po-submit"]', expect: "save-po-submit",
      title: "第 6 步 · 填采购单并提交审核",
      text: "📍 现在打开了「新增采购订单」表单。\n\n" +
            "✍️ ① 供应商下拉选：南宁桂味食品批发部。\n" +
            "➕ ② 点【+ 添加行】：\n" +
            "   · 商品选：原味花生\n" +
            "   · 数量：100\n" +
            "   · 单价：4.5\n\n" +
            "💾 ③ 拉到底部，点【保存并提交审核】。\n" +
            "✅ 成功后状态变「待审核」，库存暂时不变。",
    },
    {
      route: "purchase-list", target: '[data-act="audit-po"]', expect: "audit-po",
      title: "第 7 步 · 模拟财务审核采购单",
      text: "📍 刚提交的采购单就在列表第一行，状态「待审核」。\n\n" +
            "👆 点这一行右侧的【审核】。\n" +
            "🪟 弹出「审核完成」后点确定。\n\n" +
            "💡 真实企业由财务账号审核；这里是单人实训，所以提供模拟按钮。\n" +
            "✅ 审核后状态变「已审核」，仍不改库存。",
    },
    {
      route: "purchase-list", target: '[data-act="receive-po"]', expect: "receive-po",
      title: "第 8 步 · 模拟仓管入库",
      text: "📍 审核后系统已打开这张采购单详情。\n\n" +
            "👆 点底部【模拟仓管入库】。\n" +
            "🪟 弹窗会说明「按明细数量增加库存并生成采购入库流水」，点确定。\n\n" +
            "✅ 入库后：状态变「已入库」，库存 +100，流水新增一条，时间线留痕。\n" +
            "📌 任务卡 L2（采购入库闭环）打勾。",
    },
    {
      route: "sales-list", target: '[data-act="new-so"]', expect: "new-so",
      title: "第 9 步 · 新建销售订单",
      text: "📍 已切到：销售管理 → 销售订单\n\n" +
            "👆 点右上角【+ 新增销售订单】。\n\n" +
            "💡 销售单会先占用「可用库存」，避免同一批货被多张单重复卖出。",
    },
    {
      route: "sales-list", target: '[data-act="save-so-submit"]', expect: "save-so-submit",
      title: "第 10 步 · 填销售单并提交审核",
      text: "📍 现在打开了「新增销售订单」表单。\n\n" +
            "✍️ ① 客户下拉选：老街坊便利店（建政店）。\n" +
            "➕ ② 点【+ 添加行】：\n" +
            "   · 商品选：原味花生\n" +
            "   · 数量：20（必须 ≤「可用库存」列）\n" +
            "   · 单价：6.0\n\n" +
            "💾 ③ 点【保存并提交审核】。\n" +
            "⚠️ 超过可用库存会整单拦截，不会生成半张单。",
    },
    {
      route: "sales-list", target: '[data-act="audit-so"]', expect: "audit-so",
      title: "第 11 步 · 模拟财务审核销售单",
      text: "📍 刚提交的销售单在第一行，状态「待审核」。\n\n" +
            "👆 点行尾【审核】，弹窗点确定。\n\n" +
            "✅ 状态变「待出库」，此时库存仍未扣。",
    },
    {
      route: "sales-list", target: '[data-act="ship-so"]', expect: "ship-so",
      title: "第 12 步 · 模拟仓管出库",
      text: "📍 审核后已打开销售单详情。\n\n" +
            "👆 点底部【模拟仓管出库】，弹窗点确定。\n\n" +
            "✅ 出库后：状态变「已出库」，库存 −20，生成销售出库流水。\n" +
            "📌 任务卡 L3（销售出库闭环）打勾。",
    },
    {
      route: "stock-query", target: '[data-act="stock-search"]', expect: "stock-search",
      title: "第 13 步 · 查实时库存",
      text: "📍 已切到：库存管理 → 实时库存\n\n" +
            "✍️ 在「品名/编码」框输入：花生。\n" +
            "👆 点【查询】。\n\n" +
            "✅ 列表只剩含「花生」的商品，能看到现存量、可用库存、预警状态。\n" +
            "💡 可用库存 = 现存量 − 其他未出库单占用。",
    },
    {
      route: "sales-return", target: '[data-act="new-xsth"]', expect: "new-xsth",
      title: "第 14 步 · 新建销售退货单",
      text: "📍 已切到：销售管理 → 销售退货\n\n" +
            "👆 点【新增销售退货单】。\n\n" +
            "💡 退货必须挂原销售单或按客户+商品录入，数量不能超过「已出库 − 已退货」。",
    },
    {
      route: "sales-return", target: '[data-act="save-xsth-submit"]', expect: "save-xsth-submit",
      title: "第 15 步 · 填退货单并提交",
      text: "📍 现在打开了「新增销售退货单」。\n\n" +
            "✍️ ① 原销售单选刚出库的那张（括号里是客户名）。\n" +
            "➕ ② 商品选原味花生，退货数量 5，单价 6.0。\n" +
            "💾 ③ 点【提交待审】。\n\n" +
            "✅ 提交后状态「待审核」，库存还没回加。",
    },
    {
      route: "sales-return", target: '[data-act="confirm-xsth"]', expect: "confirm-xsth",
      title: "第 16 步 · 模拟仓管确认退货",
      text: "📍 退货单已在列表第一行，状态「待审核」。\n\n" +
            "👆 点【模拟仓管确认】→ 弹窗点确定。\n\n" +
            "✅ 确认后：库存 +5，生成「销售退货」流水，状态变「已退货」。\n" +
            "📌 任务卡 L4（退货确认）打勾。",
    },
    {
      route: "stock-check", target: '[data-act="new-pdd"]', expect: "new-pdd",
      title: "第 17 步 · 新建盘点单",
      text: "📍 已切到：库存管理 → 盘点单\n\n" +
            "👆 点【新增盘点单】。\n\n" +
            "💡 盘点只录实盘数，保存草稿不改库存；确认时才按差异入账。",
    },
    {
      route: "stock-check", target: '[data-act="save-pdd-submit"]', expect: "save-pdd-submit",
      title: "第 18 步 · 录实盘数并提交",
      text: "📍 现在打开了「新增盘点单」。\n\n" +
            "✍️ ① 商品选：原味花生（账面数会自动带出）。\n" +
            "② 实盘数填「账面数 + 1」，制造一笔盘盈。\n" +
            "   （例如账面 210，就填 211，差异显示 +1）\n" +
            "💾 ③ 点【提交待审】。\n\n" +
            "✅ 提交后状态「待审核」，库存仍未变。",
    },
    {
      route: "stock-check", target: '[data-act="confirm-pdd"]', expect: "confirm-pdd",
      title: "第 19 步 · 模拟仓管确认盘点",
      text: "📍 盘点单在列表第一行，状态「待审核」。\n\n" +
            "👆 点【模拟仓管确认】→ 弹窗点确定。\n\n" +
            "✅ 系统按「确认时账面」重算差异：库存改为实盘数，生成「盘点调整 +1」流水。\n" +
            "📌 任务卡 L5（盘点差异入账）打勾。\n" +
            "💡 这也是本次修复的重点：不再出现“盘了但库存没变”。",
    },
    {
      route: "home", target: '[data-act="backup-export"]', expect: "backup-export",
      title: "第 20 步 · 导出整库备份",
      text: "📍 已回到工作台左侧「数据安全」分组。\n\n" +
            "👆 点【导出整库备份】。\n\n" +
            "✅ 浏览器会下载一个 JSON 文件，包含商品、库存、单据、流水、任务进度。\n" +
            "💡 换电脑、清缓存、导入别人账套前，先做这一步。\n" +
            "📌 这一步只导出，不改任何数据。",
    },
    {
      route: "rpt-invsum", target: '[data-act="invsum-export"]', expect: "invsum-export",
      title: "第 21 步 · 导出进销存汇总",
      text: "📍 已切到：报表中心 → 进销存汇总\n\n" +
            "✍️ 选起止日期（默认本月即可），点【查询】。\n" +
            "👆 再点【导出 CSV】。\n\n" +
            "✅ 表里能看到期初、采购入库、销售出库、退货、盘点调整、期末。\n" +
            "📌 任务卡 L6（导出进销存）打勾。",
    },
    {
      route: "home", target: null, expect: null,
      title: "🎉 教程完成 · 你已经跑通整套流程",
      text: "回到工作台。\n\n" +
            "✅ 检查「实训任务卡 L1–L6」是否全绿；没绿的点【去完成】跳转。\n" +
            "📋 左侧【实训任务】看总进度。\n" +
            "📖 忘了操作点左侧【操作手册】。\n" +
            "🛟 数据乱了：侧栏「数据安全」→ 恢复最近备份 / 导入整库备份 / 重置演示数据。\n\n" +
            "⚠️ 真实企业里审核、入库、出库、红冲由财务/仓管分权完成；本页按钮仅用于单人实训。\n" +
            "👉 点【完成】结束教程。",
    },
  ];

  function tourNext() {
    db.tourStep = (db.tourStep || 0) + 1;
    if (db.tourStep >= TOUR.length) {
      db.tourDone = true;
      db.tourOn = false;
      db.tourStep = 0;
      save();
      render();
      return;
    }
    const s = TOUR[db.tourStep];
    db.tourOn = true;
    save();
    /* 跨模块跳转走 go()，清掉上一页的表单/详情/选中，避免教程串页 */
    if (state.route !== s.route) {
      if (!go(s.route)) {
        db.tourStep -= 1;
        save();
        return;
      }
    } else render();
  }

  function tourPrev() {
    const prev = db.tourStep || 0;
    db.tourStep = Math.max(0, prev - 1);
    const s = TOUR[db.tourStep];
    if (db.tourStep === 0) db.tourDone = false;
    save();
    if (state.route !== s.route) {
      if (!go(s.route)) {
        db.tourStep = prev;
        save();
        return;
      }
    } else render();
  }

  function tourClose() {
    db.tourOn = false;
    save();
    render();
  }

  function tourRestart() {
    if (!confirmLeaveForm()) return;
    state.formDirty = false;
    db.tourOn = true;
    db.tourStep = 0;
    db.tourDone = false;
    db.tourMini = false;
    save();
    go(TOUR[0].route);
  }

  /* ---------- 导航 ---------- */
  function hasOpenForm() {
    return !!(state.editProduct || state.editSupplier || state.editCustomer ||
      state.poForm || state.soForm || state.xsthForm || state.cgthForm || state.pddForm);
  }

  function confirmLeaveForm() {
    if (!state.formDirty || !hasOpenForm()) return true;
    return confirm("当前表单还有未保存的修改，离开后会丢失已填内容。\n\n确定离开吗？");
  }

  /* 输入时即时打上“未保存”标记，不重绘整页、不抢输入焦点 */
  function markDirtyBadge() {
    try {
      const title = document.querySelector(".page-title");
      if (!title || title.querySelector(".dirty-badge")) return;
      const b = document.createElement("span");
      b.className = "dirty-badge";
      b.textContent = "未保存";
      b.title = "表单有未保存修改";
      title.appendChild(b);
    } catch (e) {}
  }

  function go(route) {
    if (route !== state.route && !confirmLeaveForm()) return false;
    state.route = route;
    state.editProduct = null;
    state.editSupplier = null;
    state.editCustomer = null;
    state.poForm = null;
    state.soForm = null;
    state.xsthForm = null;
    state.cgthForm = null;
    state.pddForm = null;
    state.viewDoc = null;
    state.selectedId = null;
    state.formDirty = false;
    render();
    return true;
  }

  function goHome() {
    go("home");
  }

  /* ---------- 菜单结构 ---------- */
  const MENUS = [
    { id: "home", label: "工作台" },
    { id: "base", label: "基础资料" },
    { id: "purchase", label: "采购管理" },
    { id: "sales", label: "销售管理" },
    { id: "stock", label: "库存管理" },
    { id: "rpt", label: "报表中心" },
  ];

  const SIDE = {
    home: [
      { id: "home", label: "我的工作台" },
      { id: "tasks", label: "实训任务" },
      { id: "manual", label: "操作手册" },
      { id: "sys-logs", label: "操作日志" },
      { id: "backup-history", label: "历史备份" },
    ],
    base: [
      { id: "base-products", label: "商品档案" },
      { id: "base-suppliers", label: "供应商资料" },
      { id: "base-customers", label: "客户资料" },
    ],
    purchase: [
      { id: "purchase-list", label: "采购订单" },
      { id: "purchase-in", label: "采购入库单" },
      { id: "purchase-return", label: "采购退货" },
    ],
    sales: [
      { id: "sales-list", label: "销售订单" },
      { id: "sales-out", label: "销售出库单" },
      { id: "sales-return", label: "销售退货" },
    ],
    stock: [
      { id: "stock-query", label: "实时库存" },
      { id: "stock-alert", label: "库存预警" },
      { id: "stock-ledger", label: "库存台账" },
      { id: "stock-move", label: "出入库流水" },
      { id: "stock-check", label: "盘点单" },
    ],
    rpt: [
      { id: "rpt-center", label: "业务报表" },
      { id: "rpt-invsum", label: "进销存汇总" },
      { id: "rpt-reconcile", label: "往来对账单" },
    ],
  };

  function menuOf(route) {
    if (route === "home" || route === "tasks" || route === "sys-logs" || route === "manual" || route === "backup-history") return "home";
    if (route.startsWith("base-")) return "base";
    if (route.startsWith("purchase")) return "purchase";
    if (route.startsWith("sales")) return "sales";
    if (route.startsWith("stock")) return "stock";
    if (route.startsWith("rpt")) return "rpt";
    return "home";
  }

  function pageTitle(route) {
    const map = {
      home: "我的工作台",
      tasks: "实训任务（L1–L6）",
      manual: "操作手册（文员手把手教程）",
      "sys-logs": "操作日志",
      "backup-history": "历史备份",
      "base-products": "商品档案",
      "base-suppliers": "供应商资料",
      "base-customers": "客户资料",
      "purchase-list": "采购订单",
      "purchase-in": "采购入库单",
      "purchase-return": "采购退货单",
      "sales-list": "销售订单",
      "sales-out": "销售出库单",
      "sales-return": "销售退货单",
      "stock-query": "实时库存查询",
      "stock-alert": "库存预警",
      "stock-ledger": "库存台账",
      "stock-move": "出入库流水查询",
      "stock-check": "库存盘点单",
      "rpt-center": "业务报表中心",
      "rpt-invsum": "进销存汇总表",
      "rpt-reconcile": "往来对账单",
    };
    return map[route] || "系统";
  }

  /* ---------- 业务工具 ---------- */
  function supplierName(id) {
    return db.suppliers.find((s) => s.id === id)?.name || "—";
  }
  function customerName(id) {
    return db.customers.find((c) => c.id === id)?.name || "—";
  }
  function productById(id) {
    return db.products.find((p) => p.id === id);
  }
  const PAGE_SIZE = 20;

  function paginate(list, key) {
    const total = list.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const cur = Math.min(Math.max(1, Number(state.f[key + "Page"]) || 1), pages);
    const rows = list.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);
    const html = pages > 1 ? `
      <div class="pager">
        <button class="btn btn-sm" data-act="pg" data-id="${key}" data-p="${cur - 1}" ${cur <= 1 ? "disabled" : ""}>上一页</button>
        <span class="pg-info">第 ${cur} / ${pages} 页 · 共 ${total} 条</span>
        <button class="btn btn-sm" data-act="pg" data-id="${key}" data-p="${cur + 1}" ${cur >= pages ? "disabled" : ""}>下一页</button>
      </div>` : "";
    return { total: total, page: cur, pages: pages, rows: rows, html: html };
  }

  function lineAmount(lines) {
    return round2((lines || []).reduce((s, l) => s + Number(l.qty || 0) * Number(l.price || 0), 0));
  }
  function peekPoNo() {
    const d = fmtD(today).replace(/-/g, "");
    return "CGRK-" + d + "-" + pad(db.counters.po + 1, 4);
  }
  function nextPoNo() {
    db.counters.po += 1;
    const d = fmtD(today).replace(/-/g, "");
    return "CGRK-" + d + "-" + pad(db.counters.po, 4);
  }
  function peekSoNo() {
    const d = fmtD(today).replace(/-/g, "");
    return "XSCK-" + d + "-" + pad(db.counters.so + 1, 4);
  }
  function nextSoNo() {
    db.counters.so += 1;
    const d = fmtD(today).replace(/-/g, "");
    return "XSCK-" + d + "-" + pad(db.counters.so, 4);
  }
  function peekXsthNo() {
    const d = fmtD(today).replace(/-/g, "");
    return "XSTH-" + d + "-" + pad((db.counters.xsth || 0) + 1, 4);
  }
  function nextXsthNo() {
    db.counters.xsth = (db.counters.xsth || 0) + 1;
    const d = fmtD(today).replace(/-/g, "");
    return "XSTH-" + d + "-" + pad(db.counters.xsth, 4);
  }
  function peekCgthNo() {
    const d = fmtD(today).replace(/-/g, "");
    return "CGTH-" + d + "-" + pad((db.counters.cgth || 0) + 1, 4);
  }
  function nextCgthNo() {
    db.counters.cgth = (db.counters.cgth || 0) + 1;
    const d = fmtD(today).replace(/-/g, "");
    return "CGTH-" + d + "-" + pad(db.counters.cgth, 4);
  }
  function peekPddNo() {
    const d = fmtD(today).replace(/-/g, "");
    return "PDD-" + d + "-" + pad((db.counters.pdd || 0) + 1, 4);
  }
  function nextPddNo() {
    db.counters.pdd = (db.counters.pdd || 0) + 1;
    const d = fmtD(today).replace(/-/g, "");
    return "PDD-" + d + "-" + pad(db.counters.pdd, 4);
  }

  /* 已出库/已入库数量（含部分出库按流水统计） */
  function soShippedQty(so, productId) {
    if (!so) return 0;
    const p = productById(productId);
    if (!p) return 0;
    const fromMoves = (db.moves || [])
      .filter((m) => m.refNo === so.no && m.type === "销售出库" && m.productCode === p.code)
      .reduce((s, m) => s + Math.abs(m.qty), 0);
    if (fromMoves > 0) return fromMoves;
    if (so.status === "已出库") {
      const l = (so.lines || []).find((x) => x.productId === productId);
      return l ? l.qty : 0;
    }
    return 0;
  }
  function poReceivedQty(po, productId) {
    if (!po) return 0;
    const p = productById(productId);
    if (!p) return 0;
    const fromMoves = (db.moves || [])
      .filter((m) => m.refNo === po.no && m.type === "采购入库" && m.productCode === p.code)
      .reduce((s, m) => s + Math.abs(m.qty), 0);
    if (fromMoves > 0) return fromMoves;
    if (po.status === "已入库") {
      const l = (po.lines || []).find((x) => x.productId === productId);
      return l ? l.qty : 0;
    }
    return 0;
  }
  function soReturnedQty(soId, productId, excludeId) {
    return (db.salesReturns || [])
      .filter((r) => r.status === "已退货" && r.soId === soId && r.id !== excludeId)
      .reduce((s, r) => s + (r.lines || []).filter((l) => l.productId === productId).reduce((a, l) => a + l.qty, 0), 0);
  }
  function poReturnedQty(poId, productId, excludeId) {
    return (db.purchaseReturns || [])
      .filter((r) => r.status === "已退货" && r.poId === poId && r.id !== excludeId)
      .reduce((s, r) => s + (r.lines || []).filter((l) => l.productId === productId).reduce((a, l) => a + l.qty, 0), 0);
  }
  function maxReturnableSO(so, productId, excludeId) {
    return Math.max(0, soShippedQty(so, productId) - soReturnedQty(so.id, productId, excludeId));
  }
  function maxReturnablePO(po, productId, excludeId) {
    return Math.max(0, poReceivedQty(po, productId) - poReturnedQty(po.id, productId, excludeId));
  }

  /* 库存变动预览：商品 → 当前库存 → 本单变动 → 变动后 */
  function stockPreviewRows(lines, dir, excludeSoId) {
    const map = {};
    (lines || []).forEach((l) => {
      if (!l.productId) return;
      if (!map[l.productId]) map[l.productId] = { productId: l.productId, qty: 0 };
      map[l.productId].qty += Number(l.qty) || 0;
    });
    return Object.keys(map).map((pid) => {
      const p = productById(pid);
      const cur = dir < 0 ? availableQty(pid, excludeSoId) : Number(db.stock[pid] || 0);
      const delta = dir * map[pid].qty;
      const after = cur + delta;
      return {
        pid, code: p ? p.code : pid, name: p ? p.name : pid, unit: p ? p.unit : "",
        cur, delta, after, over: after < 0,
      };
    });
  }

  function stockPreviewHtml(lines, dir, title, excludeSoId) {
    const rows = stockPreviewRows(lines, dir, excludeSoId);
    const warn = rows.some((r) => r.over);
    return `
      <div class="stock-preview ${warn ? "over" : ""}">
        <div class="sp-hd">${esc(title || "库存变动预览（防超卖）")}
          <span class="sub">${dir > 0 ? "入库方向：变动后增加" : "出库方向：按可用库存校验，不允许负库存"}</span>
        </div>
        <div class="tbl-wrap" style="border:none">
          <table class="tbl">
            <thead><tr><th>商品</th><th class="right">${dir < 0 ? "可用库存" : "当前库存"}</th><th class="right">本单变动</th><th class="right">变动后</th><th>提示</th></tr></thead>
            <tbody>
              ${rows.length
                ? rows.map((r) => `<tr class="${r.over ? "row-over" : ""}">
                    <td class="mono">${esc(r.code)} ${esc(r.name)}</td>
                    <td class="right num">${r.cur}</td>
                    <td class="right num">${r.delta > 0 ? "+" : ""}${r.delta}</td>
                    <td class="right num ${r.over ? "st-low" : ""}">${r.after}</td>
                    <td>${r.over ? '<span class="st st-low">将超卖</span>' : '<span class="st st-ok">正常</span>'}</td>
                  </tr>`).join("")
                : `<tr><td colspan="5" class="tbl-empty">请先选择商品与数量</td></tr>`}
            </tbody>
          </table>
        </div>
        ${warn ? `<div class="sp-warn">存在「将超卖」行：可用库存不足（已扣除其他待审核/待出库单的预占）。请减少数量或先办理入库。</div>` : ""}
      </div>`;
  }

  function validateNoOverSell(lines, excludeSoId) {
    const need = {};
    (lines || []).forEach((l) => {
      if (!l.productId) return;
      need[l.productId] = (need[l.productId] || 0) + (Number(l.qty) || 0);
    });
    const bad = Object.keys(need).filter((pid) => need[pid] > availableQty(pid, excludeSoId));
    if (bad.length) {
      alertBox(
        "err",
        "可用库存不足（将超卖）",
        bad
          .map((pid) => {
            const p = productById(pid);
            return (p ? p.name : pid) + " 需 " + need[pid] + "，可用 " + availableQty(pid, excludeSoId);
          })
          .join("；"),
        "可用库存 = 现存量 − 其他待审核/待出库单未发数量。请减少数量，或先完成采购入库。"
      );
      return false;
    }
    return true;
  }

  /* 垂直时间轴 */
  function timelineHtml(timeline) {
    const items = timeline || [];
    if (!items.length) return '<div class="tbl-empty">暂无操作记录</div>';
    return '<div class="timeline">' + items.map((t) => `
      <div class="tl-item">
        <div class="tl-dot"></div>
        <div class="tl-bd">
          <div class="tl-act">${esc(t.act)}</div>
          <div class="tl-meta"><b>${esc(t.who)}</b> · ${fmtDT(t.at)}</div>
        </div>
      </div>`).join("") + '</div>';
  }

  /* 实训任务：只认用户真实完成动作，不再用种子数据推断 */
  function ensureTasks() {
    if (!db.flags) db.flags = {};
    db.flags.tasks = Object.assign({}, TASK_DEFAULT, db.flags.tasks || {});
  }

  function markTask(key) {
    if (!key) return;
    ensureTasks();
    db.flags.tasks[key] = true;
  }

  function taskDone(key) {
    ensureTasks();
    return !!db.flags.tasks[key];
  }

  /* 可用库存 = 现存量 − 待审核/待出库/部分出库未发数量 */
  function soLineRemaining(l) {
    return Math.max(0, (Number(l.qty) || 0) - (Number(l.shippedQty) || 0));
  }
  function reservedQty(productId, excludeSoId) {
    return db.sales
      .filter((so) => so.id !== excludeSoId && (so.status === "待审核" || so.status === "待出库" || so.status === "部分出库"))
      .reduce(
        (sum, so) =>
          sum +
          (so.lines || [])
            .filter((l) => l.productId === productId)
            .reduce((s, l) => s + soLineRemaining(l), 0),
        0
      );
  }
  function availableQty(productId, excludeSoId) {
    return (Number(db.stock[productId]) || 0) - reservedQty(productId, excludeSoId);
  }

  function taskList() {
    ensureTasks();
    const t = db.flags.tasks;
    return [
      { id: "L1", title: "商品 + 供应商建档", desc: "基础资料 → 商品档案点【+ 新增商品】保存；再切到供应商资料新增 1 条。两项都完成后变绿。", done: !!t.baseProduct && !!t.baseSupplier, nav: "base-products" },
      { id: "L2", title: "采购入库闭环", desc: "采购订单 → 新增并提交 → 打开单据点【模拟财务审核】→ 再点【模拟仓管入库】。库存增加、流水生成后才算完成。", done: !!t.poReceive, nav: "purchase-list" },
      { id: "L3", title: "销售出库闭环", desc: "销售订单 → 新增并提交 → 打开单据点【模拟财务审核】→ 再点【模拟仓管出库】。库存扣减、流水生成后才算完成。", done: !!t.soShip, nav: "sales-list" },
      { id: "L4", title: "退货确认", desc: "销售退货或采购退货 → 录入并提交 → 打开单据点【模拟仓管确认】。库存回加/扣减后变绿。", done: !!t.returnConfirm, nav: "sales-return" },
      { id: "L5", title: "盘点差异入账", desc: "盘点单 → 新增、填实盘数 → 提交待审 → 打开单据点【模拟仓管确认】。系统按确认时账面重算差异。", done: !!t.stockConfirm, nav: "stock-check" },
      { id: "L6", title: "导出进销存汇总", desc: "报表中心 → 进销存汇总 → 查询确认有数据 → 导出 CSV。", done: !!t.exportInv, nav: "rpt-invsum" },
    ];
  }

  /* 进销存汇总计算 */
  function invSumRows(from, to) {
    /* 期末 = 截止日(含)前全部流水累计；
       期内列只统计 [from, to]；期初 = 期末 − 期内净变动，
       保证 期初 + 采购入库 − 采购退货 − 销售出库 + 销售退货 = 期末 恒等 */
    const map = {};
    db.products.forEach((p) => {
      map[p.id] = {
        productId: p.id, code: p.code, name: p.name, unit: p.unit,
        openQty: 0, poIn: 0, poOut: 0, soOut: 0, soIn: 0, adjustQty: 0, endQty: 0,
      };
    });
    (db.moves || []).forEach((m) => {
      /* 主键优先；老数据回退到编码/唯一名称，避免改名后失配 */
      let p = m.productId ? db.products.find((x) => x.id === m.productId) : null;
      if (!p) p = db.products.find((x) => x.code === m.productCode);
      if (!p) {
        const sameName = db.products.filter((x) => x.name === m.productName);
        if (sameName.length === 1) p = sameName[0];
      }
      const rec = p && map[p.id];
      if (!rec) return;
      const d = m.date;
      const q = Number(m.qty) || 0;
      if (to && d > to) return;
      rec.endQty += q;
      if (from && d < from) return;
      if (m.type === "采购入库") rec.poIn += q;
      else if (m.type === "采购退货") rec.poOut += -q;
      else if (m.type === "销售出库") rec.soOut += -q;
      else if (m.type === "销售退货") rec.soIn += q;
      else if (m.type === "盘点调整") rec.adjustQty += q;
    });
    Object.keys(map).forEach((k) => {
      const r = map[k];
      const net = r.poIn - r.poOut - r.soOut + r.soIn + r.adjustQty;
      r.openQty = r.endQty - net;
    });
    return db.products.map((p) => map[p.id]);
  }

  function invSumTotal(rows) {
    const t = { openQty: 0, poIn: 0, poOut: 0, soOut: 0, soIn: 0, adjustQty: 0, endQty: 0 };
    rows.forEach((r) => {
      t.openQty += r.openQty; t.poIn += r.poIn; t.poOut += r.poOut;
      t.soOut += r.soOut; t.soIn += r.soIn; t.adjustQty += r.adjustQty; t.endQty += r.endQty;
    });
    return t;
  }

  /* 往来对账：供应商采购额/退货额；客户销售额/退货额/模拟回款 */
  function reconcileRows(type, partyId) {
    const rows = [];
    if (type === "supplier") {
      const list = partyId ? db.suppliers.filter((s) => s.id === partyId) : db.suppliers;
      list.forEach((s) => {
        let buy = 0, ret = 0, pay = 0;
        db.purchases.forEach((po) => {
          if (po.supplierId !== s.id) return;
          /* 对账只认已生效的入库单，待审核/已审核属于在途，不计入应付 */
          if (po.status === "已入库") {
            buy += lineAmount(po.lines);
            pay += round2(lineAmount(po.lines) * 0.7);
          }
        });
        (db.purchaseReturns || []).forEach((r) => {
          if (r.supplierId === s.id && r.status === "已退货") ret += lineAmount(r.lines);
        });
        rows.push({
          code: s.code, name: s.name,
          buy: round2(buy), ret: round2(ret), pay: round2(pay),
          bal: round2(buy - ret - pay),
        });
      });
    } else {
      const list = partyId ? db.customers.filter((c) => c.id === partyId) : db.customers;
      list.forEach((c) => {
        let sell = 0, ret = 0, recv = 0;
        db.sales.forEach((so) => {
          if (so.customerId !== c.id) return;
          /* 对账只认已出库/部分出库，待审核与草稿属于未生效，不计入应收 */
          if (so.status === "已出库" || so.status === "部分出库") {
            sell += lineAmount(so.lines);
            recv += round2(lineAmount(so.lines) * 0.7);
          }
        });
        (db.salesReturns || []).forEach((r) => {
          if (r.customerId === c.id && r.status === "已退货") ret += lineAmount(r.lines);
        });
        rows.push({
          code: c.code, name: c.name,
          sell: round2(sell), ret: round2(ret), recv: round2(recv),
          bal: round2(sell - ret - recv),
        });
      });
    }
    return rows;
  }

  /* 打印 */
  function printDoc() {
    window.print();
  }

  function lowStockList() {
    return db.products
      .map((p) => ({
        ...p,
        qty: Number(db.stock[p.id] || 0),
      }))
      .filter((p) => p.active && p.qty <= p.minStock)
      .sort((a, b) => a.qty - b.qty);
  }

  function statusClass(st) {
    if (st === "草稿") return "st-draft";
    if (st === "待审核") return "st-pending";
    if (st === "待出库") return "st-wait";
    if (st === "已审核") return "st-approved";
    if (st === "已入库" || st === "已出库" || st === "已退货" || st === "已盘点") return "st-executed";
    if (st === "部分出库") return "st-partial";
    if (st === "已作废") return "st-cancelled";
    return "st-draft";
  }
  /* ---------- 商品 CRUD ---------- */
  function openNewProduct() {
    state.formDirty = false;
    state.editProduct = {
      id: null, code: nextSeqCode("SP", db.products),
      name: "", spec: "", unit: "包", category: "农副食品",
      cost: 0, price: 0, minStock: 10, active: true,
    };
    render();
  }

  function openEditProduct(id) {
    const p = db.products.find((x) => x.id === id);
    if (!p) return;
    state.formDirty = false;
    state.editProduct = { ...p };
    render();
  }

  function saveProduct() {
    const f = state.editProduct;
    if (!f) return;
    const name = String(f.name || "").trim();
    const code = String(f.code || "").trim();
    const unit = String(f.unit || "").trim();
    if (!name) return needField("品名");
    if (!code) return needField("商品编码");
    if (!unit) return needField("单位");
    const cost = Number(f.cost), price = Number(f.price), minStock = Number(f.minStock);
    if (!Number.isFinite(cost) || cost < 0) return alertBox("err", "系统提示", "参考进价无效", "请填写 ≥ 0 的数字。");
    if (!Number.isFinite(price) || price < 0) return alertBox("err", "系统提示", "参考售价无效", "请填写 ≥ 0 的数字。");
    if (!Number.isFinite(minStock) || minStock < 0) return alertBox("err", "系统提示", "最低库存无效", "请填写 ≥ 0 的数字。");
    const dup = db.products.find((x) => x.code === code && x.id !== f.id);
    if (dup) return alertBox("err", "系统提示", "商品编码已存在", "编码：" + code);
    if (f.id) {
      const rec = db.products.find((x) => x.id === f.id);
      if (!rec) return;
      Object.assign(rec, {
        code, name, spec: String(f.spec || "").trim(), unit,
        category: String(f.category || "未分类").trim() || "未分类",
        cost: round2(cost), price: round2(price), minStock: Math.floor(minStock),
        active: f.active !== false,
      });
    } else {
      const id = uid("P");
      db.products.push({
        id, code, name, spec: String(f.spec || "").trim(),
        unit, category: String(f.category || "未分类").trim() || "未分类",
        cost: round2(cost), price: round2(price),
        minStock: Math.floor(minStock), active: true,
      });
      db.stock[id] = 0;
    }
    if (!f.id) markTask("baseProduct");
    if (!save()) { render(); return; }
    state.editProduct = null;
    render();
    alertBox("ok", "保存成功", "商品档案已保存。", f.id ? "已更新：" + name : "新增：" + name + "（" + code + "）");
  }

  /* ---------- 供应商 / 客户 ---------- */
  function openNewSupplier() {
    state.formDirty = false;
    state.editSupplier = {
      id: null, code: nextSeqCode("GYS", db.suppliers),
      name: "", contact: "", phone: "", addr: "", active: true,
    };
    render();
  }
  function openEditSupplier(id) {
    const s = db.suppliers.find((x) => x.id === id);
    if (!s) return;
    state.formDirty = false;
    state.editSupplier = { ...s };
    render();
  }
  function saveSupplier() {
    const f = state.editSupplier;
    if (!f) return;
    const name = String(f.name || "").trim();
    const code = String(f.code || "").trim();
    const phone = String(f.phone || "").trim();
    if (!name) return needField("供应商名称");
    if (!code) return needField("供应商编码");
    if (!isPhone(phone)) return alertBox("err", "系统提示", "联系电话格式不正确", "支持手机号 1xxxxxxxxxx 或座机 0xxx-xxxxxxx，可留空。");
    const dup = db.suppliers.find((x) => x.code === code && x.id !== f.id);
    if (dup) return alertBox("err", "系统提示", "供应商编码已存在", "编码：" + code);
    const rec = {
      id: f.id || uid("S"),
      code, name,
      contact: String(f.contact || "").trim(),
      phone,
      addr: String(f.addr || "").trim(),
      active: f.active !== false,
    };
    if (f.id) {
      const i = db.suppliers.findIndex((x) => x.id === f.id);
      if (i < 0) return;
      db.suppliers[i] = { ...db.suppliers[i], ...rec };
    } else {
      db.suppliers.push(rec);
    }
    if (!f.id) markTask("baseSupplier");
    if (!save()) { render(); return; }
    state.editSupplier = null;
    render();
    alertBox("ok", "保存成功", "供应商资料已保存。", name);
  }

  function openNewCustomer() {
    state.formDirty = false;
    state.editCustomer = {
      id: null, code: nextSeqCode("KH", db.customers),
      name: "", contact: "", phone: "", addr: "", active: true,
    };
    render();
  }
  function openEditCustomer(id) {
    const c = db.customers.find((x) => x.id === id);
    if (!c) return;
    state.formDirty = false;
    state.editCustomer = { ...c };
    render();
  }
  function saveCustomer() {
    const f = state.editCustomer;
    if (!f) return;
    const name = String(f.name || "").trim();
    const code = String(f.code || "").trim();
    const phone = String(f.phone || "").trim();
    if (!name) return needField("客户名称");
    if (!code) return needField("客户编码");
    if (!isPhone(phone)) return alertBox("err", "系统提示", "联系电话格式不正确", "支持手机号 1xxxxxxxxxx 或座机 0xxx-xxxxxxx，可留空。");
    const dup = db.customers.find((x) => x.code === code && x.id !== f.id);
    if (dup) return alertBox("err", "系统提示", "客户编码已存在", "编码：" + code);
    const rec = {
      id: f.id || uid("C"),
      code, name,
      contact: String(f.contact || "").trim(),
      phone,
      addr: String(f.addr || "").trim(),
      active: f.active !== false,
    };
    if (f.id) {
      const i = db.customers.findIndex((x) => x.id === f.id);
      if (i < 0) return;
      db.customers[i] = { ...db.customers[i], ...rec };
    } else {
      db.customers.push(rec);
    }
    if (!save()) { render(); return; }
    state.editCustomer = null;
    render();
    alertBox("ok", "保存成功", "客户资料已保存。", name);
  }

  /* ---------- 采购单 ---------- */
  function openNewPO() {
    state.formDirty = false;
    state.poForm = {
      id: null, no: peekPoNo(), supplierId: "", date: fmtD(today),
      lines: [{ productId: "", qty: 1, price: 0 }],
      note: "",
      noFinal: false,
    };
    render();
  }

  function openViewPO(id) {
    const d = db.purchases.find((x) => x.id === id);
    if (!d) return;
    state.viewDoc = { kind: "po", doc: JSON.parse(JSON.stringify(d)) };
    render();
  }

  function editPO(id) {
    const d = db.purchases.find((x) => x.id === id);
    if (!d) return;
    if (d.status !== "草稿") {
      return alertBox(
        "warn",
        "系统提示",
        "该单据不是草稿，文员不可编辑。",
        "单号：" + d.no + "　状态：" + d.status + "。已提交/已审核单据仅能查看。"
      );
    }
    state.formDirty = false;
    state.poForm = JSON.parse(JSON.stringify(d));
    state.viewDoc = null;
    render();
  }

  function savePO(status) {
    const f = state.poForm;
    if (!f) return;
    if (!f.supplierId) return needField("供应商");
    const sup = db.suppliers.find((x) => x.id === f.supplierId);
    if (sup && !sup.active) return alertBox("err", "系统提示", "所选供应商已停用", "请更换供应商后再保存。");
    const lines = validateLines(f.lines, "po", existingLineIds({ id: f.id, kind: "po" }));
    if (!lines) return;

    const rec = {
      id: f.id || uid("PO"),
      no: f.id ? f.no : nextPoNo(),
      supplierId: f.supplierId,
      date: f.date || fmtD(today),
      lines: lines,
      status: status === "draft" ? "草稿" : "待审核",
      createdBy: db.user.name,
      createdAt: f.createdAt || Date.now(),
      note: String(f.note || "").trim(),
      timeline: f.timeline || [],
    };
    rec.timeline.push({
      act: status === "draft" ? "保存草稿" : "提交财务审核",
      who: db.user.name,
      at: Date.now(),
    });

    if (f.id) {
      const i = db.purchases.findIndex((x) => x.id === f.id);
      db.purchases[i] = rec;
    } else {
      db.purchases.unshift(rec);
    }
    if (status !== "draft") markTask("poSubmit");
    logAction(status === "draft" ? "新建采购草稿" : "提交采购单", rec.no + " ¥" + money(lineAmount(rec.lines)));
    if (!save()) { render(); return; }
    state.poForm = null;
    if (status === "draft") {
      alertBox("ok", "系统提示", "单据已保存为草稿", "单号：" + rec.no + "。草稿可继续编辑，提交后需财务审核。");
    } else {
      alertBox("ok", "保存并提交成功", "采购单已提交财务审核", "单号：" + rec.no + "。你无法审核，请等待财务账号处理。");
    }
  }
  function tryApprove() {
    noPermission("审核单据 / 生效单据");
  }

  /* ---------- 销售单 ---------- */
  function openNewSO() {
    state.formDirty = false;
    state.soForm = {
      id: null, no: peekSoNo(), customerId: "", date: fmtD(today),
      lines: [{ productId: "", qty: 1, price: 0 }],
      note: "",
    };
    render();
  }

  function openViewSO(id) {
    const d = db.sales.find((x) => x.id === id);
    if (!d) return;
    state.viewDoc = { kind: "so", doc: JSON.parse(JSON.stringify(d)) };
    render();
  }

  function editSO(id) {
    const d = db.sales.find((x) => x.id === id);
    if (!d) return;
    if (d.status !== "草稿") {
      return alertBox("warn", "系统提示", "该单据不是草稿，文员不可编辑。", "单号：" + d.no + "　状态：" + d.status);
    }
    state.formDirty = false;
    state.soForm = JSON.parse(JSON.stringify(d));
    state.viewDoc = null;
    render();
  }

  function saveSO(status) {
    const f = state.soForm;
    if (!f) return;
    if (!f.customerId) return needField("客户");
    const cus = db.customers.find((x) => x.id === f.customerId);
    if (cus && !cus.active) return alertBox("err", "系统提示", "所选客户已停用", "请更换客户后再保存。");
    const lines = validateLines(f.lines, "so", existingLineIds({ id: f.id, kind: "so" }));
    if (!lines) return;
    if (status !== "draft" && !validateNoOverSell(lines, f.id)) return;

    const rec = {
      id: f.id || uid("SO"),
      no: f.id ? f.no : nextSoNo(),
      customerId: f.customerId,
      date: f.date || fmtD(today),
      lines: lines,
      status: status === "draft" ? "草稿" : "待审核",
      createdBy: db.user.name,
      createdAt: f.createdAt || Date.now(),
      note: String(f.note || "").trim(),
      timeline: f.timeline || [],
    };
    rec.timeline.push({
      act: status === "draft" ? "保存草稿" : "提交财务审核",
      who: db.user.name,
      at: Date.now(),
    });
    if (f.id) {
      const i = db.sales.findIndex((x) => x.id === f.id);
      db.sales[i] = rec;
    } else {
      db.sales.unshift(rec);
    }
    if (status !== "draft") markTask("soSubmit");
    logAction(status === "draft" ? "新建销售草稿" : "提交销售单", rec.no + " ¥" + money(lineAmount(rec.lines)));
    if (!save()) { render(); return; }
    state.soForm = null;
    if (status === "draft") {
      alertBox("ok", "系统提示", "销售单已保存为草稿", "单号：" + rec.no);
    } else {
      alertBox("ok", "保存并提交成功", "销售单已提交财务审核", "单号：" + rec.no + "。审核后仓管才能出库。");
    }
  }

  /* ---------- 报表导出 ---------- */
  function exportCSV(filename, header, rows) {
    const csv =
      "\uFEFF" +
      [header].concat(rows).map((r) => r.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    logAction("导出报表", filename + "（" + rows.length + " 行）");
    save();
    alertBox("ok", "导出成功", "报表已导出", filename + "（UTF-8 带 BOM，可用 Excel 直接打开）。导出内容与当前页面筛选结果一致。");
  }

  function exportStockReport() {
    const q = (state.f.stockQ || "").trim().toLowerCase();
    const list = db.products.filter(
      (p) => !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
    );
    const rows = list.map((p) => [
      p.code, p.name, p.spec || "", p.unit, p.category,
      db.stock[p.id] || 0, p.minStock,
      (db.stock[p.id] || 0) <= p.minStock ? "预警" : "正常",
    ]);
    exportCSV("商品库存表_" + fmtD(today) + ".csv",
      ["商品编码", "品名", "规格", "单位", "分类", "当前库存", "最低库存", "状态"], rows);
  }

  function exportSalesDetail() {
    const from = state.f.rptFrom, to = state.f.rptTo;
    const rows = [];
    db.sales.forEach((so) => {
      if (so.date < from || so.date > to) return;
      so.lines.forEach((l) => {
        const p = productById(l.productId);
        rows.push([
          so.date, so.no, customerName(so.customerId),
          p ? p.code : l.productId, p ? p.name : "",
          l.qty, money(l.price), money(round2(l.qty * l.price)), so.status,
        ]);
      });
    });
    exportCSV("客户销售明细_" + from + "_" + to + ".csv",
      ["日期", "单号", "客户", "商品编码", "品名", "数量", "单价", "金额", "状态"], rows);
  }

  function exportPurchaseDetail() {
    const from = state.f.rptFrom, to = state.f.rptTo;
    const rows = [];
    db.purchases.forEach((po) => {
      if (po.date < from || po.date > to) return;
      po.lines.forEach((l) => {
        const p = productById(l.productId);
        rows.push([
          po.date, po.no, supplierName(po.supplierId),
          p ? p.code : "", p ? p.name : "",
          l.qty, money(l.price), money(round2(l.qty * l.price)), po.status,
        ]);
      });
    });
    exportCSV("采购明细_" + from + "_" + to + ".csv",
      ["日期", "单号", "供应商", "商品编码", "品名", "数量", "单价", "金额", "状态"], rows);
  }

  function exportMove() {
    const rows = filteredMoves().map((m) => [
      m.date, m.type, m.productCode, m.productName, m.unit,
      m.qty, m.refNo, m.operator, m.note || "",
    ]);
    exportCSV("出入库流水_" + state.f.moveFrom + "_" + state.f.moveTo + ".csv",
      ["日期", "类型", "编码", "品名", "单位", "数量", "来源单据", "操作人", "备注"], rows);
  }

  function filteredMoves() {
    const { moveFrom, moveTo, moveType, moveQ } = state.f;
    const q = (moveQ || "").trim().toLowerCase();
    return db.moves.filter((m) => {
      if (moveFrom && m.date < moveFrom) return false;
      if (moveTo && m.date > moveTo) return false;
      if (moveType && m.type !== moveType) return false;
      if (q && !(m.productName.toLowerCase().includes(q) || m.productCode.toLowerCase().includes(q) || (m.refNo || "").toLowerCase().includes(q)))
        return false;
      return true;
    });
  }

  function filteredLedger() {
    // 台账：按自身日期区间 + 关键字筛选（与流水筛选独立）
    const { ledFrom, ledTo, ledQ } = state.f;
    const q = (ledQ || "").trim().toLowerCase();
    return db.moves.filter((m) => {
      if (ledFrom && m.date < ledFrom) return false;
      if (ledTo && m.date > ledTo) return false;
      if (q && !(m.productName.toLowerCase().includes(q) || m.productCode.toLowerCase().includes(q) || (m.refNo || "").toLowerCase().includes(q)))
        return false;
      return true;
    });
  }

  /* ---------- 渲染：HTML 组件 ---------- */
  function h(tag, attrs, children) {
    // 简化：直接拼字符串
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function optList(arr, valueKey, labelFn, selected) {
    return arr
      .map((x) => {
        const v = x[valueKey];
        return `<option value="${esc(v)}" ${v === selected ? "selected" : ""}>${esc(labelFn(x))}</option>`;
      })
      .join("");
  }

  /* 商品下拉：新单仅启用商品；草稿中已停用商品仍可保留显示 */
  function productOptions(selectedId, showStock) {
    const items = db.products.filter((p) => p.active || p.id === selectedId);
    return optList(items, "id", (p) => {
      let label = p.code + " " + p.name;
      if (!p.active) label += "（已停用）";
      else if (showStock) label += "（存" + (db.stock[p.id] || 0) + "）";
      return label;
    }, selectedId);
  }

  /* ---------- 页面：工作台 ---------- */
  function taskBannerHtml() {
    if (db.taskGuideClosed) return "";
    const tasks = taskList();
    const done = tasks.filter((t) => t.done).length;
    const pct = Math.round((done / tasks.length) * 100);
    return `
      <div class="task-banner">
        <div class="tb-left">
          <b>实训任务 L1–L6</b>
          <div class="tb-bar"><div class="tb-fill" style="width:${pct}%"></div></div>
          <span>已完成 ${done}/${tasks.length}</span>
        </div>
        <div class="tb-right">
          <button class="btn btn-sm btn-primary" data-nav="tasks">查看任务卡</button>
          <button class="btn btn-sm" data-act="close-task-guide">关闭引导</button>
        </div>
      </div>
    `;
  }
  function pageHome() {
    const pendingPo = db.purchases.filter((p) => p.status === "待审核").length;
    const draftPo = db.purchases.filter((p) => p.status === "草稿").length;
    const pendingSo = db.sales.filter((p) => p.status === "待审核" || p.status === "待出库").length;
    const draftSo = db.sales.filter((p) => p.status === "草稿").length;
    const lows = lowStockList();
    const totalSku = db.products.filter((p) => p.active).length;

    const recent = [
      ...db.purchases.map((d) => ({ ...d, kind: "采购", party: supplierName(d.supplierId) })),
      ...db.sales.map((d) => ({ ...d, kind: "销售", party: customerName(d.customerId) })),
    ]
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 8);

    return `
      <div class="welcome">
        <div class="av">文员</div>
        <div>
          <h2>您好，${esc(db.user.name)} · ${esc(db.user.role)}</h2>
          <p>公司：${esc(db.company)}　｜　今日：${fmtD(today)}<br/>
          您可进行：基础资料维护、采购/销售单据录入（草稿或提交）、库存与单据查询、业务报表导出。<br/>
          真实企业里您不能：财务审核、成本结转、凭证记账、红冲单据、收付款核销、直接调整库存。本页的「模拟财务/仓管」按钮仅用于单人跑通实训流程。<br/>
          <span class="sub">本页为独立实现的单据流程演练，非管家婆官方产品、与任我行软件无关联；单据、往来单位、商品与金额均为虚构演示数据，不代表任何真实企业。</span></p>
        </div>
        <div class="perm">权限说明<br/>账号类型：商务文员（基础业务）<br/>财务审核：无权限<br/>成本/凭证：无权限<br/>库存调整：无权限</div>
      </div>

      ${taskBannerHtml()}
      <div class="dash-grid">
        <div class="dash-card">
          <div class="k">采购待审核</div>
          <div class="v">${pendingPo}</div>
          <div class="h">草稿另有 ${draftPo} 张</div>
        </div>
        <div class="dash-card">
          <div class="k">销售待处理</div>
          <div class="v">${pendingSo}</div>
          <div class="h">草稿另有 ${draftSo} 张</div>
        </div>
        <div class="dash-card ${lows.length ? "warn" : "ok"}">
          <div class="k">库存预警 SKU</div>
          <div class="v">${lows.length}</div>
          <div class="h">在售商品 ${totalSku} 种</div>
        </div>
        <div class="dash-card ok">
          <div class="k">本月操作提示</div>
          <div class="v" style="font-size:14px;padding-top:6px">录入·查询·导出</div>
          <div class="h">财务审核由主管账号完成</div>
        </div>
      </div>
      <div class="dash-2">
        <div class="box">
          <div class="box-hd">最近单据 <span class="sub">点查看只读详情</span></div>
          <div class="box-bd" style="padding:0">
            <div class="tbl-wrap" style="border:none">
              <table class="tbl">
                <thead><tr>
                  <th>类型</th><th>单号</th><th>往来单位</th><th>日期</th><th class="right">金额</th><th>状态</th><th>操作</th>
                </tr></thead>
                <tbody>
                  ${recent
                    .map(
                      (d) => `<tr>
                      <td>${d.kind}</td>
                      <td class="mono">${esc(d.no)}</td>
                      <td>${esc(d.party)}</td>
                      <td class="mono">${esc(d.date)}</td>
                      <td class="right num">¥${money(lineAmount(d.lines))}</td>
                      <td><span class="st ${statusClass(d.status)}">${esc(d.status)}</span></td>
                      <td><button class="link" data-act="${d.kind === "采购" ? "view-po" : "view-so"}" data-id="${esc(d.id)}">查看</button></td>
                    </tr>`
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div>
          <div class="box">
            <div class="box-hd">快捷操作</div>
            <div class="box-bd">
              <div class="quick-list">
                <button class="quick-item" data-nav="base-products"><strong>维护商品档案</strong><span>新增/编辑/停用</span></button>
                <button class="quick-item" data-act="new-po"><strong>新增采购订单</strong><span>草稿 / 提交审核</span></button>
                <button class="quick-item" data-act="new-so"><strong>新增销售订单</strong><span>选客户选商品</span></button>
                <button class="quick-item" data-nav="stock-alert"><strong>查看库存预警</strong><span>低于最低库存</span></button>
                <button class="quick-item" data-nav="rpt-center"><strong>导出业务报表</strong><span>库存/销售/采购</span></button>
                <button class="quick-item" data-act="tour-restart"><strong>重新开始分步教程</strong><span>一步步带你操作</span></button>
              </div>
            </div>
          </div>

          <div class="box" style="margin-top:10px">
            <div class="box-hd">库存预警 Top <span class="sub">${lows.length} 项</span></div>
            <div class="box-bd" style="padding:0">
              ${
                lows.length
                  ? `<div class="tbl-wrap" style="border:none"><table class="tbl">
                      <thead><tr><th>编码</th><th>品名</th><th class="right">现存</th><th class="right">最低</th></tr></thead>
                      <tbody>${lows
                        .slice(0, 6)
                        .map(
                          (p) => `<tr>
                            <td class="mono">${esc(p.code)}</td>
                            <td>${esc(p.name)}</td>
                            <td class="right num st-low">${p.qty}</td>
                            <td class="right num">${p.minStock}</td>
                          </tr>`
                        )
                        .join("")}</tbody></table></div>`
                  : `<div class="tbl-empty">暂无数据</div>`
              }
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /* ---------- 商品档案列表 ---------- */
  function pageProducts() {
    if (state.editProduct) return pageProductForm();
    const q = state.f.prodQ.trim().toLowerCase();
    const cat = state.f.prodCat;
    const cats = [...new Set(db.products.map((p) => p.category))];
    const list = db.products.filter((p) => {
      if (cat && p.category !== cat) return false;
      if (q && !(p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || (p.spec || "").toLowerCase().includes(q)))
        return false;
      return true;
    });

    return `
      <div class="box">
        <div class="box-hd">查询条件</div>
        <div class="box-bd">
          <div class="filters">
            <div class="f-item"><label>品名/编码/规格</label>
              <input class="input" style="min-width:180px" id="f-prodQ" value="${esc(state.f.prodQ)}" placeholder="如：花生 / SP-001" /></div>
            <div class="f-item"><label>分类</label>
              <select class="select" id="f-prodCat">
                <option value="">全部分类</option>
                ${cats.map((c) => `<option value="${esc(c)}" ${c === cat ? "selected" : ""}>${esc(c)}</option>`).join("")}
              </select></div>
            <div class="f-item"><label>&nbsp;</label>
              <div class="btn-row">
                <button class="btn btn-primary" data-act="prod-search">查询</button>
                <button class="btn" data-act="prod-reset">重置</button>
              </div></div>
          </div>
        </div>
      </div>

      <div class="box">
        <div class="box-hd">商品档案列表 <span class="sub">共 ${list.length} 条</span></div>
        <div class="box-bd">
          <div class="btn-row" style="margin-bottom:8px">
            <button class="btn btn-primary" data-act="new-product">新增商品</button>
            <button class="btn" data-act="perm-cost">修改参考成本</button>
            <span class="locked">文员不可批量删除、不可改成本结转价</span>
          </div>
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr>
                <th>编码</th><th>品名</th><th>规格</th><th>单位</th><th>分类</th>
                <th class="right">参考进价</th><th class="right">参考售价</th>
                <th class="right">最低库存</th><th class="right">当前库存</th><th>状态</th><th>操作</th>
              </tr></thead>
              <tbody>
                ${
                  list.length
                    ? list
                        .map((p) => {
                          const qty = db.stock[p.id] || 0;
                          return `<tr>
                          <td class="mono">${esc(p.code)}</td>
                          <td>${esc(p.name)}</td>
                          <td>${esc(p.spec || "—")}</td>
                          <td>${esc(p.unit)}</td>
                          <td>${esc(p.category)}</td>
                          <td class="right num">${money(p.cost)}</td>
                          <td class="right num">${money(p.price)}</td>
                          <td class="right num">${p.minStock}</td>
                          <td class="right num ${qty <= p.minStock ? "st-low" : ""}">${qty}</td>
                          <td><span class="st ${p.active ? "st-on" : "st-off"}">${p.active ? "启用" : "停用"}</span></td>
                          <td class="btn-row">
                            <button class="link" data-act="edit-product" data-id="${esc(p.id)}">编辑</button>
                            <button class="link" data-act="toggle-product" data-id="${esc(p.id)}">${p.active ? "停用" : "启用"}</button>
                          </td>
                        </tr>`;
                        })
                        .join("")
                    : `<tr><td colspan="11" class="tbl-empty">暂无数据</td></tr>`
                }
              </tbody>
            </table>
          </div>
        </div>
        <div class="box-ft">
          <button class="btn" data-nav="home">返回工作台</button>
        </div>
      </div>
    `;
  }

  function pageProductForm() {
    const f = state.editProduct;
    if (!f) return "";
    return `
      <div class="box">
        <div class="box-hd">${f.id ? "编辑商品档案" : "新增商品档案"} <span class="sub">带 * 为必填</span></div>
        <div class="box-bd">
          <div class="form-grid">
            <div class="fi"><label>商品编码<span class="req">*</span></label>
              <input class="input" id="p-code" value="${esc(f.code)}" /></div>
            <div class="fi"><label>品名<span class="req">*</span></label>
              <input class="input" id="p-name" value="${esc(f.name)}" placeholder="如：原味花生" /></div>
            <div class="fi"><label>规格</label>
              <input class="input" id="p-spec" value="${esc(f.spec || "")}" placeholder="如：500g/包" /></div>
            <div class="fi"><label>单位<span class="req">*</span></label>
              <input class="input" id="p-unit" value="${esc(f.unit)}" placeholder="包/箱/袋" /></div>
            <div class="fi"><label>分类</label>
              <input class="input" id="p-cat" value="${esc(f.category)}" placeholder="农副食品/日用百货" /></div>
            <div class="fi"><label>最低库存（预警）</label>
              <input class="input num" type="number" min="0" step="1" id="p-min" value="${f.minStock}" /></div>
            <div class="fi"><label>参考进价</label>
              <input class="input num" type="number" min="0" step="0.01" id="p-cost" value="${f.cost}" />
              <span class="hint">仅作单据默认价，不可做成本结转</span></div>
            <div class="fi"><label>参考售价</label>
              <input class="input num" type="number" min="0" step="0.01" id="p-price" value="${f.price}" /></div>
            <div class="fi"><label>状态</label>
              <select class="select" id="p-active">
                <option value="1" ${f.active ? "selected" : ""}>启用</option>
                <option value="0" ${!f.active ? "selected" : ""}>停用</option>
              </select></div>
          </div>
        </div>
        <div class="box-ft">
          <button class="btn" data-act="cancel-product">返回列表</button>
          <button class="btn btn-primary" data-act="save-product">保存</button>
        </div>
      </div>
    `;
  }

  /* ---------- 供应商 / 客户 ---------- */
  function pageSuppliers() {
    if (state.editSupplier) return pageSupplierForm();
    const q = state.f.supQ.trim().toLowerCase();
    const list = db.suppliers.filter(
      (s) => !q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
    );
    return `
      <div class="box">
        <div class="box-hd">查询</div>
        <div class="box-bd">
          <div class="filters">
            <div class="f-item"><label>名称/编码</label>
              <input class="input" style="min-width:200px" id="f-supQ" value="${esc(state.f.supQ)}" /></div>
            <div class="f-item"><label>&nbsp;</label>
              <div class="btn-row">
                <button class="btn btn-primary" data-act="sup-search">查询</button>
                <button class="btn" data-act="sup-reset">重置</button>
                <button class="btn btn-primary" data-act="new-supplier">新增供应商</button>
              </div></div>
          </div>
        </div>
      </div>
      <div class="box">
        <div class="box-hd">供应商列表 <span class="sub">${list.length} 条</span></div>
        <div class="box-bd">
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr><th>编码</th><th>名称</th><th>联系人</th><th>电话</th><th>地址</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                ${
                  list.length
                    ? list
                        .map(
                          (s) => `<tr>
                    <td class="mono">${esc(s.code)}</td>
                    <td>${esc(s.name)}</td>
                    <td>${esc(s.contact || "—")}</td>
                    <td class="mono">${esc(s.phone || "—")}</td>
                    <td>${esc(s.addr || "—")}</td>
                    <td><span class="st ${s.active ? "st-on" : "st-off"}">${s.active ? "启用" : "停用"}</span></td>
                    <td><button class="link" data-act="edit-supplier" data-id="${esc(s.id)}">编辑</button></td>
                  </tr>`
                        )
                        .join("")
                    : `<tr><td colspan="7" class="tbl-empty">暂无数据</td></tr>`
                }
              </tbody>
            </table>
          </div>
        </div>
        <div class="box-ft"><button class="btn" data-nav="home">返回工作台</button></div>
      </div>
    `;
  }

  function pageSupplierForm() {
    const f = state.editSupplier;
    if (!f) return "";
    return `
      <div class="box">
        <div class="box-hd">${f.id ? "编辑供应商" : "新增供应商"}</div>
        <div class="box-bd">
          <div class="form-grid">
            <div class="fi"><label>编码<span class="req">*</span></label><input class="input" id="s-code" value="${esc(f.code)}" /></div>
            <div class="fi"><label>名称<span class="req">*</span></label><input class="input" id="s-name" value="${esc(f.name)}" /></div>
            <div class="fi"><label>联系人</label><input class="input" id="s-contact" value="${esc(f.contact)}" /></div>
            <div class="fi"><label>电话</label><input class="input" id="s-phone" value="${esc(f.phone)}" placeholder="手机或座机，可留空" /><span class="hint">格式：1xxxxxxxxxx 或 0xxx-xxxxxxx</span></div>
            <div class="fi" style="grid-column:1/-1"><label>地址</label><input class="input" id="s-addr" value="${esc(f.addr)}" /></div>
          </div>
        </div>
        <div class="box-ft">
          <button class="btn" data-act="cancel-supplier">返回列表</button>
          <button class="btn btn-primary" data-act="save-supplier">保存</button>
        </div>
      </div>
    `;
  }

  function pageCustomers() {
    if (state.editCustomer) return pageCustomerForm();
    const q = state.f.cusQ.trim().toLowerCase();
    const list = db.customers.filter(
      (c) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
    return `
      <div class="box">
        <div class="box-hd">查询</div>
        <div class="box-bd">
          <div class="filters">
            <div class="f-item"><label>名称/编码</label>
              <input class="input" style="min-width:200px" id="f-cusQ" value="${esc(state.f.cusQ)}" /></div>
            <div class="f-item"><label>&nbsp;</label>
              <div class="btn-row">
                <button class="btn btn-primary" data-act="cus-search">查询</button>
                <button class="btn" data-act="cus-reset">重置</button>
                <button class="btn btn-primary" data-act="new-customer">新增客户</button>
              </div></div>
          </div>
        </div>
      </div>
      <div class="box">
        <div class="box-hd">客户列表 <span class="sub">${list.length} 条</span></div>
        <div class="box-bd">
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr><th>编码</th><th>名称</th><th>联系人</th><th>电话</th><th>地址</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                ${
                  list.length
                    ? list
                        .map(
                          (c) => `<tr>
                    <td class="mono">${esc(c.code)}</td>
                    <td>${esc(c.name)}</td>
                    <td>${esc(c.contact || "—")}</td>
                    <td class="mono">${esc(c.phone || "—")}</td>
                    <td>${esc(c.addr || "—")}</td>
                    <td><span class="st ${c.active ? "st-on" : "st-off"}">${c.active ? "启用" : "停用"}</span></td>
                    <td><button class="link" data-act="edit-customer" data-id="${esc(c.id)}">编辑</button></td>
                  </tr>`
                        )
                        .join("")
                    : `<tr><td colspan="7" class="tbl-empty">暂无数据</td></tr>`
                }
              </tbody>
            </table>
          </div>
        </div>
        <div class="box-ft"><button class="btn" data-nav="home">返回工作台</button></div>
      </div>
    `;
  }

  function pageCustomerForm() {
    const f = state.editCustomer;
    if (!f) return "";
    return `
      <div class="box">
        <div class="box-hd">${f.id ? "编辑客户" : "新增客户"}</div>
        <div class="box-bd">
          <div class="form-grid">
            <div class="fi"><label>编码<span class="req">*</span></label><input class="input" id="c-code" value="${esc(f.code)}" /></div>
            <div class="fi"><label>名称<span class="req">*</span></label><input class="input" id="c-name" value="${esc(f.name)}" placeholder="如：老街坊便利店（建政店）" /></div>
            <div class="fi"><label>联系人</label><input class="input" id="c-contact" value="${esc(f.contact)}" /></div>
            <div class="fi"><label>电话</label><input class="input" id="c-phone" value="${esc(f.phone)}" placeholder="手机或座机，可留空" /><span class="hint">格式：1xxxxxxxxxx 或 0xxx-xxxxxxx</span></div>
            <div class="fi" style="grid-column:1/-1"><label>地址</label><input class="input" id="c-addr" value="${esc(f.addr)}" /></div>
          </div>
        </div>
        <div class="box-ft">
          <button class="btn" data-act="cancel-customer">返回列表</button>
          <button class="btn btn-primary" data-act="save-customer">保存</button>
        </div>
      </div>
    `;
  }

  /* ---------- 采购列表 ---------- */
  function pagePurchaseList() {
    if (state.poForm) return pagePOForm();
    if (state.viewDoc && state.viewDoc.kind === "po") return pagePOView();
    return poListCommon("采购订单", "purchase");
  }

  function pagePurchaseIn() {
    if (state.viewDoc && state.viewDoc.kind === "po") return pagePOView();
    return poListCommon("采购入库单（已执行）", "purchase-in");
  }

  function poListCommon(title, mode) {
    const st = state.f.poStatus;
    const q = state.f.poQ.trim().toLowerCase();
    let list = db.purchases;
    if (mode === "purchase-in") list = list.filter((d) => d.status === "已入库");
    list = list.filter((d) => {
      if (st && d.status !== st) return false;
      if (q && !(d.no.toLowerCase().includes(q) || supplierName(d.supplierId).toLowerCase().includes(q)))
        return false;
      return true;
    });
    const totalQty = list.reduce((s, d) => s + d.lines.reduce((x, l) => x + (Number(l.qty) || 0), 0), 0);
    const totalAmt = list.reduce((s, d) => s + lineAmount(d.lines), 0);
    const fullList = list;
    const pg = paginate(fullList, "po");
    list = pg.rows;
    const actions = (d) => `
      <button class="link" data-act="view-po" data-id="${esc(d.id)}">查看</button>
      ${d.status === "草稿" ? `<button class="link" data-act="edit-po" data-id="${esc(d.id)}">编辑</button>` : ""}
      ${d.status === "待审核" ? `<button class="link" data-act="audit-po" data-id="${esc(d.id)}">审核</button>` : ""}
      ${d.status === "已审核" ? `<button class="link" data-act="receive-po" data-id="${esc(d.id)}">入库</button>` : ""}
      ${d.status === "草稿" ? `<button class="link danger" data-act="delete-doc" data-kind="po" data-id="${esc(d.id)}">删除</button>` : ""}`;
    const cards = list.map((d) => {
      const qty = d.lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
      return `<div class="list-card">
        <div class="lc-hd"><span class="mono">${esc(d.no)}</span><span class="st ${statusClass(d.status)}">${esc(d.status)}</span></div>
        <div class="lc-main">${esc(supplierName(d.supplierId))}<span class="lc-date">${esc(d.date)}</span></div>
        <div class="lc-meta">数量 ${qty} · 金额 ¥${money(lineAmount(d.lines))}</div>
        <div class="lc-actions">${actions(d)}</div>
      </div>`;
    }).join("");

    return `
      <div class="box">
        <div class="box-hd">查询条件</div>
        <div class="box-bd">
          <div class="filters">
            <div class="f-item"><label>单号/供应商</label>
              <input class="input" style="min-width:180px" id="f-poQ" value="${esc(state.f.poQ)}" /></div>
            <div class="f-item"><label>单据状态</label>
              <select class="select" id="f-poStatus">
                <option value="">全部</option>
                ${["草稿", "待审核", "已审核", "已入库", "已作废"]
                  .map((s) => `<option value="${s}" ${st === s ? "selected" : ""}>${s}</option>`)
                  .join("")}
              </select></div>
            <div class="f-item"><label>&nbsp;</label>
              <div class="btn-row">
                <button class="btn btn-primary" data-act="po-search">查询</button>
                <button class="btn" data-act="po-reset">重置</button>
              </div></div>
          </div>
        </div>
      </div>
      <div class="box">
        <div class="box-hd">${esc(title)} <span class="sub">共 ${fullList.length} 张 · 数量 ${totalQty} · 金额 ¥${money(round2(totalAmt))}</span></div>
        <div class="box-bd">
          <div class="btn-row" style="margin-bottom:8px">
            <button class="btn btn-primary" data-act="new-po">新增采购订单</button>
            <button class="btn" data-act="po-export">导出列表</button>
            <button class="btn" data-act="perm-approve">财务审核</button>
            <span class="locked">提交后需财务审核才能入库生效；文员不能审核/红冲</span>
          </div>
          <div class="tbl-wrap list-table">
            <table class="tbl">
              <thead><tr>
                <th>单号</th><th>供应商</th><th>日期</th><th class="right">数量</th>
                <th class="right">金额</th><th>状态</th><th>制单人</th><th>操作</th>
              </tr></thead>
              <tbody>
                ${
                  list.length
                    ? list
                        .map((d) => {
                          const qty = d.lines.reduce((s, l) => s + l.qty, 0);
                          return `<tr>
                          <td class="mono">${esc(d.no)}</td>
                          <td>${esc(supplierName(d.supplierId))}</td>
                          <td class="mono">${esc(d.date)}</td>
                          <td class="right num">${qty}</td>
                          <td class="right num">¥${money(lineAmount(d.lines))}</td>
                          <td><span class="st ${statusClass(d.status)}">${esc(d.status)}</span></td>
                          <td>${esc(d.createdBy)}</td>
                          <td class="btn-row">${actions(d)}</td>
                        </tr>`;
                        })
                        .join("")
                    : `<tr><td colspan="8" class="tbl-empty">暂无数据</td></tr>`
                }
              </tbody>
            </table>
          </div>
          ${pg.html}
          <div class="list-cards">${cards || '<div class="tbl-empty">暂无数据</div>'}</div>
        </div>
        <div class="box-ft">
          <button class="btn" data-nav="home">返回工作台</button>
          <button class="btn" data-nav="base">返回上级菜单</button>
        </div>
      </div>
    `;
  }

  function pagePOForm() {
    const f = state.poForm;
    if (!f) return "";
    const amt = lineAmount(f.lines);
    return `
      <div class="box">
        <div class="box-hd">${f.id ? "编辑采购订单（草稿）" : "新增采购订单"} <span class="sub">保存后须财务审核</span></div>
        <div class="box-bd">
          <div class="form-grid">
            <div class="fi"><label>单号</label><input class="input" value="${esc(f.no)}" disabled /></div>
            <div class="fi"><label>供应商<span class="req">*</span></label>
              <select class="select" id="po-sup">
                <option value="">请选择供应商</option>
                ${optList(db.suppliers.filter((s) => s.active), "id", (s) => s.name, f.supplierId)}
              </select></div>
            <div class="fi"><label>单据日期</label>
              <input class="input date" type="date" id="po-date" value="${esc(f.date)}" /></div>
            <div class="fi" style="grid-column:1/-1"><label>备注</label>
              <input class="input" id="po-note" value="${esc(f.note || "")}" placeholder="选填" /></div>
          </div>

          <div style="margin-top:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <b>商品明细</b>
              <button class="btn btn-sm" data-act="po-add-line" style="height:24px">+ 添加行</button>
            </div>
            <div class="tbl-wrap">
              <table class="tbl lines">
                <thead><tr>
                  <th style="min-width:180px">商品<span class="req">*</span></th>
                  <th style="width:90px">数量</th>
                  <th style="width:100px">单价</th>
                  <th class="right" style="width:90px">金额</th>
                  <th style="width:50px"></th>
                </tr></thead>
                <tbody>
                  ${f.lines
                    .map(
                      (l, i) => `<tr>
                      <td>
                        <select data-line-p="${i}">
                          <option value="">选择商品</option>
                          ${productOptions(l.productId, false)}
                        </select>
                      </td>
                      <td><input type="number" min="1" class="num" data-line-q="${i}" value="${l.qty}" /></td>
                      <td><input type="number" min="0" step="0.01" class="num" data-line-pr="${i}" value="${l.price}" /></td>
                      <td class="right num">¥${money(round2(l.qty * l.price))}</td>
                      <td><button class="link danger" data-act="po-del-line" data-i="${i}">删</button></td>
                    </tr>`
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
            ${stockPreviewHtml(f.lines, 1, "库存变动预览 · 采购入库（增加）")}
            <div class="total-line">合计金额：<b>¥${money(amt)}</b></div>
          </div>
        </div>
        <div class="box-ft">
          <button class="btn" data-act="cancel-po">返回列表</button>
          <button class="btn" data-act="save-po-draft">保存草稿（Ctrl+S）</button>
          <button class="btn btn-primary" data-act="save-po-submit">保存并提交审核</button>
        </div>
      </div>
    `;
  }

  function pagePOView() {
    const d = state.viewDoc.doc;
    const qty = d.lines.reduce((s, l) => s + l.qty, 0);
    return `
      <div class="box print-doc">
        <div class="box-hd">采购单据详情（只读） <span class="st ${statusClass(d.status)}">${esc(d.status)}</span>
          <button class="btn btn-sm no-print" data-act="print-doc" style="margin-left:auto">打印</button>
        </div>
        <div class="box-bd">
          <div class="form-grid">
            <div class="fi"><label>单号</label><div>${esc(d.no)}</div></div>
            <div class="fi"><label>供应商</label><div>${esc(supplierName(d.supplierId))}</div></div>
            <div class="fi"><label>日期</label><div class="mono">${esc(d.date)}</div></div>
            <div class="fi"><label>制单人</label><div>${esc(d.createdBy)}</div></div>
            <div class="fi"><label>数量合计</label><div class="num">${qty}</div></div>
            <div class="fi"><label>金额合计</label><div class="num">¥${money(lineAmount(d.lines))}</div></div>
            <div class="fi" style="grid-column:1/-1"><label>备注</label><div>${esc(d.note || "—")}</div></div>
          </div>
          <div style="margin-top:12px"><b>明细</b>
            <div class="tbl-wrap" style="margin-top:6px">
              <table class="tbl">
                <thead><tr><th>编码</th><th>品名</th><th>单位</th><th class="right">数量</th><th class="right">单价</th><th class="right">金额</th></tr></thead>
                <tbody>
                  ${d.lines
                    .map((l) => {
                      const p = productById(l.productId);
                      return `<tr>
                      <td class="mono">${esc(p?.code || "")}</td>
                      <td>${esc(p?.name || "")}</td>
                      <td>${esc(p?.unit || "")}</td>
                      <td class="right num">${l.qty}</td>
                      <td class="right num">${money(l.price)}</td>
                      <td class="right num">${money(round2(l.qty * l.price))}</td>
                    </tr>`;
                    })
                    .join("")}
                </tbody>
              </table>
            </div>
          </div>
          <div style="margin-top:12px"><b>操作时间线</b></div>
          ${timelineHtml(d.timeline)}
          ${
            d.status === "待审核"
              ? `<div class="notice-warn">待财务审核。你可以点「模拟财务审核」看看无权限提示（文员真实环境不能审核）。</div>`
              : ""
          }
          <div class="sign-row">
            <div>制单人：____________</div>
            <div>审核人：____________</div>
            <div>仓管确认：____________</div>
            <div>日期：____________</div>
          </div>
        </div>
        <div class="box-ft no-print">
          <button class="btn" data-act="close-view">返回列表</button>
          ${d.status === "草稿" ? `<button class="btn btn-primary" data-act="edit-po" data-id="${esc(d.id)}">编辑草稿</button>` : ""}
          ${d.status === "草稿" ? `<button class="btn danger" data-act="delete-doc" data-kind="po" data-id="${esc(d.id)}">删除草稿</button>` : ""}
          ${d.status === "待审核" ? `<button class="btn btn-primary" data-act="audit-po" data-id="${esc(d.id)}">模拟财务审核</button>` : ""}
          ${d.status === "待审核" ? `<button class="btn" data-act="void-doc" data-kind="po" data-id="${esc(d.id)}">作废</button>` : ""}
          ${d.status === "已审核" ? `<button class="btn btn-primary" data-act="receive-po" data-id="${esc(d.id)}">模拟仓管入库</button>` : ""}
          ${d.status === "已入库" ? `<button class="btn" data-act="red-flush" data-kind="po" data-id="${esc(d.id)}">模拟财务红冲</button>` : ""}
          <button class="btn" data-act="print-doc">打印</button>
        </div>
      </div>
    `;
  }
  /* ---------- 销售 ---------- */
  function pageSalesList() {
    if (state.soForm) return pageSOForm();
    if (state.viewDoc && state.viewDoc.kind === "so") return pageSOView();
    return soListCommon("销售订单", "sales");
  }

  function pageSalesOut() {
    if (state.viewDoc && state.viewDoc.kind === "so") return pageSOView();
    return soListCommon("销售出库单（已执行）", "sales-out");
  }

  function soListCommon(title, mode) {
    const st = state.f.soStatus;
    const q = state.f.soQ.trim().toLowerCase();
    let list = db.sales;
    if (mode === "sales-out") list = list.filter((d) => d.status === "已出库" || d.status === "部分出库");
    list = list.filter((d) => {
      if (st && d.status !== st) return false;
      if (q && !(d.no.toLowerCase().includes(q) || customerName(d.customerId).toLowerCase().includes(q)))
        return false;
      return true;
    });
    const totalQty = list.reduce((s, d) => s + d.lines.reduce((x, l) => x + (Number(l.qty) || 0), 0), 0);
    const totalAmt = list.reduce((s, d) => s + lineAmount(d.lines), 0);
    const fullList = list;
    const pg = paginate(fullList, "so");
    list = pg.rows;
    const actions = (d) => `
      <button class="link" data-act="view-so" data-id="${esc(d.id)}">查看</button>
      ${d.status === "草稿" ? `<button class="link" data-act="edit-so" data-id="${esc(d.id)}">编辑</button>` : ""}
      ${d.status === "待审核" ? `<button class="link" data-act="audit-so" data-id="${esc(d.id)}">审核</button>` : ""}
      ${d.status === "待出库" || d.status === "部分出库" ? `<button class="link" data-act="ship-so" data-id="${esc(d.id)}">出库</button>` : ""}
      ${d.status === "草稿" ? `<button class="link danger" data-act="delete-doc" data-kind="so" data-id="${esc(d.id)}">删除</button>` : ""}`;
    const cards = list.map((d) => {
      const qty = d.lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
      return `<div class="list-card">
        <div class="lc-hd"><span class="mono">${esc(d.no)}</span><span class="st ${statusClass(d.status)}">${esc(d.status)}</span></div>
        <div class="lc-main">${esc(customerName(d.customerId))}<span class="lc-date">${esc(d.date)}</span></div>
        <div class="lc-meta">数量 ${qty} · 金额 ¥${money(lineAmount(d.lines))}</div>
        <div class="lc-actions">${actions(d)}</div>
      </div>`;
    }).join("");

    return `
      <div class="box">
        <div class="box-hd">查询条件</div>
        <div class="box-bd">
          <div class="filters">
            <div class="f-item"><label>单号/客户</label>
              <input class="input" style="min-width:180px" id="f-soQ" value="${esc(state.f.soQ)}" /></div>
            <div class="f-item"><label>订单状态</label>
              <select class="select" id="f-soStatus">
                <option value="">全部</option>
                ${["草稿", "待审核", "待出库", "部分出库", "已出库", "已作废"]
                  .map((s) => `<option value="${s}" ${st === s ? "selected" : ""}>${s}</option>`)
                  .join("")}
              </select></div>
            <div class="f-item"><label>&nbsp;</label>
              <div class="btn-row">
                <button class="btn btn-primary" data-act="so-search">查询</button>
                <button class="btn" data-act="so-reset">重置</button>
              </div></div>
          </div>
        </div>
      </div>
      <div class="box">
        <div class="box-hd">${esc(title)} <span class="sub">共 ${fullList.length} 张 · 数量 ${totalQty} · 金额 ¥${money(round2(totalAmt))}</span></div>
        <div class="box-bd">
          <div class="btn-row" style="margin-bottom:8px">
            <button class="btn btn-primary" data-act="new-so">新增销售订单</button>
            <button class="btn" data-act="so-export">导出销售明细</button>
            <button class="btn" data-act="perm-approve">财务审核</button>
            <span class="locked">状态：草稿→待审核→待出库→部分出库/已出库；文员不能审核、不能核销收款</span>
          </div>
          <div class="tbl-wrap list-table">
            <table class="tbl">
              <thead><tr>
                <th>单号</th><th>客户</th><th>日期</th><th class="right">数量</th>
                <th class="right">金额</th><th>状态</th><th>制单人</th><th>操作</th>
              </tr></thead>
              <tbody>
                ${
                  list.length
                    ? list
                        .map((d) => {
                          const qty = d.lines.reduce((s, l) => s + l.qty, 0);
                          return `<tr>
                          <td class="mono">${esc(d.no)}</td>
                          <td>${esc(customerName(d.customerId))}</td>
                          <td class="mono">${esc(d.date)}</td>
                          <td class="right num">${qty}</td>
                          <td class="right num">¥${money(lineAmount(d.lines))}</td>
                          <td><span class="st ${statusClass(d.status)}">${esc(d.status)}</span></td>
                          <td>${esc(d.createdBy)}</td>
                          <td class="btn-row">${actions(d)}</td>
                        </tr>`;
                        })
                        .join("")
                    : `<tr><td colspan="8" class="tbl-empty">暂无数据</td></tr>`
                }
              </tbody>
            </table>
          </div>
          ${pg.html}
          <div class="list-cards">${cards || '<div class="tbl-empty">暂无数据</div>'}</div>
        </div>
        <div class="box-ft">
          <button class="btn" data-nav="home">返回工作台</button>
        </div>
      </div>
    `;
  }

  function pageSOForm() {
    const f = state.soForm;
    if (!f) return "";
    return `
      <div class="box">
        <div class="box-hd">${f.id ? "编辑销售订单（草稿）" : "新增销售订单"} <span class="sub">提交后待财务审核→仓管出库</span></div>
        <div class="box-bd">
          <div class="form-grid">
            <div class="fi"><label>单号</label><input class="input" value="${esc(f.no)}" disabled /></div>
            <div class="fi"><label>客户<span class="req">*</span></label>
              <select class="select" id="so-cus">
                <option value="">请选择客户</option>
                ${optList(db.customers.filter((c) => c.active), "id", (c) => c.name, f.customerId)}
              </select></div>
            <div class="fi"><label>单据日期</label>
              <input class="input date" type="date" id="so-date" value="${esc(f.date)}" /></div>
            <div class="fi" style="grid-column:1/-1"><label>备注</label>
              <input class="input" id="so-note" value="${esc(f.note || "")}" /></div>
          </div>
          <div style="margin-top:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <b>商品明细</b>
              <button class="btn" data-act="so-add-line" style="height:24px">+ 添加行</button>
            </div>
            <div class="tbl-wrap">
              <table class="tbl lines">
                <thead><tr>
                  <th style="min-width:180px">商品<span class="req">*</span></th>
                  <th style="width:90px">数量</th>
                  <th style="width:100px">单价</th>
                  <th class="right" style="width:80px">可用库存</th>
                  <th class="right" style="width:90px">金额</th>
                  <th style="width:50px"></th>
                </tr></thead>
                <tbody>
                  ${f.lines
                    .map((l, i) => {
                      const avail = l.productId ? availableQty(l.productId, f.id) : "—";
                      return `<tr>
                      <td>
                        <select data-sline-p="${i}">
                          <option value="">选择商品</option>
                          ${productOptions(l.productId, true)}
                        </select>
                      </td>
                      <td><input type="number" min="1" class="num" data-sline-q="${i}" value="${l.qty}" /></td>
                      <td><input type="number" min="0" step="0.01" class="num" data-sline-pr="${i}" value="${l.price}" /></td>
                      <td class="right num">${avail}</td>
                      <td class="right num">¥${money(round2(l.qty * l.price))}</td>
                      <td><button class="link danger" data-act="so-del-line" data-i="${i}">删</button></td>
                    </tr>`;
                    })
                    .join("")}
                </tbody>
              </table>
            </div>
            ${stockPreviewHtml(f.lines, -1, "库存变动预览 · 销售出库（防超卖）", f.id)}
            <div class="total-line">合计金额：<b>¥${money(lineAmount(f.lines))}</b></div>
          </div>
        </div>
        <div class="box-ft">
          <button class="btn" data-act="cancel-so">返回列表</button>
          <button class="btn" data-act="save-so-draft">保存草稿（Ctrl+S）</button>
          <button class="btn btn-primary" data-act="save-so-submit">保存并提交审核</button>
        </div>
      </div>
    `;
  }

  function pageSOView() {
    const d = state.viewDoc.doc;
    return `
      <div class="box print-doc">
        <div class="box-hd">销售单据详情（只读） <span class="st ${statusClass(d.status)}">${esc(d.status)}</span>
          <button class="btn btn-sm no-print" data-act="print-doc" style="margin-left:auto">打印</button>
        </div>
        <div class="box-bd">
          <div class="form-grid">
            <div class="fi"><label>单号</label><div>${esc(d.no)}</div></div>
            <div class="fi"><label>客户</label><div>${esc(customerName(d.customerId))}</div></div>
            <div class="fi"><label>日期</label><div class="mono">${esc(d.date)}</div></div>
            <div class="fi"><label>制单人</label><div>${esc(d.createdBy)}</div></div>
            <div class="fi"><label>金额合计</label><div class="num">¥${money(lineAmount(d.lines))}</div></div>
            <div class="fi"><label>备注</label><div>${esc(d.note || "—")}</div></div>
          </div>
          <div style="margin-top:12px"><b>明细</b>
            <div class="tbl-wrap" style="margin-top:6px">
              <table class="tbl">
                <thead><tr><th>编码</th><th>品名</th><th class="right">数量</th><th class="right">单价</th><th class="right">金额</th><th class="right">当前库存</th></tr></thead>
                <tbody>
                  ${d.lines
                    .map((l) => {
                      const p = productById(l.productId);
                      return `<tr>
                      <td class="mono">${esc(p?.code || "")}</td>
                      <td>${esc(p?.name || "")}</td>
                      <td class="right num">${l.qty}</td>
                      <td class="right num">${money(l.price)}</td>
                      <td class="right num">${money(round2(l.qty * l.price))}</td>
                      <td class="right num">${p ? db.stock[p.id] || 0 : "—"}</td>
                    </tr>`;
                    })
                    .join("")}
                </tbody>
              </table>
            </div>
          </div>
          <div style="margin-top:12px"><b>操作时间线</b></div>
          ${timelineHtml(d.timeline)}
          <div class="sign-row">
            <div>制单人：____________</div>
            <div>审核人：____________</div>
            <div>仓管确认：____________</div>
            <div>日期：____________</div>
          </div>
        </div>
        <div class="box-ft no-print">
          <button class="btn" data-act="close-view">返回列表</button>
          ${d.status === "草稿" ? `<button class="btn btn-primary" data-act="edit-so" data-id="${esc(d.id)}">编辑草稿</button>` : ""}
          ${d.status === "草稿" ? `<button class="btn" data-act="delete-doc" data-kind="so" data-id="${esc(d.id)}">删除草稿</button>` : ""}
          ${d.status === "待审核" ? `<button class="btn btn-primary" data-act="audit-so" data-id="${esc(d.id)}">模拟财务审核</button>` : ""}
          ${d.status === "待审核" ? `<button class="btn" data-act="void-doc" data-kind="so" data-id="${esc(d.id)}">作废</button>` : ""}
          ${d.status === "待出库" || d.status === "部分出库" ? `<button class="btn btn-primary" data-act="ship-so" data-id="${esc(d.id)}">模拟仓管出库</button>` : ""}
          ${d.status === "已出库" || d.status === "部分出库" ? `<button class="btn" data-act="red-flush" data-kind="so" data-id="${esc(d.id)}">模拟财务红冲</button>` : ""}
          <button class="btn" data-act="print-doc">打印</button>
        </div>
      </div>
    `;
  }
  /* ---------- 库存 ---------- */
  function pageStockQuery() {
    const q = state.f.stockQ.trim().toLowerCase();
    const list = db.products.filter(
      (p) => !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
    );
    return `
      <div class="box">
        <div class="box-hd">查询条件</div>
        <div class="box-bd">
          <div class="filters">
            <div class="f-item"><label>品名/编码</label>
              <input class="input" style="min-width:200px" id="f-stockQ" value="${esc(state.f.stockQ)}" /></div>
            <div class="f-item"><label>&nbsp;</label>
              <div class="btn-row">
                <button class="btn btn-primary" data-act="stock-search">查询</button>
                <button class="btn" data-act="stock-reset">重置</button>
                <button class="btn" data-act="stock-export">导出库存表</button>
              </div></div>
          </div>
        </div>
      </div>
      <div class="box">
        <div class="box-hd">实时库存 <span class="sub">文员只负责核对数量，不能直接调整</span></div>
        <div class="box-bd">
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr>
                <th>编码</th><th>品名</th><th>规格</th><th>单位</th><th>分类</th>
                <th class="right">当前库存</th><th class="right">最低库存</th><th>库存状态</th>
              </tr></thead>
              <tbody>
                ${
                  list.length
                    ? list
                        .map((p) => {
                          const qty = db.stock[p.id] || 0;
                          const low = qty <= p.minStock;
                          return `<tr>
                    <td class="mono">${esc(p.code)}</td>
                    <td>${esc(p.name)}</td>
                    <td>${esc(p.spec || "—")}</td>
                    <td>${esc(p.unit)}</td>
                    <td>${esc(p.category)}</td>
                    <td class="right num" style="font-weight:600">${qty}</td>
                    <td class="right num">${p.minStock}</td>
                    <td><span class="st ${low ? "st-low" : "st-ok"}">${qty <= 0 ? "缺货" : low ? "预警" : "正常"}</span></td>
                  </tr>`;
                        })
                        .join("")
                    : `<tr><td colspan="8" class="tbl-empty">暂无数据</td></tr>`
                }
              </tbody>
            </table>
          </div>
        </div>
        <div class="box-ft">
          <button class="btn" data-nav="home">返回工作台</button>
          <button class="btn" data-act="perm-adjust">库存调整</button>
        </div>
      </div>
    `;
  }

  function pageStockAlert() {
    const lows = lowStockList();
    return `
      <div class="box">
        <div class="box-hd">库存预警列表 <span class="sub">当前库存 ≤ 最低库存</span></div>
        <div class="box-bd">
          <div class="btn-row" style="margin-bottom:8px">
            <button class="btn" data-act="stock-export">导出库存表</button>
            <span class="locked">请核对后录入采购单补货，不能直接改库存数</span>
          </div>
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr>
                <th>编码</th><th>品名</th><th>分类</th><th class="right">当前库存</th>
                <th class="right">最低库存</th><th class="right">缺口</th><th>建议</th>
              </tr></thead>
              <tbody>
                ${
                  lows.length
                    ? lows
                        .map(
                          (p) => `<tr>
                    <td class="mono">${esc(p.code)}</td>
                    <td>${esc(p.name)}</td>
                    <td>${esc(p.category)}</td>
                    <td class="right num st-low">${p.qty}</td>
                    <td class="right num">${p.minStock}</td>
                    <td class="right num">${Math.max(0, p.minStock - p.qty)}</td>
                    <td>建议录入采购订单补货</td>
                  </tr>`
                        )
                        .join("")
                    : `<tr><td colspan="7" class="tbl-empty">暂无数据</td></tr>`
                }
              </tbody>
            </table>
          </div>
        </div>
        <div class="box-ft">
          <button class="btn" data-nav="home">返回工作台</button>
          <button class="btn btn-primary" data-act="new-po">按预警新建采购单</button>
        </div>
      </div>
    `;
  }

  function pageStockLedger() {
    const rows = filteredLedger();
    // 计算滚动结存（按商品）
    return `
      <div class="box">
        <div class="box-hd">查询条件 · 库存台账</div>
        <div class="box-bd">
          <div class="filters">
            <div class="f-item"><label>起始日期</label>
              <input class="input date" type="date" id="f-ledFrom" value="${esc(state.f.ledFrom)}" /></div>
            <div class="f-item"><label>截止日期</label>
              <input class="input date" type="date" id="f-ledTo" value="${esc(state.f.ledTo)}" /></div>
            <div class="f-item"><label>品名/单号</label>
              <input class="input" style="min-width:160px" id="f-ledQ" value="${esc(state.f.ledQ)}" /></div>
            <div class="f-item"><label>&nbsp;</label>
              <div class="btn-row">
                <button class="btn btn-primary" data-act="led-search">查询</button>
                <button class="btn" data-act="led-reset">重置</button>
                <button class="btn" data-act="led-export">导出台账</button>
              </div></div>
          </div>
        </div>
      </div>
      <div class="box">
        <div class="box-hd">库存台账（收发存明细） <span class="sub">${state.f.ledFrom} ~ ${state.f.ledTo}</span></div>
        <div class="box-bd">
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr>
                <th>日期</th><th>类型</th><th>编码</th><th>品名</th><th>单位</th>
                <th class="right">收入(+)</th><th class="right">发出(-)</th>
                <th>来源单据</th><th>操作人</th>
              </tr></thead>
              <tbody>
                ${
                  rows.length
                    ? rows
                        .map((m) => {
                          const inn = m.qty > 0 ? m.qty : "";
                          const out = m.qty < 0 ? -m.qty : "";
                          return `<tr>
                    <td class="mono">${esc(m.date)}</td>
                    <td>${esc(m.type)}</td>
                    <td class="mono">${esc(m.productCode)}</td>
                    <td>${esc(m.productName)}</td>
                    <td>${esc(m.unit)}</td>
                    <td class="right num" style="color:var(--success)">${inn}</td>
                    <td class="right num" style="color:var(--danger)">${out}</td>
                    <td class="mono">${esc(m.refNo)}</td>
                    <td>${esc(m.operator)}</td>
                  </tr>`;
                        })
                        .join("")
                    : `<tr><td colspan="9" class="tbl-empty">暂无数据</td></tr>`
                }
              </tbody>
            </table>
          </div>
        </div>
        <div class="box-ft">
          <button class="btn" data-nav="home">返回工作台</button>
          <button class="btn" data-nav="stock-query">去实时库存</button>
        </div>
      </div>
    `;
  }

  function pageStockMove() {
    const rows = filteredMoves();
    return `
      <div class="box">
        <div class="box-hd">查询条件 · 出入库流水</div>
        <div class="box-bd">
          <div class="filters">
            <div class="f-item"><label>起始日期</label>
              <input class="input date" type="date" id="f-moveFrom" value="${esc(state.f.moveFrom)}" /></div>
            <div class="f-item"><label>截止日期</label>
              <input class="input date" type="date" id="f-moveTo" value="${esc(state.f.moveTo)}" /></div>
            <div class="f-item"><label>类型</label>
              <select class="select" id="f-moveType">
                <option value="">全部类型</option>
                ${["采购入库", "销售出库", "期初", "盘点调整", "调拨"]
                  .map((t) => `<option value="${t}" ${state.f.moveType === t ? "selected" : ""}>${t}</option>`)
                  .join("")}
              </select></div>
            <div class="f-item"><label>品名/单号</label>
              <input class="input" style="min-width:150px" id="f-moveQ" value="${esc(state.f.moveQ)}" /></div>
            <div class="f-item"><label>&nbsp;</label>
              <div class="btn-row">
                <button class="btn btn-primary" data-act="move-search">查询</button>
                <button class="btn" data-act="move-reset">重置</button>
                <button class="btn" data-act="move-export">导出</button>
              </div></div>
          </div>
        </div>
      </div>
      <div class="box">
        <div class="box-hd">出入库流水 <span class="sub">共 ${rows.length} 条</span></div>
        <div class="box-bd">
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr>
                <th>日期</th><th>类型</th><th>编码</th><th>品名</th>
                <th class="right">数量变动</th><th>来源单据</th><th>操作人</th><th>备注</th>
              </tr></thead>
              <tbody>
                ${
                  rows.length
                    ? rows
                        .map(
                          (m) => `<tr>
                    <td class="mono">${esc(m.date)}</td>
                    <td>${esc(m.type)}</td>
                    <td class="mono">${esc(m.productCode)}</td>
                    <td>${esc(m.productName)}</td>
                    <td class="right num" style="color:${m.qty >= 0 ? "var(--success)" : "var(--danger)"}">${m.qty > 0 ? "+" : ""}${m.qty}</td>
                    <td class="mono">${esc(m.refNo)}</td>
                    <td>${esc(m.operator)}</td>
                    <td>${esc(m.note || "")}</td>
                  </tr>`
                        )
                        .join("")
                    : `<tr><td colspan="8" class="tbl-empty">暂无数据</td></tr>`
                }
              </tbody>
            </table>
          </div>
        </div>
        <div class="box-ft">
          <button class="btn" data-nav="home">返回工作台</button>
          <button class="btn" data-nav="stock-ledger">看库存台账</button>
        </div>
      </div>
    `;
  }

  function pageStockCheck() {
    if (state.pddForm) return pagePddForm();
    const list = db.stockChecks || [];
    return `
      <div class="box">
        <div class="box-hd">库存盘点单 <span class="sub">录入/提交待审 → 模拟仓管确认后入账差异（文员不可直接改库存）</span></div>
        <div class="box-bd">
          <div class="btn-row" style="margin-bottom:8px">
            <button class="btn btn-primary" data-act="new-pdd">新增盘点单</button>
            <span class="locked">差异入账以「模拟仓管确认」演示，真实环境由仓管/财务处理</span>
          </div>
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr><th>盘点单号</th><th>盘点日期</th><th>仓库</th><th class="right">品种数</th><th>状态</th><th>说明</th><th>操作</th></tr></thead>
              <tbody>
                ${list.length
                  ? list.map((d) => `<tr>
                      <td class="mono">${esc(d.no)}</td>
                      <td class="mono">${esc(d.date)}</td>
                      <td>${esc(d.warehouse || "主仓")}</td>
                      <td class="right num">${(d.lines || []).length}</td>
                      <td><span class="st ${statusClass(d.status)}">${esc(d.status)}</span></td>
                      <td>${esc(d.note || "")}</td>
                      <td class="btn-row">
                        <button class="link" data-act="view-pdd" data-id="${esc(d.id)}">查看</button>
                        ${d.status === "草稿" ? `<button class="link" data-act="edit-pdd" data-id="${esc(d.id)}">编辑</button>` : ""}
                        ${d.status === "草稿" ? `<button class="link" data-act="submit-pdd" data-id="${esc(d.id)}">提交待审</button>` : ""}
                        ${d.status === "草稿" ? `<button class="link danger" data-act="delete-doc" data-kind="pdd" data-id="${esc(d.id)}">删除</button>` : ""}
                        ${d.status === "待审核" ? `<button class="link" data-act="confirm-pdd" data-id="${esc(d.id)}">模拟仓管确认</button>` : ""}
                        ${d.status === "已盘点" ? `<button class="link" data-act="red-flush" data-kind="pdd" data-id="${esc(d.id)}">红冲</button>` : ""}
                      </td>
                    </tr>`).join("")
                  : `<tr><td colspan="7" class="tbl-empty">暂无数据</td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="notice-warn" style="margin-top:10px">
            如需盘点差异调整库存，请走「提交待审 → 模拟仓管确认」流程（实训演示）。文员无权直接改写库存。
          </div>
        </div>
        <div class="box-ft">
          <button class="btn" data-nav="home">返回工作台</button>
          <button class="btn btn-primary" data-act="new-pdd">录入盘点单</button>
        </div>
      </div>
    `;
  }

  function pagePddForm() {
    const f = state.pddForm;
    if (!f) return "";
    return `
      <div class="box">
        <div class="box-hd">${f.id ? "编辑盘点单" : "新增盘点单"} <span class="sub">账面数自动带出，填实盘数；确认后按差异入账</span></div>
        <div class="box-bd">
          <div class="form-grid">
            <div class="fi"><label>盘点单号</label><input class="input" value="${esc(f.no)}" disabled /></div>
            <div class="fi"><label>盘点日期</label>
              <input class="input date" type="date" id="pdd-date" value="${esc(f.date)}" /></div>
            <div class="fi"><label>仓库</label>
              <input class="input" id="pdd-wh" value="${esc(f.warehouse || "主仓")}" /></div>
            <div class="fi" style="grid-column:1/-1"><label>说明</label>
              <input class="input" id="pdd-note" value="${esc(f.note || "")}" /></div>
          </div>
          <div class="lines-hd">
            <b>盘点明细</b>
            <button class="btn btn-sm" data-act="pdd-add-line">+ 添加行</button>
          </div>
          <div class="tbl-wrap">
            <table class="tbl lines">
              <thead><tr>
                <th style="min-width:180px">商品</th>
                <th class="right" style="width:90px">账面数</th>
                <th style="width:100px">实盘数</th>
                <th class="right" style="width:80px">差异</th>
                <th style="width:50px"></th>
              </tr></thead>
              <tbody>
                ${f.lines.map((l, i) => {
                  const book = l.productId ? (db.stock[l.productId] || 0) : 0;
                  const diff = Number(l.realQty || 0) - book;
                  return `<tr>
                    <td>
                      <select data-pline-p="${i}">
                        <option value="">选择商品</option>
                        ${productOptions(l.productId, true)}
                      </select>
                    </td>
                    <td class="right num">${l.productId ? book : "—"}</td>
                    <td><input type="number" min="0" class="num" data-pline-q="${i}" value="${l.realQty}" /></td>
                    <td class="right num ${diff ? "st-low" : ""}">${l.productId ? (diff > 0 ? "+" : "") + diff : "—"}</td>
                    <td><button class="link danger" data-act="pdd-del-line" data-i="${i}">删</button></td>
                  </tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>
          <div class="notice-info">文员仅录入盘点结果；差异入账需「模拟仓管确认」（演示），不会在保存草稿时改库存。</div>
        </div>
        <div class="box-ft">
          <button class="btn" data-act="cancel-pdd">返回列表</button>
          <button class="btn" data-act="save-pdd-draft">保存草稿（Ctrl+S）</button>
          <button class="btn btn-primary" data-act="save-pdd-submit">提交待审</button>
        </div>
      </div>
    `;
  }

  function pagePddView() {
    const d = state.viewDoc.doc;
    return `
      <div class="box print-doc">
        <div class="box-hd">盘点单详情 <span class="st ${statusClass(d.status)}">${esc(d.status)}</span>
          <button class="btn btn-sm no-print" data-act="print-doc" style="margin-left:auto">打印</button>
        </div>
        <div class="box-bd">
          <div class="form-grid">
            <div class="fi"><label>单号</label><div class="mono">${esc(d.no)}</div></div>
            <div class="fi"><label>日期</label><div class="mono">${esc(d.date)}</div></div>
            <div class="fi"><label>仓库</label><div>${esc(d.warehouse || "主仓")}</div></div>
            <div class="fi"><label>制单人</label><div>${esc(d.createdBy)}</div></div>
            <div class="fi" style="grid-column:1/-1"><label>说明</label><div>${esc(d.note || "—")}</div></div>
          </div>
          <div class="lines-hd"><b>盘点明细</b></div>
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr><th>编码</th><th>品名</th><th class="right">账面数</th><th class="right">实盘数</th><th class="right">差异</th></tr></thead>
              <tbody>
                ${(d.lines || []).map((l) => {
                  const p = productById(l.productId);
                  const book = Number(l.confirmBookQty != null ? l.confirmBookQty : l.bookQty) || 0;
                  const diff = (Number(l.realQty) || 0) - book;
                  return `<tr>
                    <td class="mono">${esc(p?.code || "")}</td>
                    <td>${esc(p?.name || "")}</td>
                    <td class="right num">${book}${l.confirmBookQty != null ? ' <span class="sub">确认时</span>' : ""}</td>
                    <td class="right num">${l.realQty}</td>
                    <td class="right num ${diff ? "st-low" : ""}">${diff > 0 ? "+" : ""}${diff}</td>
                  </tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>
          <div class="lines-hd"><b>操作时间线</b></div>
          ${timelineHtml(d.timeline)}
          ${d.status === "待审核" ? `<div class="notice-warn">待审核。点「模拟仓管确认」按差异入账（演示）。</div>` : ""}
          <div class="sign-row">
            <div>制单人：____________</div>
            <div>复核人：____________</div>
            <div>仓管确认：____________</div>
            <div>日期：____________</div>
          </div>
        </div>
        <div class="box-ft no-print">
          <button class="btn" data-act="close-view">返回列表</button>
          ${d.status === "草稿" ? `<button class="btn" data-act="edit-pdd" data-id="${esc(d.id)}">编辑</button>` : ""}
          ${d.status === "草稿" ? `<button class="btn btn-primary" data-act="submit-pdd" data-id="${esc(d.id)}">提交待审</button>` : ""}
          ${d.status === "待审核" ? `<button class="btn btn-primary" data-act="confirm-pdd" data-id="${esc(d.id)}">模拟仓管确认（差异入账）</button>` : ""}
          ${d.status === "草稿" ? `<button class="btn danger" data-act="delete-doc" data-kind="pdd" data-id="${esc(d.id)}">删除草稿</button>` : ""}
          ${d.status === "已盘点" ? `<button class="btn" data-act="red-flush" data-kind="pdd" data-id="${esc(d.id)}">模拟财务红冲</button>` : ""}
          <button class="btn" data-act="print-doc">打印</button>
        </div>
      </div>
    `;
  }
  /* ---------- 报表中心 ---------- */
  function pageReport() {
    const t = state.f.rptType;
    let tableHtml = "";
    if (t === "stock") {
      tableHtml = `
        <table class="tbl">
          <thead><tr><th>编码</th><th>品名</th><th>单位</th><th class="right">当前库存</th><th class="right">最低库存</th><th>状态</th></tr></thead>
          <tbody>${db.products
            .map((p) => {
              const q = db.stock[p.id] || 0;
              return `<tr><td class="mono">${esc(p.code)}</td><td>${esc(p.name)}</td><td>${esc(p.unit)}</td>
                <td class="right num">${q}</td><td class="right num">${p.minStock}</td>
                <td>${q <= p.minStock ? "预警" : "正常"}</td></tr>`;
            })
            .join("")}</tbody>
        </table>`;
    } else if (t === "sales") {
      const rows = [];
      db.sales.forEach((so) => {
        if (so.date < state.f.rptFrom || so.date > state.f.rptTo) return;
        so.lines.forEach((l) => {
          const p = productById(l.productId);
          rows.push(`<tr>
            <td class="mono">${esc(so.date)}</td><td class="mono">${esc(so.no)}</td>
            <td>${esc(customerName(so.customerId))}</td>
            <td>${esc(p?.name || "")}</td>
            <td class="right num">${l.qty}</td>
            <td class="right num">${money(l.price)}</td>
            <td class="right num">${money(round2(l.qty * l.price))}</td>
            <td><span class="st ${statusClass(so.status)}">${esc(so.status)}</span></td>
          </tr>`);
        });
      });
      tableHtml = `
        <table class="tbl">
          <thead><tr><th>日期</th><th>单号</th><th>客户</th><th>品名</th><th class="right">数量</th><th class="right">单价</th><th class="right">金额</th><th>状态</th></tr></thead>
          <tbody>${rows.length ? rows.join("") : `<tr><td colspan="8" class="tbl-empty">暂无数据</td></tr>`}</tbody>
        </table>`;
    } else {
      const rows = [];
      db.purchases.forEach((po) => {
        if (po.date < state.f.rptFrom || po.date > state.f.rptTo) return;
        po.lines.forEach((l) => {
          const p = productById(l.productId);
          rows.push(`<tr>
            <td class="mono">${esc(po.date)}</td><td class="mono">${esc(po.no)}</td>
            <td>${esc(supplierName(po.supplierId))}</td>
            <td>${esc(p?.name || "")}</td>
            <td class="right num">${l.qty}</td>
            <td class="right num">${money(l.price)}</td>
            <td class="right num">${money(round2(l.qty * l.price))}</td>
            <td><span class="st ${statusClass(po.status)}">${esc(po.status)}</span></td>
          </tr>`);
        });
      });
      tableHtml = `
        <table class="tbl">
          <thead><tr><th>日期</th><th>单号</th><th>供应商</th><th>品名</th><th class="right">数量</th><th class="right">单价</th><th class="right">金额</th><th>状态</th></tr></thead>
          <tbody>${rows.length ? rows.join("") : `<tr><td colspan="8" class="tbl-empty">暂无数据</td></tr>`}</tbody>
        </table>`;
    }

    return `
      <div class="box">
        <div class="box-hd">报表条件 <span class="sub">只读预览，不可改原始数据</span></div>
        <div class="box-bd">
          <div class="filters">
            <div class="f-item"><label>报表类型</label>
              <select class="select" id="f-rptType">
                <option value="stock" ${t === "stock" ? "selected" : ""}>商品库存表</option>
                <option value="sales" ${t === "sales" ? "selected" : ""}>客户销售明细表</option>
                <option value="purchase" ${t === "purchase" ? "selected" : ""}>采购明细表</option>
              </select></div>
            <div class="f-item"><label>起始日期</label>
              <input class="input date" type="date" id="f-rptFrom" value="${esc(state.f.rptFrom)}" /></div>
            <div class="f-item"><label>截止日期</label>
              <input class="input date" type="date" id="f-rptTo" value="${esc(state.f.rptTo)}" /></div>
            <div class="f-item"><label>&nbsp;</label>
              <div class="btn-row">
                <button class="btn btn-primary" data-act="rpt-preview">预览</button>
                <button class="btn" data-act="rpt-reset">重置</button>
                <button class="btn btn-primary" data-act="rpt-export">导出CSV</button>
              </div></div>
          </div>
        </div>
      </div>
      <div class="box">
        <div class="box-hd">报表预览 <span class="sub">${t === "stock" ? "商品库存表" : t === "sales" ? "客户销售明细表 " + state.f.rptFrom + " ~ " + state.f.rptTo : "采购明细表 " + state.f.rptFrom + " ~ " + state.f.rptTo}</span></div>
        <div class="box-bd">
          <div class="tbl-wrap">${tableHtml}</div>
        </div>
        <div class="box-ft">
          <button class="btn" data-nav="home">返回工作台</button>
          <button class="btn" data-act="perm-edit-report">修改报表数据</button>
        </div>
      </div>
    `;
  }

  /* ---------- 销售退货 ---------- */
  function pageSalesReturnList() {
    if (state.xsthForm) return pageXsthForm();
    if (state.viewDoc && state.viewDoc.kind === "xsth") return pageXsthView();
    const st = state.f.xsthStatus;
    const q = state.f.xsthQ.trim().toLowerCase();
    const list = (db.salesReturns || []).filter((d) => {
      if (st && d.status !== st) return false;
      if (q && !(d.no.toLowerCase().includes(q) || customerName(d.customerId).toLowerCase().includes(q)))
        return false;
      return true;
    });
    const fullList = list;
    const pg = paginate(fullList, "xsth");
    const rows = pg.rows;
    const actions = (d) => `
      <button class="link" data-act="view-xsth" data-id="${esc(d.id)}">查看</button>
      ${d.status === "草稿" ? `<button class="link" data-act="edit-xsth" data-id="${esc(d.id)}">编辑</button>` : ""}
      ${d.status === "草稿" ? `<button class="link danger" data-act="delete-doc" data-kind="xsth" data-id="${esc(d.id)}">删除</button>` : ""}
      ${d.status === "待审核" ? `<button class="link" data-act="confirm-xsth" data-id="${esc(d.id)}">模拟仓管确认</button>` : ""}
      ${d.status === "已退货" ? `<button class="link" data-act="red-flush" data-kind="xsth" data-id="${esc(d.id)}">红冲</button>` : ""}`;
    const cards = rows.map((d) => `<div class="list-card">
      <div class="lc-hd"><span class="mono">${esc(d.no)}</span><span class="st ${statusClass(d.status)}">${esc(d.status)}</span></div>
      <div class="lc-main">${esc(customerName(d.customerId))}<span class="lc-date">${esc(d.date)}</span></div>
      <div class="lc-meta">原单 ${esc(d.soNo || "—")} · 数量 ${d.lines.reduce((s, l) => s + l.qty, 0)} · ¥${money(lineAmount(d.lines))}</div>
      <div class="lc-actions">${actions(d)}</div>
    </div>`).join("");
    return `
      <div class="box">
        <div class="box-hd">查询条件</div>
        <div class="box-bd">
          <div class="filters">
            <div class="f-item"><label>单号/客户</label>
              <input class="input" style="min-width:180px" id="f-xsthQ" value="${esc(state.f.xsthQ)}" /></div>
            <div class="f-item"><label>状态</label>
              <select class="select" id="f-xsthStatus">
                <option value="">全部</option>
                ${["草稿", "待审核", "已退货"].map((x) => `<option value="${x}" ${st === x ? "selected" : ""}>${x}</option>`).join("")}
              </select></div>
            <div class="f-item"><label>&nbsp;</label>
              <div class="btn-row">
                <button class="btn btn-primary" data-act="xsth-search">查询</button>
                <button class="btn" data-act="xsth-reset">重置</button>
              </div></div>
          </div>
        </div>
      </div>
      <div class="box">
        <div class="box-hd">销售退货单列表 <span class="sub">共 ${fullList.length} 张 · 审核通过（模拟仓管确认）后库存回加</span></div>
        <div class="box-bd">
          <div class="btn-row" style="margin-bottom:8px">
            <button class="btn btn-primary" data-act="new-xsth">新增销售退货单</button>
            <button class="btn" data-act="xsth-export">导出退货明细</button>
            <span class="locked">状态：草稿 → 待审核 → 已退货；文员可录入/提交，出库回加以「模拟仓管确认」演示</span>
          </div>
          <div class="tbl-wrap list-table">
            <table class="tbl">
              <thead><tr><th>单号</th><th>原销售单</th><th>客户</th><th>日期</th><th class="right">数量</th><th class="right">金额</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                ${rows.length
                  ? rows.map((d) => `<tr>
                      <td class="mono">${esc(d.no)}</td>
                      <td class="mono">${esc(d.soNo || "—")}</td>
                      <td>${esc(customerName(d.customerId))}</td>
                      <td class="mono">${esc(d.date)}</td>
                      <td class="right num">${d.lines.reduce((s, l) => s + l.qty, 0)}</td>
                      <td class="right num">¥${money(lineAmount(d.lines))}</td>
                      <td><span class="st ${statusClass(d.status)}">${esc(d.status)}</span></td>
                      <td class="btn-row">${actions(d)}</td>
                    </tr>`).join("")
                  : `<tr><td colspan="8" class="tbl-empty">暂无数据</td></tr>`}
              </tbody>
            </table>
          </div>
          ${pg.html}
          <div class="list-cards">${cards || '<div class="tbl-empty">暂无数据</div>'}</div>
        </div>
        <div class="box-ft">
          <button class="btn" data-nav="home">返回工作台</button>
        </div>
      </div>
    `;
  }

  function pageXsthForm() {
    const f = state.xsthForm;
    if (!f) return "";
    const so = f.soId ? db.sales.find((x) => x.id === f.soId) : null;
    return `
      <div class="box">
        <div class="box-hd">${f.id ? "编辑销售退货单" : "新增销售退货单"} <span class="sub">数量 ≤ 已出库量 − 已退货量 · 确认后库存回加</span></div>
        <div class="box-bd">
          <div class="form-grid">
            <div class="fi"><label>单号</label><input class="input" value="${esc(f.no)}" disabled /></div>
            <div class="fi"><label>原销售单</label>
              <select class="select" id="xsth-so">
                <option value="">按客户+商品录入（不选原单）</option>
                ${db.sales.filter((x) => x.status === "已出库" || x.status === "部分出库")
                  .map((x) => `<option value="${esc(x.id)}" ${f.soId === x.id ? "selected" : ""}>${esc(x.no)}（${esc(customerName(x.customerId))}）</option>`).join("")}
              </select>
              <span class="hint">选择原销售单后可带出客户，数量上限=已出库−已退货</span>
            </div>
            <div class="fi"><label>客户<span class="req">*</span></label>
              <select class="select" id="xsth-cus">
                <option value="">请选择客户</option>
                ${optList(db.customers.filter((c) => c.active), "id", (c) => c.name, f.customerId)}
              </select></div>
            <div class="fi"><label>退货日期</label>
              <input class="input date" type="date" id="xsth-date" value="${esc(f.date)}" /></div>
            <div class="fi" style="grid-column:1/-1"><label>备注</label>
              <input class="input" id="xsth-note" value="${esc(f.note || "")}" placeholder="如：破损退货 / 客户拒收" /></div>
          </div>

          <div class="lines-hd">
            <b>退货明细</b>
            <button class="btn btn-sm" data-act="xsth-add-line">+ 添加行</button>
          </div>
          <div class="tbl-wrap">
            <table class="tbl lines">
              <thead><tr>
                <th style="min-width:180px">商品<span class="req">*</span></th>
                <th style="width:90px">退货数量</th>
                <th style="width:100px">单价</th>
                <th class="right" style="width:90px">可退上限</th>
                <th class="right" style="width:90px">金额</th>
                <th style="width:50px"></th>
              </tr></thead>
              <tbody>
                ${f.lines.map((l, i) => {
                  const max = so ? maxReturnableSO(so, l.productId, f.id) : 9999;
                  return `<tr>
                    <td>
                      <select data-xline-p="${i}">
                        <option value="">选择商品</option>
                        ${productOptions(l.productId, true)}
                      </select>
                    </td>
                    <td><input type="number" min="1" class="num" data-xline-q="${i}" value="${l.qty}" /></td>
                    <td><input type="number" min="0" step="0.01" class="num" data-xline-pr="${i}" value="${l.price}" /></td>
                    <td class="right num">${so ? max : "—"}</td>
                    <td class="right num">¥${money(round2(l.qty * l.price))}</td>
                    <td><button class="link danger" data-act="xsth-del-line" data-i="${i}">删</button></td>
                  </tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>
          ${stockPreviewHtml(f.lines, 1, "库存变动预览 · 销售退货（回加）")}
          <div class="total-line">合计金额：<b>¥${money(lineAmount(f.lines))}</b></div>
        </div>
        <div class="box-ft">
          <button class="btn" data-act="cancel-xsth">返回列表</button>
          <button class="btn" data-act="save-xsth-draft">保存草稿（Ctrl+S）</button>
          <button class="btn btn-primary" data-act="save-xsth-submit">提交待审</button>
        </div>
      </div>
    `;
  }

  function pageXsthView() {
    const d = state.viewDoc.doc;
    return `
      <div class="box print-doc">
        <div class="box-hd">销售退货单详情 <span class="st ${statusClass(d.status)}">${esc(d.status)}</span>
          <span class="sub">确认后库存回加，并生成「销售退货」出入库流水</span></div>
        <div class="box-bd">
          <div class="form-grid">
            <div class="fi"><label>单号</label><div class="mono">${esc(d.no)}</div></div>
            <div class="fi"><label>原销售单</label><div class="mono">${esc(d.soNo || "—")}</div></div>
            <div class="fi"><label>客户</label><div>${esc(customerName(d.customerId))}</div></div>
            <div class="fi"><label>日期</label><div class="mono">${esc(d.date)}</div></div>
            <div class="fi"><label>制单人</label><div>${esc(d.createdBy)}</div></div>
            <div class="fi"><label>金额合计</label><div class="num">¥${money(lineAmount(d.lines))}</div></div>
            <div class="fi" style="grid-column:1/-1"><label>备注</label><div>${esc(d.note || "—")}</div></div>
          </div>
          <div class="lines-hd"><b>退货明细</b></div>
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr><th>编码</th><th>品名</th><th>单位</th><th class="right">数量</th><th class="right">单价</th><th class="right">金额</th></tr></thead>
              <tbody>
                ${d.lines.map((l) => {
                  const p = productById(l.productId);
                  return `<tr>
                    <td class="mono">${esc(p?.code || "")}</td>
                    <td>${esc(p?.name || "")}</td>
                    <td>${esc(p?.unit || "")}</td>
                    <td class="right num">${l.qty}</td>
                    <td class="right num">${money(l.price)}</td>
                    <td class="right num">${money(round2(l.qty * l.price))}</td>
                  </tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>
          <div class="lines-hd"><b>操作时间线</b></div>
          ${timelineHtml(d.timeline)}
          ${d.status === "待审核" ? `<div class="notice-warn">待审核。文员可点「模拟仓管确认」演示库存回加（真实环境由仓管/财务处理）。</div>` : ""}
          <div class="sign-row">
            <div>制单人：____________</div>
            <div>审核人：____________</div>
            <div>仓管确认：____________</div>
            <div>日期：____________</div>
          </div>
        </div>
        <div class="box-ft no-print">
          <button class="btn" data-act="close-view">返回列表</button>
          ${d.status === "草稿" ? `<button class="btn" data-act="edit-xsth" data-id="${esc(d.id)}">编辑草稿</button>` : ""}
          ${d.status === "草稿" ? `<button class="btn btn-primary" data-act="submit-xsth" data-id="${esc(d.id)}">提交待审</button>` : ""}
          ${d.status === "待审核" ? `<button class="btn btn-primary" data-act="confirm-xsth" data-id="${esc(d.id)}">模拟仓管确认（库存回加）</button>` : ""}
          <button class="btn" data-act="print-doc">打印</button>
        </div>
      </div>
    `;
  }

  /* ---------- 采购退货 ---------- */
  function pagePurchaseReturnList() {
    if (state.cgthForm) return pageCgthForm();
    if (state.viewDoc && state.viewDoc.kind === "cgth") return pageCgthView();
    const st = state.f.cgthStatus;
    const q = state.f.cgthQ.trim().toLowerCase();
    const list = (db.purchaseReturns || []).filter((d) => {
      if (st && d.status !== st) return false;
      if (q && !(d.no.toLowerCase().includes(q) || supplierName(d.supplierId).toLowerCase().includes(q)))
        return false;
      return true;
    });
    const fullList = list;
    const pg = paginate(fullList, "cgth");
    const rows = pg.rows;
    const actions = (d) => `
      <button class="link" data-act="view-cgth" data-id="${esc(d.id)}">查看</button>
      ${d.status === "草稿" ? `<button class="link" data-act="edit-cgth" data-id="${esc(d.id)}">编辑</button>` : ""}
      ${d.status === "草稿" ? `<button class="link danger" data-act="delete-doc" data-kind="cgth" data-id="${esc(d.id)}">删除</button>` : ""}
      ${d.status === "待审核" ? `<button class="link" data-act="confirm-cgth" data-id="${esc(d.id)}">模拟仓管确认</button>` : ""}
      ${d.status === "已退货" ? `<button class="link" data-act="red-flush" data-kind="cgth" data-id="${esc(d.id)}">红冲</button>` : ""}`;
    const cards = rows.map((d) => `<div class="list-card">
      <div class="lc-hd"><span class="mono">${esc(d.no)}</span><span class="st ${statusClass(d.status)}">${esc(d.status)}</span></div>
      <div class="lc-main">${esc(supplierName(d.supplierId))}<span class="lc-date">${esc(d.date)}</span></div>
      <div class="lc-meta">原单 ${esc(d.poNo || "—")} · 数量 ${d.lines.reduce((s, l) => s + l.qty, 0)} · ¥${money(lineAmount(d.lines))}</div>
      <div class="lc-actions">${actions(d)}</div>
    </div>`).join("");
    return `
      <div class="box">
        <div class="box-hd">查询条件</div>
        <div class="box-bd">
          <div class="filters">
            <div class="f-item"><label>单号/供应商</label>
              <input class="input" style="min-width:180px" id="f-cgthQ" value="${esc(state.f.cgthQ)}" /></div>
            <div class="f-item"><label>状态</label>
              <select class="select" id="f-cgthStatus">
                <option value="">全部</option>
                ${["草稿", "待审核", "已退货"].map((x) => `<option value="${x}" ${st === x ? "selected" : ""}>${x}</option>`).join("")}
              </select></div>
            <div class="f-item"><label>&nbsp;</label>
              <div class="btn-row">
                <button class="btn btn-primary" data-act="cgth-search">查询</button>
                <button class="btn" data-act="cgth-reset">重置</button>
              </div></div>
          </div>
        </div>
      </div>
      <div class="box">
        <div class="box-hd">采购退货单列表 <span class="sub">共 ${fullList.length} 张 · 确认后库存扣减</span></div>
        <div class="box-bd">
          <div class="btn-row" style="margin-bottom:8px">
            <button class="btn btn-primary" data-act="new-cgth">新增采购退货单</button>
            <button class="btn" data-act="cgth-export">导出退货明细</button>
            <span class="locked">数量 ≤ 已入库量 − 已退货量；确认后生成「采购退货」流水并扣减库存</span>
          </div>
          <div class="tbl-wrap list-table">
            <table class="tbl">
              <thead><tr><th>单号</th><th>原采购单</th><th>供应商</th><th>日期</th><th class="right">数量</th><th class="right">金额</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                ${rows.length
                  ? rows.map((d) => `<tr>
                      <td class="mono">${esc(d.no)}</td>
                      <td class="mono">${esc(d.poNo || "—")}</td>
                      <td>${esc(supplierName(d.supplierId))}</td>
                      <td class="mono">${esc(d.date)}</td>
                      <td class="right num">${d.lines.reduce((s, l) => s + l.qty, 0)}</td>
                      <td class="right num">¥${money(lineAmount(d.lines))}</td>
                      <td><span class="st ${statusClass(d.status)}">${esc(d.status)}</span></td>
                      <td class="btn-row">${actions(d)}</td>
                    </tr>`).join("")
                  : `<tr><td colspan="8" class="tbl-empty">暂无数据</td></tr>`}
              </tbody>
            </table>
          </div>
          ${pg.html}
          <div class="list-cards">${cards || '<div class="tbl-empty">暂无数据</div>'}</div>
        </div>
        <div class="box-ft">
          <button class="btn" data-nav="home">返回工作台</button>
        </div>
      </div>
    `;
  }

  function pageCgthForm() {
    const f = state.cgthForm;
    if (!f) return "";
    const po = f.poId ? db.purchases.find((x) => x.id === f.poId) : null;
    return `
      <div class="box">
        <div class="box-hd">${f.id ? "编辑采购退货单" : "新增采购退货单"} <span class="sub">数量 ≤ 已入库量 − 已退货量 · 确认后库存扣减</span></div>
        <div class="box-bd">
          <div class="form-grid">
            <div class="fi"><label>单号</label><input class="input" value="${esc(f.no)}" disabled /></div>
            <div class="fi"><label>原采购单</label>
              <select class="select" id="cgth-po">
                <option value="">按供应商+商品录入（不选原单）</option>
                ${db.purchases.filter((x) => x.status === "已入库")
                  .map((x) => `<option value="${esc(x.id)}" ${f.poId === x.id ? "selected" : ""}>${esc(x.no)}（${esc(supplierName(x.supplierId))}）</option>`).join("")}
              </select>
            </div>
            <div class="fi"><label>供应商<span class="req">*</span></label>
              <select class="select" id="cgth-sup">
                <option value="">请选择供应商</option>
                ${optList(db.suppliers.filter((c) => c.active), "id", (c) => c.name, f.supplierId)}
              </select></div>
            <div class="fi"><label>退货日期</label>
              <input class="input date" type="date" id="cgth-date" value="${esc(f.date)}" /></div>
            <div class="fi" style="grid-column:1/-1"><label>备注</label>
              <input class="input" id="cgth-note" value="${esc(f.note || "")}" /></div>
          </div>
          <div class="lines-hd">
            <b>退货明细</b>
            <button class="btn btn-sm" data-act="cgth-add-line">+ 添加行</button>
          </div>
          <div class="tbl-wrap">
            <table class="tbl lines">
              <thead><tr>
                <th style="min-width:180px">商品<span class="req">*</span></th>
                <th style="width:90px">退货数量</th>
                <th style="width:100px">单价</th>
                <th class="right" style="width:90px">可退上限</th>
                <th class="right" style="width:90px">金额</th>
                <th style="width:50px"></th>
              </tr></thead>
              <tbody>
                ${f.lines.map((l, i) => {
                  const max = po ? maxReturnablePO(po, l.productId, f.id) : 9999;
                  return `<tr>
                    <td>
                      <select data-cline-p="${i}">
                        <option value="">选择商品</option>
                        ${productOptions(l.productId, true)}
                      </select>
                    </td>
                    <td><input type="number" min="1" class="num" data-cline-q="${i}" value="${l.qty}" /></td>
                    <td><input type="number" min="0" step="0.01" class="num" data-cline-pr="${i}" value="${l.price}" /></td>
                    <td class="right num">${po ? max : "—"}</td>
                    <td class="right num">¥${money(round2(l.qty * l.price))}</td>
                    <td><button class="link danger" data-act="cgth-del-line" data-i="${i}">删</button></td>
                  </tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>
          ${stockPreviewHtml(f.lines, -1, "库存变动预览 · 采购退货（扣减）")}
          <div class="total-line">合计金额：<b>¥${money(lineAmount(f.lines))}</b></div>
        </div>
        <div class="box-ft">
          <button class="btn" data-act="cancel-cgth">返回列表</button>
          <button class="btn" data-act="save-cgth-draft">保存草稿（Ctrl+S）</button>
          <button class="btn btn-primary" data-act="save-cgth-submit">提交待审</button>
        </div>
      </div>
    `;
  }

  function pageCgthView() {
    const d = state.viewDoc.doc;
    return `
      <div class="box print-doc">
        <div class="box-hd">采购退货单详情 <span class="st ${statusClass(d.status)}">${esc(d.status)}</span>
          <span class="sub">确认后库存扣减，并生成「采购退货」出入库流水</span></div>
        <div class="box-bd">
          <div class="form-grid">
            <div class="fi"><label>单号</label><div class="mono">${esc(d.no)}</div></div>
            <div class="fi"><label>原采购单</label><div class="mono">${esc(d.poNo || "—")}</div></div>
            <div class="fi"><label>供应商</label><div>${esc(supplierName(d.supplierId))}</div></div>
            <div class="fi"><label>日期</label><div class="mono">${esc(d.date)}</div></div>
            <div class="fi"><label>制单人</label><div>${esc(d.createdBy)}</div></div>
            <div class="fi"><label>金额合计</label><div class="num">¥${money(lineAmount(d.lines))}</div></div>
            <div class="fi" style="grid-column:1/-1"><label>备注</label><div>${esc(d.note || "—")}</div></div>
          </div>
          <div class="lines-hd"><b>退货明细</b></div>
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr><th>编码</th><th>品名</th><th>单位</th><th class="right">数量</th><th class="right">单价</th><th class="right">金额</th></tr></thead>
              <tbody>
                ${d.lines.map((l) => {
                  const p = productById(l.productId);
                  return `<tr>
                    <td class="mono">${esc(p?.code || "")}</td>
                    <td>${esc(p?.name || "")}</td>
                    <td>${esc(p?.unit || "")}</td>
                    <td class="right num">${l.qty}</td>
                    <td class="right num">${money(l.price)}</td>
                    <td class="right num">${money(round2(l.qty * l.price))}</td>
                  </tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>
          <div class="lines-hd"><b>操作时间线</b></div>
          ${timelineHtml(d.timeline)}
          ${d.status === "待审核" ? `<div class="notice-warn">待审核。文员可点「模拟仓管确认」演示库存扣减（真实环境由仓管/财务处理）。</div>` : ""}
          <div class="sign-row">
            <div>制单人：____________</div>
            <div>审核人：____________</div>
            <div>仓管确认：____________</div>
            <div>日期：____________</div>
          </div>
        </div>
        <div class="box-ft no-print">
          <button class="btn" data-act="close-view">返回列表</button>
          ${d.status === "草稿" ? `<button class="btn" data-act="edit-cgth" data-id="${esc(d.id)}">编辑草稿</button>` : ""}
          ${d.status === "草稿" ? `<button class="btn btn-primary" data-act="submit-cgth" data-id="${esc(d.id)}">提交待审</button>` : ""}
          ${d.status === "待审核" ? `<button class="btn btn-primary" data-act="confirm-cgth" data-id="${esc(d.id)}">模拟仓管确认（库存扣减）</button>` : ""}
          <button class="btn" data-act="print-doc">打印</button>
        </div>
      </div>
    `;
  }

  /* ---------- 操作手册 ---------- */
  function pageManual() {
    const sec = (id, title, html) => `
      <div class="box">
        <div class="box-hd" id="${id}">${title}</div>
        <div class="box-bd manual">${html}</div>
      </div>`;
    const step = (n, text) => `<div class="m-step"><span class="m-no">${n}</span><span>${text}</span></div>`;
    const tip = (text) => `<div class="m-tip">💡 ${text}</div>`;
    const warn = (text) => `<div class="m-warn">⚠️ ${text}</div>`;

    return `
      <div class="box">
        <div class="box-hd">📖 文员操作手册 <span class="sub">按模块查 · 忘了怎么操作就翻这里</span></div>
        <div class="box-bd">
          <div class="m-toc">
            <b>目录：</b>
            <a href="#s0">0. 界面认识</a> ·
            <a href="#s1">1. 基础资料</a> ·
            <a href="#s2">2. 采购管理</a> ·
            <a href="#s3">3. 销售管理</a> ·
            <a href="#s4">4. 库存管理</a> ·
            <a href="#s5">5. 报表中心</a> ·
            <a href="#s6">6. 常见问题</a>
          </div>
        </div>
        <div class="box-ft">
          <button class="btn btn-primary" data-act="tour-restart">重新看右下角分步教程</button>
          <button class="btn" data-nav="home">返回工作台</button>
        </div>
      </div>

      ${sec("s0", "0. 界面认识（第一次看必看）", `
        <p>整个系统分三层：</p>
        ${step(1, "<b>顶部蓝色横条【主菜单】</b>：工作台 / 基础资料 / 采购管理 / 销售管理 / 库存管理 / 报表中心。点哪个，下面内容就切到哪个大模块。")}
        ${step(2, "<b>左侧灰色竖条【二级菜单】</b>：当前模块下的子页面。比如点了「基础资料」，左边就出现商品档案/供应商/客户三个子项。")}
        ${step(3, "<b>右侧白色主区</b>：你要操作的页面。查询条件在上面，列表/表单在下面。")}
        ${step(4, "<b>右上角按钮区</b>：每个列表页右上角都有蓝色【+ 新增 xxx】按钮，这是入口。")}
        ${tip("想回到首页，点顶部「工作台」，或者左侧菜单最下面的【返回工作台】。")}
      `)}

      ${sec("s1", "1. 基础资料（商品 / 供应商 / 客户）", `
        <h4>1.1 新增商品档案</h4>
        ${step(1, "顶部菜单点【基础资料】→ 左侧子菜单点【商品档案】。")}
        ${step(2, "页面右上角点蓝色按钮【+ 新增商品】。")}
        ${step(3, "在表单里填：商品编码*（如 SP001）、品名*（如 原味花生）、规格（如 500g/包）、单位*（如 包）、分类（如 农副食品）、最低库存（如 10）。")}
        ${step(4, "拉到表单最底部，点蓝色按钮【保存】。")}
        ${tip("保存成功会弹窗提示，并自动回到商品列表，新商品在最后一行。")}

        <h4>1.2 新增供应商</h4>
        ${step(1, "顶部【基础资料】→ 左侧【供应商资料】。")}
        ${step(2, "右上角点【+ 新增供应商】。")}
        ${step(3, "填：编码*（如 GYS001）、名称*（如 南宁桂味食品批发部）、联系人、电话。")}
        ${step(4, "点底部【保存】。")}

        <h4>1.3 新增客户</h4>
        ${step(1, "顶部【基础资料】→ 左侧【客户资料】。")}
        ${step(2, "右上角点【+ 新增客户】。")}
        ${step(3, "填：编码*（如 KH001）、名称*（如 老街坊便利店建政店）、联系人、电话。")}
        ${step(4, "点底部【保存】。")}

        <h4>1.4 修改 / 停用档案</h4>
        ${step(1, "在列表里找到那一行，点最右边【编辑】。")}
        ${step(2, "改完点【保存】。")}
        ${step(3, "想停用不删除：编辑时把「状态」下拉改成【停用】，保存后该档案在新单据里就选不到了，但历史单据还在。")}
        ${warn("编码一旦保存就不能改（会影响历史单据），删错编码只能新增。")}
      `)}

      ${sec("s2", "2. 采购管理", `
        <h4>2.1 录一张采购订单（文员日常）</h4>
        ${step(1, "顶部【采购管理】→ 左侧【采购订单】。")}
        ${step(2, "右上角点蓝色【+ 新增采购订单】。")}
        ${step(3, "「供应商*」下拉选一家供应商。")}
        ${step(4, "「单据日期」保持今天。")}
        ${step(5, "在「商品明细」表格右边点【+ 添加行】：\n  · 商品列下拉选一个商品\n  · 数量列填数字（如 100）\n  · 单价列填数字（如 4.5）")}
        ${step(6, "拉到底部，两个按钮二选一：\n  · 灰色【保存草稿（Ctrl+S）】：先存着，回头再改\n  · 蓝色【保存并提交审核】：提交给财务审")}
        ${tip("按 Ctrl+S 可以快速存草稿。")}

        <h4>2.2 查看采购单状态</h4>
        <p>采购单状态流转：<b>草稿 → 待审核 → 已审核 → 已入库</b></p>
        ${step(1, "在采购订单列表，「单据状态」下拉可以筛选。")}
        ${step(2, "点单号能打开详情页，拉到底看「操作时间线」，每一步谁处理的都有记录。")}
        ${warn("文员不能点【审核】，那是财务的活。点了会弹「无权限」提示。")}

        <h4>2.3 采购入库单（只读查看）</h4>
        ${step(1, "左侧菜单点【采购入库单】，这里只显示状态为「已入库」的单。")}
        ${step(2, "用于核对历史入库记录，不能新增、不能改。")}

        <h4>2.4 采购退货</h4>
        ${step(1, "左侧【采购退货】→ 右上角【+ 新增采购退货单】。")}
        ${step(2, "选原采购单（已入库的），填退货数量（不能超过已入库 − 已退货）。")}
        ${step(3, "点【提交待审】。")}
        ${step(4, "打开这张退货单，点底部【模拟仓管确认（库存扣减）】，状态变「已退货」。")}
      `)}

      ${sec("s3", "3. 销售管理", `
        <h4>3.1 录一张销售订单（文员日常）</h4>
        ${step(1, "顶部【销售管理】→ 左侧【销售订单】。")}
        ${step(2, "右上角点蓝色【+ 新增销售订单】。")}
        ${step(3, "「客户*」下拉选一家客户。")}
        ${step(4, "点商品明细区的【+ 添加行】：\n  · 商品选一个\n  · 数量填数字\n  · 单价填数字")}
        ${warn("数量不能超过「可用库存」列的数字，否则下面会红字警告「将超卖」，提交会失败。")}
        ${step(5, "底部二选一：【保存草稿】或【保存并提交审核】。")}

        <h4>3.2 销售单状态</h4>
        <p>流转：<b>草稿 → 待审核 → 待出库 → 部分出库 / 已出库</b></p>
        ${step(1, "「部分出库」意思是一次没出完，剩下的下次出。")}
        ${step(2, "点单号看详情，底部有「当前库存」列，能看出库后剩多少。")}

        <h4>3.3 销售出库单（只读）</h4>
        <p>左侧【销售出库单】只显示已出库的单，用于核对。</p>

        <h4>3.4 销售退货</h4>
        ${step(1, "左侧【销售退货】→ 右上角【+ 新增销售退货单】。")}
        ${step(2, "「原销售单」下拉选一张已出库的销售单（会自动带客户和可退数量）。")}
        ${step(3, "点【+ 添加行】填退货数量。")}
        ${step(4, "点【提交待审】。")}
        ${step(5, "打开退货单，点底部【模拟仓管确认（库存回加）】，状态变「已退货」，库存自动加回去。")}
      `)}

      ${sec("s4", "4. 库存管理", `
        <h4>4.1 实时库存查询</h4>
        ${step(1, "顶部【库存管理】→ 左侧【实时库存】。")}
        ${step(2, "在「品名/编码」框打关键字（如 花生），点【查询】。")}
        ${step(3, "下方列表显示当前库存数量。")}
        ${step(4, "想导出：点右上角【导出库存表】，下载 CSV。")}

        <h4>4.2 库存预警</h4>
        <p>左侧【库存预警】自动列出低于「最低库存」的商品，标红色——这就是要补货的清单。</p>

        <h4>4.3 库存台账</h4>
        <p>左侧【库存台账】按商品维度汇总：选一个商品，看它的期初、入库、出库、结存。</p>

        <h4>4.4 出入库流水</h4>
        ${step(1, "左侧【出入库流水】。")}
        ${step(2, "顶部选开始日期和结束日期，点【查询】。")}
        ${step(3, "列表显示这段时间所有入库/出库/退货记录，每条带单据号。")}
        ${step(4, "点【导出】下载 CSV。")}

        <h4>4.5 盘点单（文员易错点）</h4>
        ${step(1, "左侧【盘点单】→ 右上角【+ 新增盘点单】。")}
        ${step(2, "「盘点日期」选今天。")}
        ${step(3, "点【+ 添加行】选一个商品，「账面数」会自动带出当前库存。")}
        ${step(4, "在「实盘数」列填你实际点出来的数字。系统自动算差异。")}
        ${step(5, "点【提交待审】。")}
        ${step(6, "打开盘点单，点底部【模拟仓管确认（差异入账）】——系统按差异调整库存并生成流水。")}
        ${warn("文员不能直接改库存数字！要调库存必须走盘点流程。")}
      `)}

      ${sec("s5", "5. 报表中心", `
        <h4>5.1 业务报表（库存/销售/采购明细）</h4>
        ${step(1, "顶部【报表中心】→ 左侧【业务报表】。")}
        ${step(2, "「报表类型」三选一：商品库存表 / 客户销售明细表 / 采购明细表。")}
        ${step(3, "选起始日期和截止日期。")}
        ${step(4, "点【预览】看下面表格。")}
        ${step(5, "点【导出CSV】下载 CSV 文件（Excel 可直接打开）。")}
        ${warn("底部那个【修改报表数据】按钮别点——文员没权限改原始数据。")}

        <h4>5.2 进销存汇总（实训 L6）</h4>
        ${step(1, "左侧【进销存汇总】。")}
        ${step(2, "选起止日期，点【查询】。")}
        ${step(3, "公式：期初 + 采购入库 − 采购退货 − 销售出库 + 销售退货 = 期末。")}
        ${step(4, "点【导出 CSV】。导出成功后实训任务卡 L6 自动打勾。")}

        <h4>5.3 往来对账单</h4>
        <p>左侧【往来对账单】：选供应商或客户，看累计采购/销售额、退货额、模拟回款、结存。点【导出 CSV】下载。</p>
      `)}

      ${sec("s6", "6. 常见问题", `
        <h4>Q1：点【审核】【收款核销】【改报表】没反应？</h4>
        <p>这是文员权限外的操作，会弹「无权限」提示。真实环境这些按钮由财务/主管账号操作。</p>

        <h4>Q2：数据存哪了？换电脑还有吗？</h4>
        <p>数据存在你自己浏览器的 localStorage 里，换电脑/换浏览器/清缓存就没了。要备份就先导出报表 CSV。</p>

        <h4>Q3：想清空重来怎么办？</h4>
        <p>左侧菜单最底部点【重置演示数据】，会恢复出厂演示数据。注意：你自己录的单会全清。</p>

        <h4>Q4：右下角教程不小心关了，怎么再开？</h4>
        <p>左侧菜单最底部点【分步教程】。</p>

        <h4>Q5：快捷键有哪些？</h4>
        <p>Ctrl+S = 保存草稿；Esc = 关弹窗 / 返回列表。</p>

        <h4>Q6：导出的 CSV 用 Excel 打开乱码？</h4>
        <p>CSV 是 UTF-8 带 BOM 编码，Windows 版 Excel 直接双击应该正常。如果乱码，用 Excel 的「数据 → 从文本/CSV 导入」，编码选 UTF-8。</p>
      `)}
    `;
  }

  /* ---------- 实训任务 ---------- */
  function pageTasks() {
    const tasks = taskList();
    const done = tasks.filter((t) => t.done).length;
    const pct = Math.round((done / tasks.length) * 100);
    return `
      <div class="box">
        <div class="box-hd">实训任务卡 L1–L6 <span class="sub">根据本地数据自动判定完成 · 可关闭引导</span></div>
        <div class="box-bd">
          <div class="task-progress">
            <div class="tp-bar"><div class="tp-fill" style="width:${pct}%"></div></div>
            <div class="tp-text">已完成 ${done} / ${tasks.length}（${pct}%）</div>
          </div>
          <div class="task-grid">
            ${tasks.map((t) => `
              <div class="task-card ${t.done ? "done" : ""}">
                <div class="tc-top">
                  <span class="tc-id">${t.id}</span>
                  <span class="tc-check ${t.done ? "on" : ""}">${t.done ? "✓" : ""}</span>
                </div>
                <div class="tc-title">${esc(t.title)}</div>
                <div class="tc-desc">${esc(t.desc)}</div>
                <button class="btn btn-sm" data-nav="${t.nav}">${t.done ? "再练一次" : "去完成"}</button>
              </div>
            `).join("")}
          </div>
          <div class="notice-info">
            判定规则：L1 有商品+供应商 · L2 有已入库采购 · L3 有已出库销售 · L4 有已确认退货 · L5 有盘点记录 · L6 导出过进销存汇总。<br/>
            文员权限：可录入/查询/导出；不可财务审核、不可直接改库存。退货与盘点以「提交待审 / 模拟仓管确认」演示。
          </div>
        </div>
        <div class="box-ft">
          <button class="btn" data-act="close-task-guide">关闭引导（不再自动提示）</button>
          <button class="btn" data-act="open-task-guide">恢复引导</button>
          <button class="btn btn-primary" data-nav="home">返回工作台</button>
        </div>
      </div>
    `;
  }

  function pageLogs() {
    const logs = (db.logs || []).slice(0, 20);
    return `
      <div class="box">
        <div class="box-hd">操作日志 <span class="sub">最近 20 条 · 新建/提交/退货确认/导出/重置等关键动作</span></div>
        <div class="box-bd">
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr><th>时间</th><th>操作人</th><th>动作</th><th>说明</th></tr></thead>
              <tbody>
                ${logs.length
                  ? logs.map((l) => `<tr>
                      <td class="mono">${fmtDT(l.at)}</td>
                      <td>${esc(l.who)}</td>
                      <td><span class="st st-approved">${esc(l.act)}</span></td>
                      <td>${esc(l.detail || "")}</td>
                    </tr>`).join("")
                  : `<tr><td colspan="4" class="tbl-empty">暂无日志</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
        <div class="box-ft">
          <button class="btn" data-nav="home">返回工作台</button>
        </div>
      </div>
    `;
  }

  /* ---------- 进销存汇总 ---------- */
  function pageInvSum() {
    const from = state.f.invFrom, to = state.f.invTo;
    const rows = invSumRows(from, to);
    const t = invSumTotal(rows);
    return `
      <div class="box">
        <div class="box-hd">进销存汇总条件 <span class="sub">期初 + 采购入库 − 采购退货 − 销售出库 + 销售退货 = 期末</span></div>
        <div class="box-bd">
          <div class="filters">
            <div class="f-item"><label>起始日期</label>
              <input class="input date" type="date" id="f-invFrom" value="${esc(from)}" /></div>
            <div class="f-item"><label>截止日期</label>
              <input class="input date" type="date" id="f-invTo" value="${esc(to)}" /></div>
            <div class="f-item"><label>&nbsp;</label>
              <div class="btn-row">
                <button class="btn btn-primary" data-act="invsum-search">查询</button>
                <button class="btn" data-act="invsum-reset">重置</button>
                <button class="btn btn-primary" data-act="invsum-export">导出 CSV</button>
              </div></div>
          </div>
        </div>
      </div>
      <div class="box">
        <div class="box-hd">汇总预览 <span class="sub">${esc(from)} ~ ${esc(to)}</span></div>
        <div class="box-bd">
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr>
                <th>编码</th><th>品名</th><th>单位</th>
                <th class="right">期初</th><th class="right">采购入库</th><th class="right">采购退货</th>
                <th class="right">销售出库</th><th class="right">销售退货</th><th class="right">期末</th>
              </tr></thead>
              <tbody>
                ${rows.map((r) => `<tr>
                  <td class="mono">${esc(r.code)}</td>
                  <td>${esc(r.name)}</td>
                  <td>${esc(r.unit)}</td>
                  <td class="right num">${r.openQty}</td>
                  <td class="right num">${r.poIn}</td>
                  <td class="right num">${r.poOut}</td>
                  <td class="right num">${r.soOut}</td>
                  <td class="right num">${r.soIn}</td>
                  <td class="right num"><b>${r.endQty}</b></td>
                </tr>`).join("")}
                <tr class="sum-row">
                  <td colspan="3">合计</td>
                  <td class="right num">${t.openQty}</td>
                  <td class="right num">${t.poIn}</td>
                  <td class="right num">${t.poOut}</td>
                  <td class="right num">${t.soOut}</td>
                  <td class="right num">${t.soIn}</td>
                  <td class="right num"><b>${t.endQty}</b></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="box-ft">
          <button class="btn" data-nav="home">返回工作台</button>
          <button class="btn btn-primary" data-act="invsum-export">导出 CSV</button>
        </div>
      </div>
    `;
  }

  /* ---------- 往来对账单 ---------- */
  function pageReconcile() {
    const type = state.f.recType;
    const rows = reconcileRows(type, state.f.recId);
    return `
      <div class="box">
        <div class="box-hd">对账条件 <span class="sub">采购/销售回款为模拟数，仅用于实训演示</span></div>
        <div class="box-bd">
          <div class="filters">
            <div class="f-item"><label>对象类型</label>
              <select class="select" id="f-recType">
                <option value="supplier" ${type === "supplier" ? "selected" : ""}>供应商</option>
                <option value="customer" ${type === "customer" ? "selected" : ""}>客户</option>
              </select></div>
            <div class="f-item"><label>往来单位</label>
              <select class="select" id="f-recId">
                <option value="">全部</option>
                ${type === "supplier"
                  ? optList(db.suppliers, "id", (x) => x.name, state.f.recId)
                  : optList(db.customers, "id", (x) => x.name, state.f.recId)}
              </select></div>
            <div class="f-item"><label>&nbsp;</label>
              <div class="btn-row">
                <button class="btn btn-primary" data-act="rec-search">查询</button>
                <button class="btn" data-act="rec-reset">重置</button>
                <button class="btn btn-primary" data-act="rec-export">导出 CSV</button>
              </div></div>
          </div>
        </div>
      </div>
      <div class="box">
        <div class="box-hd">对账预览 <span class="sub">${type === "supplier" ? "供应商：采购额 − 退货额 − 模拟付款 = 结存" : "客户：销售额 − 退货额 − 模拟回款 = 结存"}</span></div>
        <div class="box-bd">
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr>
                <th>编码</th><th>名称</th>
                ${type === "supplier"
                  ? `<th class="right">采购额</th><th class="right">退货额</th><th class="right">模拟付款</th><th class="right">结存</th>`
                  : `<th class="right">销售额</th><th class="right">退货额</th><th class="right">模拟回款</th><th class="right">结存</th>`}
              </tr></thead>
              <tbody>
                ${rows.length
                  ? rows.map((r) => `<tr>
                      <td class="mono">${esc(r.code)}</td>
                      <td>${esc(r.name)}</td>
                      <td class="right num">${type === "supplier" ? money(r.buy) : money(r.sell)}</td>
                      <td class="right num">${money(r.ret)}</td>
                      <td class="right num">${money(type === "supplier" ? r.pay : r.recv)}</td>
                      <td class="right num"><b>${money(r.bal)}</b></td>
                    </tr>`).join("")
                  : `<tr><td colspan="6" class="tbl-empty">暂无数据</td></tr>`}
              </tbody>
            </table>
          </div>
          <div class="notice-info">回款/付款为模拟数（已执行单据按 70% 估算），用于实训演示对账口径，不作为财务依据。</div>
        </div>
        <div class="box-ft">
          <button class="btn" data-nav="home">返回工作台</button>
          <button class="btn btn-primary" data-act="rec-export">导出 CSV</button>
        </div>
      </div>
    `;
  }

  /* ---------- 退货 / 盘点 / 汇总导出 业务函数 ---------- */
  function syncXsthLines() {
    const f = state.xsthForm;
    if (!f) return;
    document.querySelectorAll("[data-xline-p]").forEach((sel) => {
      f.lines[+sel.dataset.xlineP].productId = sel.value;
    });
    document.querySelectorAll("[data-xline-q]").forEach((inp) => {
      f.lines[+inp.dataset.xlineQ].qty = Number(inp.value) || 0;
    });
    document.querySelectorAll("[data-xline-pr]").forEach((inp) => {
      f.lines[+inp.dataset.xlinePr].price = Number(inp.value) || 0;
    });
  }
  function syncCgthLines() {
    const f = state.cgthForm;
    if (!f) return;
    document.querySelectorAll("[data-cline-p]").forEach((sel) => {
      f.lines[+sel.dataset.clineP].productId = sel.value;
    });
    document.querySelectorAll("[data-cline-q]").forEach((inp) => {
      f.lines[+inp.dataset.clineQ].qty = Number(inp.value) || 0;
    });
    document.querySelectorAll("[data-cline-pr]").forEach((inp) => {
      f.lines[+inp.dataset.clinePr].price = Number(inp.value) || 0;
    });
  }
  function syncPddLines() {
    const f = state.pddForm;
    if (!f) return;
    document.querySelectorAll("[data-pline-p]").forEach((sel) => {
      f.lines[+sel.dataset.plineP].productId = sel.value;
    });
    document.querySelectorAll("[data-pline-q]").forEach((inp) => {
      f.lines[+inp.dataset.plineQ].realQty = Number(inp.value) || 0;
    });
  }

  function saveXsth(status) {
    const f = state.xsthForm;
    if (!f) return;
    if (!f.customerId) return needField("客户");
    const lines = validateLines(f.lines, "so", existingLineIds({ id: f.id, kind: "xsth" }));
    if (!lines) return;
    const so = f.soId ? db.sales.find((x) => x.id === f.soId) : null;
    if (so) {
      for (const l of lines) {
        const max = maxReturnableSO(so, l.productId, f.id);
        if (l.qty > max) {
          return alertBox("err", "退货数量超限",
            "商品「" + (productById(l.productId)?.name || l.productId) + "」退货数量 " + l.qty + "，可退上限 " + max,
            "数量 ≤ 已出库量 − 已退货量。请修改数量后再保存。");
        }
      }
    }
    const rec = {
      id: f.id || uid("XSTH"),
      no: f.id ? f.no : nextXsthNo(),
      date: f.date || fmtD(today),
      customerId: f.customerId,
      soId: f.soId || "",
      soNo: f.soNo || (so ? so.no : ""),
      lines: lines,
      status: status === "draft" ? "草稿" : "待审核",
      createdBy: db.user.name,
      createdAt: f.createdAt || Date.now(),
      note: String(f.note || "").trim(),
      timeline: f.timeline || [],
    };
    rec.timeline.push({
      act: status === "draft" ? "录入退货草稿" : "提交待审",
      who: db.user.name,
      at: Date.now(),
    });
    if (f.id) {
      const i = db.salesReturns.findIndex((x) => x.id === f.id);
      db.salesReturns[i] = rec;
    } else {
      db.salesReturns.unshift(rec);
    }
    logAction(status === "draft" ? "新建销售退货草稿" : "提交销售退货", rec.no);
    if (!save()) { render(); return; }
    state.xsthForm = null;
    if (status === "draft") {
      alertBox("ok", "系统提示", "销售退货单已保存为草稿", "单号：" + rec.no);
    } else {
      alertBox("ok", "提交成功", "销售退货单已提交待审", "单号：" + rec.no + "。请点「模拟仓管确认」完成库存回加（实训演示）。");
    }
  }

  function submitXsth(id) {
    const d = db.salesReturns.find((x) => x.id === id);
    if (!d || d.status !== "草稿") return;
    d.status = "待审核";
    d.timeline = d.timeline || [];
    d.timeline.push({ act: "提交待审", who: db.user.name, at: Date.now() });
    logAction("提交销售退货", d.no);
    if (!save()) { render(); return; }
    render();
    alertBox("ok", "已提交待审", "销售退货单已提交，等待仓管确认。", "单号：" + d.no + "。确认后库存回加。");
  }

  function confirmXsth(id) {
    const d = db.salesReturns.find((x) => x.id === id);
    if (!d || d.status !== "待审核") return;
    if (!confirm("模拟仓管确认后：销售退货库存回加，并生成「销售退货」出入库流水。\n确认继续？（实训演示，真实环境由仓管处理）")) return;
    d.lines.forEach((l) => {
      const p = productById(l.productId);
      if (!p) return;
      db.stock[p.id] = (db.stock[p.id] || 0) + l.qty;
      db.moves.push({
        id: uid("M"), date: d.date, type: "销售退货", productId: p.id,
        productCode: p.code, productName: p.name, unit: p.unit,
        qty: l.qty, refNo: d.no, operator: "仓管老黄", note: "退货入库",
      });
    });
    d.status = "已退货";
    d.timeline.push({ act: "模拟仓管确认（库存回加）", who: "仓管老黄", at: Date.now() });
    logAction("销售退货确认", d.no + " 库存回加");
    markTask("returnConfirm");
    if (!save()) { render(); return; }
    state.viewDoc = { kind: "xsth", doc: JSON.parse(JSON.stringify(d)) };
    render();
    alertBox("ok", "退货已完成", "销售退货已确认，库存已回加。", "单号：" + d.no);
  }

  function saveCgth(status) {
    const f = state.cgthForm;
    if (!f) return;
    if (!f.supplierId) return needField("供应商");
    const lines = validateLines(f.lines, "po", existingLineIds({ id: f.id, kind: "cgth" }));
    if (!lines) return;
    const po = f.poId ? db.purchases.find((x) => x.id === f.poId) : null;
    if (po) {
      for (const l of lines) {
        const max = maxReturnablePO(po, l.productId, f.id);
        if (l.qty > max) {
          return alertBox("err", "退货数量超限",
            "商品「" + (productById(l.productId)?.name || l.productId) + "」退货数量 " + l.qty + "，可退上限 " + max,
            "数量 ≤ 已入库量 − 已退货量。请修改数量后再保存。");
        }
      }
    }
    const rec = {
      id: f.id || uid("CGTH"),
      no: f.id ? f.no : nextCgthNo(),
      date: f.date || fmtD(today),
      supplierId: f.supplierId,
      poId: f.poId || "",
      poNo: f.poNo || (po ? po.no : ""),
      lines: lines,
      status: status === "draft" ? "草稿" : "待审核",
      createdBy: db.user.name,
      createdAt: f.createdAt || Date.now(),
      note: String(f.note || "").trim(),
      timeline: f.timeline || [],
    };
    rec.timeline.push({
      act: status === "draft" ? "录入退货草稿" : "提交待审",
      who: db.user.name,
      at: Date.now(),
    });
    if (f.id) {
      const i = db.purchaseReturns.findIndex((x) => x.id === f.id);
      db.purchaseReturns[i] = rec;
    } else {
      db.purchaseReturns.unshift(rec);
    }
    logAction(status === "draft" ? "新建采购退货草稿" : "提交采购退货", rec.no);
    if (!save()) { render(); return; }
    state.cgthForm = null;
    if (status === "draft") {
      alertBox("ok", "系统提示", "采购退货单已保存为草稿", "单号：" + rec.no);
    } else {
      alertBox("ok", "提交成功", "采购退货单已提交待审", "单号：" + rec.no + "。确认后库存扣减。");
    }
  }

  function submitCgth(id) {
    const d = db.purchaseReturns.find((x) => x.id === id);
    if (!d || d.status !== "草稿") return;
    d.status = "待审核";
    d.timeline = d.timeline || [];
    d.timeline.push({ act: "提交待审", who: db.user.name, at: Date.now() });
    logAction("提交采购退货", d.no);
    if (!save()) { render(); return; }
    render();
    alertBox("ok", "已提交待审", "采购退货单已提交，等待仓管确认。", "单号：" + d.no);
  }

  function confirmCgth(id) {
    const d = db.purchaseReturns.find((x) => x.id === id);
    if (!d || d.status !== "待审核") return;

    /* 确认前逐行校验在库，不足整单拦截，绝不 clamp 成 0 */
    const shortage = (d.lines || []).filter((l) => (Number(db.stock[l.productId]) || 0) < (Number(l.qty) || 0));
    if (shortage.length) {
      return alertBox(
        "err",
        "在库不足，无法退货出库",
        shortage
          .map((l) => {
            const p = productById(l.productId);
            return (p ? p.name : l.productId) + " 在库 " + (db.stock[l.productId] || 0) + "，需退 " + l.qty;
          })
          .join("；"),
        "请先核对库存，或把该单保存为草稿后调整数量。"
      );
    }
    if (!confirm("模拟仓管确认后：采购退货库存扣减，并生成「采购退货」出入库流水。\n确认继续？（实训演示）")) return;

    d.lines.forEach((l) => {
      const p = productById(l.productId);
      if (!p) return;
      db.stock[p.id] = (Number(db.stock[p.id]) || 0) - (Number(l.qty) || 0);
      db.moves.push({
        id: uid("M"), date: d.date, type: "采购退货", productId: p.id,
        productCode: p.code, productName: p.name, unit: p.unit,
        qty: -l.qty, refNo: d.no, operator: "仓管老黄", note: "退货出库",
      });
    });
    d.status = "已退货";
    d.timeline.push({ act: "模拟仓管确认（库存扣减）", who: "仓管老黄", at: Date.now() });
    logAction("采购退货确认", d.no + " 库存扣减");
    markTask("returnConfirm");
    if (!save()) { render(); return; }
    state.viewDoc = { kind: "cgth", doc: JSON.parse(JSON.stringify(d)) };
    render();
    alertBox("ok", "退货已完成", "采购退货已确认，库存已扣减。", "单号：" + d.no);
  }

  function exportXsth() {
    const rows = (db.salesReturns || []).map((d) => [
      d.date, d.no, d.soNo || "", customerName(d.customerId),
      d.lines.map((l) => (productById(l.productId)?.name || "") + "×" + l.qty).join(" / "),
      money(lineAmount(d.lines)), d.status, d.createdBy,
    ]);
    exportCSV("销售退货明细_" + fmtD(today) + ".csv",
      ["日期", "退货单号", "原销售单", "客户", "明细", "金额", "状态", "制单人"], rows);
  }
  function exportCgth() {
    const rows = (db.purchaseReturns || []).map((d) => [
      d.date, d.no, d.poNo || "", supplierName(d.supplierId),
      d.lines.map((l) => (productById(l.productId)?.name || "") + "×" + l.qty).join(" / "),
      money(lineAmount(d.lines)), d.status, d.createdBy,
    ]);
    exportCSV("采购退货明细_" + fmtD(today) + ".csv",
      ["日期", "退货单号", "原采购单", "供应商", "明细", "金额", "状态", "制单人"], rows);
  }

  function savePdd(status) {
    const f = state.pddForm;
    if (!f) return;
    const lines = [];
    let err = null;
    (f.lines || []).forEach((l, i) => {
      if (err || !l.productId) return;
      const p = productById(l.productId);
      if (!p) return;
      const real = Number(l.realQty);
      if (!Number.isFinite(real) || real < 0) {
        err = "第 " + (i + 1) + " 行：实盘数必须 ≥ 0";
        return;
      }
      lines.push({ productId: l.productId, bookQty: db.stock[l.productId] || 0, realQty: real });
    });
    if (err) return alertBox("err", "明细校验未通过", err, "请修改后再保存。");
    if (!lines.length) return needField("盘点明细（至少一行商品）");
    const rec = {
      id: f.id || uid("PDD"),
      no: f.id ? f.no : nextPddNo(),
      date: f.date || fmtD(today),
      warehouse: f.warehouse || "主仓",
      lines: lines,
      status: status === "draft" ? "草稿" : "待审核",
      note: String(f.note || "").trim(),
      createdBy: db.user.name,
      createdAt: f.createdAt || Date.now(),
      timeline: f.timeline || [],
    };
    rec.timeline.push({
      act: status === "draft" ? "录入盘点单" : "提交待审",
      who: db.user.name,
      at: Date.now(),
    });
    if (f.id) {
      const i = db.stockChecks.findIndex((x) => x.id === f.id);
      db.stockChecks[i] = rec;
    } else {
      db.stockChecks.unshift(rec);
    }
    logAction(status === "draft" ? "新建盘点草稿" : "提交盘点单", rec.no);
    if (!save()) { render(); return; }
    state.pddForm = null;
    if (status === "draft") {
      alertBox("ok", "系统提示", "盘点单已保存为草稿", "单号：" + rec.no + "。草稿不改库存。");
    } else {
      alertBox("ok", "提交成功", "盘点单已提交待审", "单号：" + rec.no + "。点「模拟仓管确认」后按差异入账。");
    }
  }

  function submitPdd(id) {
    const d = db.stockChecks.find((x) => x.id === id);
    if (!d || d.status !== "草稿") return;
    d.status = "待审核";
    d.timeline = d.timeline || [];
    d.timeline.push({ act: "提交待审", who: db.user.name, at: Date.now() });
    logAction("提交盘点单", d.no);
    if (!save()) { render(); return; }
    render();
  }

  function confirmPdd(id) {
    const d = db.stockChecks.find((x) => x.id === id);
    if (!d || d.status !== "待审核") return;
    if (!confirm("模拟仓管确认后：按「确认时库存」重算差异并调整库存。\n确认继续？（实训演示，真实环境由仓管/财务处理）")) return;
    (d.lines || []).forEach((l) => {
      const p = productById(l.productId);
      if (!p) return;
      /* 关键：以确认时的当前库存为账面，而不是保存时的旧账面 */
      const bookNow = Number(db.stock[p.id]) || 0;
      const real = Number(l.realQty) || 0;
      const diff = real - bookNow;
      l.confirmBookQty = bookNow; // 留痕：确认时账面
      db.stock[p.id] = real;
      if (diff !== 0) {
        db.moves.push({
          id: uid("M"), date: d.date, type: "盘点调整", productId: p.id,
          productCode: p.code, productName: p.name, unit: p.unit,
          qty: diff, refNo: d.no, operator: "仓管老黄",
          note: "盘点差异入账（确认时账面 " + bookNow + "）",
        });
      }
    });
    d.status = "已盘点";
    d.timeline.push({ act: "模拟仓管确认（按确认时账面重算）", who: "仓管老黄", at: Date.now() });
    logAction("盘点确认", d.no + " 差异入账");
    markTask("stockConfirm");
    if (!save()) { render(); return; }
    state.viewDoc = { kind: "pdd", doc: JSON.parse(JSON.stringify(d)) };
    render();
    alertBox("ok", "盘点已完成", "盘点差异已入账，库存已按实盘数更新。", "单号：" + d.no);
  }

  /* ---------- 采购审核/入库、销售审核/出库 ---------- */
  function auditPO(id) {
    const d = db.purchases.find((x) => x.id === id);
    if (!d) return;
    if (d.status !== "待审核") return alertBox("warn", "状态不允许", "只有「待审核」采购单可以审核。", "当前状态：" + d.status);
    d.status = "已审核";
    d.timeline = d.timeline || [];
    d.timeline.push({ act: "模拟财务审核通过", who: "财务主管（实训）", at: Date.now() });
    logAction("采购审核", d.no + " 待审核 → 已审核");
    if (!save()) { render(); return; }
    state.viewDoc = { kind: "po", doc: JSON.parse(JSON.stringify(d)) };
    render();
    alertBox("ok", "审核完成", "采购单已审核，等待仓管入库。", "单号：" + d.no);
  }

  function receivePO(id) {
    const d = db.purchases.find((x) => x.id === id);
    if (!d) return;
    if (d.status !== "已审核") return alertBox("warn", "状态不允许", "只有「已审核」采购单可以入库。", "当前状态：" + d.status);
    const lines = (d.lines || []).filter((l) => (Number(l.qty) || 0) > (Number(l.receivedQty) || 0));
    if (!lines.length) return alertBox("warn", "无需入库", "该采购单已经没有待入库数量。", "单号：" + d.no);
    if (!confirm("模拟仓管入库后：按明细数量增加库存，并生成「采购入库」流水。\n确认继续？")) return;

    lines.forEach((l) => {
      const p = productById(l.productId);
      if (!p) return;
      const qty = (Number(l.qty) || 0) - (Number(l.receivedQty) || 0);
      db.stock[p.id] = (Number(db.stock[p.id]) || 0) + qty;
      db.moves.push({
        id: uid("M"), date: d.date, type: "采购入库", productId: p.id,
        productCode: p.code, productName: p.name, unit: p.unit,
        qty: qty, refNo: d.no, operator: "仓管老黄", note: "采购入库",
      });
      l.receivedQty = Number(l.qty) || 0;
    });
    d.status = "已入库";
    d.timeline.push({ act: "模拟仓管入库（库存增加）", who: "仓管老黄", at: Date.now() });
    logAction("采购入库", d.no + " 库存增加");
    markTask("poReceive");
    if (!save()) { render(); return; }
    state.viewDoc = { kind: "po", doc: JSON.parse(JSON.stringify(d)) };
    render();
    alertBox("ok", "入库完成", "采购入库已完成，库存与流水已同步。", "单号：" + d.no);
  }

  function auditSO(id) {
    const d = db.sales.find((x) => x.id === id);
    if (!d) return;
    if (d.status !== "待审核") return alertBox("warn", "状态不允许", "只有「待审核」销售单可以审核。", "当前状态：" + d.status);
    d.status = "待出库";
    d.timeline = d.timeline || [];
    d.timeline.push({ act: "模拟财务审核通过", who: "财务主管（实训）", at: Date.now() });
    logAction("销售审核", d.no + " 待审核 → 待出库");
    if (!save()) { render(); return; }
    state.viewDoc = { kind: "so", doc: JSON.parse(JSON.stringify(d)) };
    render();
    alertBox("ok", "审核完成", "销售单已审核，等待仓管出库。", "单号：" + d.no);
  }

  function shipSO(id) {
    const d = db.sales.find((x) => x.id === id);
    if (!d) return;
    if (d.status !== "待出库" && d.status !== "部分出库") {
      return alertBox("warn", "状态不允许", "只有「待出库 / 部分出库」销售单可以出库。", "当前状态：" + d.status);
    }
    const todo = (d.lines || [])
      .map((l) => ({ l: l, qty: soLineRemaining(l) }))
      .filter((x) => x.qty > 0);
    if (!todo.length) return alertBox("warn", "无需出库", "该销售单已经全部出库。", "单号：" + d.no);
    const bad = todo.filter((x) => (Number(db.stock[x.l.productId]) || 0) < x.qty);
    if (bad.length) {
      return alertBox(
        "err",
        "现存量不足，无法出库",
        bad
          .map((x) => {
            const p = productById(x.l.productId);
            return (p ? p.name : x.l.productId) + " 需出 " + x.qty + "，现存 " + (db.stock[x.l.productId] || 0);
          })
          .join("；"),
        "请先采购入库，或减少本单数量。"
      );
    }
    if (!confirm("模拟仓管出库后：扣减库存并生成「销售出库」流水。\n确认继续？")) return;

    todo.forEach((x) => {
      const p = productById(x.l.productId);
      if (!p) return;
      db.stock[p.id] = (Number(db.stock[p.id]) || 0) - x.qty;
      db.moves.push({
        id: uid("M"), date: d.date, type: "销售出库", productId: p.id,
        productCode: p.code, productName: p.name, unit: p.unit,
        qty: -x.qty, refNo: d.no, operator: "仓管老黄", note: "销售出库",
      });
      x.l.shippedQty = Number(x.l.qty) || 0;
    });
    d.status = (d.lines || []).every((l) => soLineRemaining(l) <= 0) ? "已出库" : "部分出库";
    d.timeline.push({ act: "模拟仓管出库（库存扣减）", who: "仓管老黄", at: Date.now() });
    logAction("销售出库", d.no + " 库存扣减");
    markTask("soShip");
    if (!save()) { render(); return; }
    state.viewDoc = { kind: "so", doc: JSON.parse(JSON.stringify(d)) };
    render();
    alertBox("ok", "出库完成", "销售出库已完成，库存与流水已同步。", "单号：" + d.no);
  }

  /* ---------- 草稿删除 / 待审核作废 / 已生效红冲 ---------- */
  function docStore(kind) {
    if (kind === "po") return db.purchases;
    if (kind === "so") return db.sales;
    if (kind === "xsth") return db.salesReturns || [];
    if (kind === "cgth") return db.purchaseReturns || [];
    if (kind === "pdd") return db.stockChecks || [];
    return [];
  }
  function docKindName(kind) {
    return { po: "采购单", so: "销售单", xsth: "销售退货单", cgth: "采购退货单", pdd: "盘点单" }[kind] || "单据";
  }

  function deleteDoc(kind, id) {
    const arr = docStore(kind);
    const i = arr.findIndex((x) => x.id === id);
    if (i < 0) return;
    const d = arr[i];
    if (d.status !== "草稿") return alertBox("warn", "不能删除", "只有草稿可以删除。", "当前状态：" + d.status);
    if (!confirm("确定删除草稿「" + d.no + "」？删除后不可恢复。")) return;
    arr.splice(i, 1);
    state.viewDoc = null;
    logAction("删除草稿", docKindName(kind) + " " + d.no);
    if (!save()) { render(); return; }
    render();
    alertBox("ok", "已删除", docKindName(kind) + "草稿已删除。", d.no);
  }

  function voidDoc(kind, id) {
    const arr = docStore(kind);
    const d = arr.find((x) => x.id === id);
    if (!d) return;
    if (d.status !== "待审核") return alertBox("warn", "不能作废", "只有「待审核」单据可以作废；已生效单据请走红冲。", "当前状态：" + d.status);
    if (!confirm("确定作废「" + d.no + "」？作废后不产生库存影响。")) return;
    d.status = "已作废";
    d.timeline = d.timeline || [];
    d.timeline.push({ act: "作废单据", who: db.user.name, at: Date.now() });
    logAction("作废单据", docKindName(kind) + " " + d.no);
    if (!save()) { render(); return; }
    state.viewDoc = { kind: kind, doc: JSON.parse(JSON.stringify(d)) };
    render();
    alertBox("ok", "已作废", docKindName(kind) + "已作废。", d.no);
  }

  function redFlush(kind, id) {
    const arr = docStore(kind);
    const d = arr.find((x) => x.id === id);
    if (!d) return;
    const allowed =
      (kind === "po" && d.status === "已入库") ||
      (kind === "so" && (d.status === "已出库" || d.status === "部分出库")) ||
      ((kind === "xsth" || kind === "cgth") && d.status === "已退货") ||
      (kind === "pdd" && d.status === "已盘点");
    if (!allowed) return alertBox("warn", "当前状态不能红冲", "请确认单据已生效且未作废。", "当前状态：" + d.status);
    if (!confirm("模拟财务红冲「" + d.no + "」？\n将生成反向流水、回退库存，并把单据标记为「已作废」。")) return;

    if (kind === "po") {
      (d.lines || []).forEach((l) => {
        const p = productById(l.productId);
        if (!p) return;
        const qty = Number(l.receivedQty != null ? l.receivedQty : l.qty) || 0;
        if (!qty) return;
        db.stock[p.id] = (Number(db.stock[p.id]) || 0) - qty;
        db.moves.push({
          id: uid("M"), date: fmtD(today), type: "采购入库", productId: p.id,
          productCode: p.code, productName: p.name, unit: p.unit,
          qty: -qty, refNo: d.no, operator: "财务主管（红冲）", note: "红冲采购入库",
        });
      });
    } else if (kind === "so") {
      (d.lines || []).forEach((l) => {
        const p = productById(l.productId);
        if (!p) return;
        const qty = Number(l.shippedQty) || 0;
        if (!qty) return;
        db.stock[p.id] = (Number(db.stock[p.id]) || 0) + qty;
        db.moves.push({
          id: uid("M"), date: fmtD(today), type: "销售出库", productId: p.id,
          productCode: p.code, productName: p.name, unit: p.unit,
          qty: qty, refNo: d.no, operator: "财务主管（红冲）", note: "红冲销售出库",
        });
      });
    } else if (kind === "xsth" || kind === "cgth") {
      const sign = kind === "xsth" ? -1 : 1;
      (d.lines || []).forEach((l) => {
        const p = productById(l.productId);
        if (!p) return;
        const qty = Number(l.qty) || 0;
        db.stock[p.id] = (Number(db.stock[p.id]) || 0) + sign * qty;
        db.moves.push({
          id: uid("M"), date: fmtD(today), type: kind === "xsth" ? "销售退货" : "采购退货", productId: p.id,
          productCode: p.code, productName: p.name, unit: p.unit,
          qty: sign * qty, refNo: d.no, operator: "财务主管（红冲）", note: "红冲退货",
        });
      });
    } else if (kind === "pdd") {
      (d.lines || []).forEach((l) => {
        const p = productById(l.productId);
        if (!p) return;
        const book = Number(l.confirmBookQty != null ? l.confirmBookQty : l.bookQty) || 0;
        const diff = (Number(l.realQty) || 0) - book;
        if (!diff) return;
        db.stock[p.id] = (Number(db.stock[p.id]) || 0) - diff;
        db.moves.push({
          id: uid("M"), date: fmtD(today), type: "盘点调整", productId: p.id,
          productCode: p.code, productName: p.name, unit: p.unit,
          qty: -diff, refNo: d.no, operator: "财务主管（红冲）", note: "红冲盘点调整",
        });
      });
    }

    d.status = "已作废";
    d.voidReason = "红冲";
    d.timeline = d.timeline || [];
    d.timeline.push({ act: "模拟财务红冲", who: "财务主管（实训）", at: Date.now() });
    logAction("红冲单据", docKindName(kind) + " " + d.no);
    if (!save()) { render(); return; }
    state.viewDoc = { kind: kind, doc: JSON.parse(JSON.stringify(d)) };
    render();
    alertBox("ok", "红冲完成", docKindName(kind) + "已红冲并作废。", "单号：" + d.no + "。库存与流水已生成反向记录。");
  }

  /* ---------- 整库备份 / 恢复 ---------- */
  function snapshotKeys() {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf("gjp-erp-snapshot-") === 0) out.push(k);
      }
    } catch (e) {}
    return out.sort();
  }

  function snapshotCurrent(reason) {
    try {
      const key = "gjp-erp-snapshot-" + Date.now();
      localStorage.setItem(key, JSON.stringify({ at: Date.now(), reason: reason || "", db: db }));
      const keys = snapshotKeys();
      while (keys.length > 3) {
        const old = keys.shift();
        localStorage.removeItem(old);
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function restoreLatestSnapshot() {
    const keys = snapshotKeys();
    if (!keys.length) return alertBox("warn", "没有可用备份", "系统还没有生成本地快照。", "可在侧栏先「导出整库备份」。");
    restoreSnapshotById(keys[keys.length - 1]);
  }

  /* 解析快照列表：时间、原因、业务量、大小；坏快照单独标记，不阻断整页 */
  function listSnapshots() {
    const out = [];
    snapshotKeys().forEach((key) => {
      try {
        const raw = localStorage.getItem(key) || "";
        const obj = JSON.parse(raw);
        const d = obj && obj.db;
        const keyAt = Number(String(key).replace("gjp-erp-snapshot-", "")) || 0;
        if (!d) {
          out.push({ key: key, at: keyAt, reason: "快照结构不完整", bad: true, size: raw.length });
          return;
        }
        out.push({
          key: key,
          at: Number(obj.at) || keyAt,
          reason: obj.reason || "",
          products: (d.products || []).length,
          docs: (d.purchases || []).length + (d.sales || []).length +
            (d.salesReturns || []).length + (d.purchaseReturns || []).length + (d.stockChecks || []).length,
          moves: (d.moves || []).length,
          size: raw.length,
          bad: false,
        });
      } catch (e) {
        out.push({ key: key, at: 0, reason: "快照无法解析", bad: true, size: 0 });
      }
    });
    return out.reverse();
  }

  /* 导入前整库体检：结构、重复编码、单据引用、库存/流水是否对得上 */
  function validateBackupData(d) {
    const errors = [], warnings = [];
    if (!d || typeof d !== "object") return { ok: false, errors: ["备份内容不是对象"], warnings: warnings };
    const arrays = ["products", "suppliers", "customers", "purchases", "sales",
      "salesReturns", "purchaseReturns", "stockChecks", "moves", "logs"];
    arrays.forEach((k) => { if (!Array.isArray(d[k])) errors.push("缺少数组字段：" + k); });
    if (!d.stock || typeof d.stock !== "object" || Array.isArray(d.stock)) errors.push("缺少库存对象：stock");
    if (errors.length) return { ok: false, errors: errors, warnings: warnings };

    const pids = new Set(), codes = new Set();
    d.products.forEach((p, i) => {
      if (!p || !p.id || !p.code || !p.name) errors.push("第 " + (i + 1) + " 个商品缺少 id/编码/名称");
      if (p && p.id) { if (pids.has(p.id)) errors.push("商品 id 重复：" + p.id); pids.add(p.id); }
      if (p && p.code) { if (codes.has(p.code)) errors.push("商品编码重复：" + p.code); codes.add(p.code); }
    });
    const supplierIds = new Set((d.suppliers || []).map((s) => s && s.id).filter(Boolean));
    const customerIds = new Set((d.customers || []).map((c) => c && c.id).filter(Boolean));

    Object.keys(d.stock).forEach((pid) => {
      if (!pids.has(pid)) errors.push("库存表存在未知商品 id：" + pid);
      const n = Number(d.stock[pid]);
      if (!isFinite(n)) errors.push("库存不是数字：" + pid);
      else if (n < 0) warnings.push("库存为负：" + pid + " = " + n);
    });
    d.moves.forEach((m, i) => {
      if (!m || !m.productId || !pids.has(m.productId)) errors.push("流水第 " + (i + 1) + " 条商品引用无效");
      if (m && !isFinite(Number(m.qty))) errors.push("流水第 " + (i + 1) + " 条数量不是数字");
    });
    const moveSum = {};
    d.moves.forEach((m) => {
      if (!m || !m.productId) return;
      moveSum[m.productId] = (moveSum[m.productId] || 0) + (Number(m.qty) || 0);
    });
    d.products.forEach((p) => {
      if (!p || !p.id) return;
      const stockQty = Number(d.stock[p.id] || 0);
      const sum = Number(moveSum[p.id] || 0);
      if (Math.abs(stockQty - sum) > 0.001) {
        warnings.push("账实可能不一致：" + (p.code || p.id) + " 库存 " + stockQty + " / 流水累计 " + sum);
      }
    });

    const docSets = [
      ["purchases", "supplierId", supplierIds, "采购单"],
      ["purchaseReturns", "supplierId", supplierIds, "采购退货单"],
      ["sales", "customerId", customerIds, "销售单"],
      ["salesReturns", "customerId", customerIds, "销售退货单"],
    ];
    docSets.forEach(([coll, field, ids, label]) => {
      const dids = new Set();
      d[coll].forEach((doc, i) => {
        if (!doc || !doc.id) errors.push(label + "第 " + (i + 1) + " 张缺少 id");
        if (doc && doc.id) { if (dids.has(doc.id)) errors.push(label + " id 重复：" + doc.id); dids.add(doc.id); }
        if (doc && doc[field] && !ids.has(doc[field])) errors.push(label + (doc.no || doc.id || i + 1) + " 的往来单位引用无效");
        ((doc && doc.lines) || []).forEach((l, j) => {
          if (!l || !l.productId || !pids.has(l.productId)) errors.push(label + (doc.no || doc.id || i + 1) + " 第 " + (j + 1) + " 行商品引用无效");
        });
      });
    });
    d.stockChecks.forEach((doc, i) => {
      ((doc && doc.lines) || []).forEach((l, j) => {
        if (!l || !l.productId || !pids.has(l.productId)) errors.push("盘点单" + ((doc && doc.no) || i + 1) + " 第 " + (j + 1) + " 行商品引用无效");
      });
    });
    if (!d.counters || typeof d.counters !== "object") warnings.push("缺少单号计数器，导入后会按现有单据补齐");
    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  function restoreSnapshotById(key) {
    if (!key) return;
    let obj;
    try {
      obj = JSON.parse(localStorage.getItem(key) || "");
    } catch (e) {
      return alertBox("err", "备份损坏", "这份快照无法解析。", "请改用「导入整库备份」，或选择其他快照。");
    }
    if (!obj || !obj.db) return alertBox("err", "备份无效", "快照结构不完整。", "请选择其他快照。");
    let candidate;
    try {
      candidate = migrate(obj.db);
    } catch (e) {
      return alertBox("err", "备份无法迁移", "快照数据与当前版本不兼容。", "请改用「导入整库备份」。");
    }
    const check = validateBackupData(candidate);
    if (!check.ok) {
      return alertBox("err", "快照校验失败", "这份快照存在 " + check.errors.length + " 处问题，未恢复。",
        check.errors.slice(0, 3).join("；"));
    }
    if (!confirm("恢复这份备份？\n时间：" + (obj.at ? fmtDT(obj.at) : "未知") +
      "\n原因：" + (obj.reason || "—") + "\n\n当前数据会先自动快照一份，恢复失败会自动回滚。")) return;
    if (!snapshotCurrent("恢复前自动快照")) {
      return alertBox("warn", "无法创建自动快照", "本地存储空间可能已满，已取消恢复。", "请先「导出整库备份」或清理浏览器存储。");
    }

    const prevDb = db, prevLoadError = loadError, prevCorruptRaw = corruptRaw;
    db = candidate;
    loadError = null;
    corruptRaw = null;
    let saved = false;
    try { saved = save({ force: true }); } catch (e) { saved = false; }
    if (!saved) {
      db = prevDb;
      loadError = prevLoadError;
      corruptRaw = prevCorruptRaw;
      return alertBox("err", "恢复失败，已回滚", "写入本地存储失败，当前账套没有变化。", "请先导出备份，再清理浏览器空间。");
    }
    state.route = "backup-history";
    state.viewDoc = state.poForm = state.soForm = state.xsthForm = state.cgthForm = state.pddForm = null;
    state.formDirty = false;
    render();
    alertBox("ok", "已恢复", "备份已恢复。", "备份时间：" + (obj.at ? fmtDT(obj.at) : "未知") + "。");
  }

  function pageBackupHistory() {
    const list = listSnapshots();
    const rows = list.map((s) => `
      <tr>
        <td class="mono">${s.at ? esc(fmtDT(s.at)) : "—"}</td>
        <td>${esc(s.reason || "手动/自动快照")}${s.bad ? ' <span class="st st-cancelled">损坏</span>' : ""}</td>
        <td class="right num">${s.bad ? "—" : s.products}</td>
        <td class="right num">${s.bad ? "—" : s.docs}</td>
        <td class="right num">${s.bad ? "—" : s.moves}</td>
        <td class="right num">${s.bad ? "—" : Math.round(s.size / 1024) + " KB"}</td>
        <td>
          <button class="btn btn-sm" data-act="restore-snapshot" data-id="${esc(s.key)}" ${s.bad ? "disabled" : ""}>恢复此备份</button>
        </td>
      </tr>`).join("");
    const cards = list.map((s) => `
      <div class="history-card">
        <div class="hc-top">
          <span class="hc-time">${s.at ? esc(fmtDT(s.at)) : "—"}</span>
          ${s.bad ? '<span class="st st-cancelled">损坏</span>' : ""}
        </div>
        <div class="hc-reason">${esc(s.reason || "手动/自动快照")}</div>
        <div class="hc-meta">${s.bad ? "无法读取" : `商品 ${s.products} · 单据 ${s.docs} · 流水 ${s.moves} · ${Math.round(s.size / 1024)} KB`}</div>
        <button class="btn btn-sm" data-act="restore-snapshot" data-id="${esc(s.key)}" ${s.bad ? "disabled" : ""}>恢复此备份</button>
      </div>`).join("");
    return `
      <div class="box">
        <div class="box-hd">历史备份 <span class="sub">本机最多保留最近 3 份自动快照</span></div>
        <div class="box-bd">
          <div class="btn-row" style="margin-bottom:8px">
            <button class="btn btn-primary" data-act="backup-export">导出当前整库</button>
            <button class="btn" data-act="backup-import">导入/恢复整库</button>
          </div>
          <div class="tbl-wrap history-table">
            <table class="tbl">
              <thead><tr><th>时间</th><th>说明</th><th class="right">商品</th><th class="right">单据</th><th class="right">流水</th><th class="right">大小</th><th>操作</th></tr></thead>
              <tbody>${rows || '<tr><td colspan="7" class="tbl-empty">还没有本地快照。导入或恢复前会自动生成一份。</td></tr>'}</tbody>
            </table>
          </div>
          <div class="history-cards">${cards || '<div class="tbl-empty">还没有本地快照。导入或恢复前会自动生成一份。</div>'}</div>
          <p class="hint" style="margin-top:8px">快照只存在当前浏览器；换电脑或清缓存前，请先「导出当前整库」保存到磁盘。</p>
        </div>
      </div>`;
  }

  function exportBackup() {
    const payload = {
      app: "gjp-erp-clerk",
      v: DB_VERSION,
      exportedAt: new Date().toISOString(),
      db: db,
    };
    const text = JSON.stringify(payload, null, 2);
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "文员ERP整库备份_" + fmtD(today) + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
    alertBox("ok", "备份已导出", "整库 JSON 已下载。", "含全部单据、库存、流水、任务进度与日志。");
  }

  function importBackupFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      let obj;
      try {
        obj = JSON.parse(String(reader.result || ""));
      } catch (e) {
        return alertBox("err", "导入失败", "文件不是合法的 JSON。", "请选择由本系统「导出整库备份」生成的文件。");
      }
      const data = obj && obj.db ? obj.db : obj;
      if (!data || !Array.isArray(data.products) || !data.stock || !Array.isArray(data.moves)) {
        return alertBox("err", "导入失败", "文件缺少必要字段（products / stock / moves）。", "请确认这是文员 ERP 的整库备份。");
      }
      let m;
      try {
        m = migrate(data);
      } catch (e) {
        return alertBox("err", "导入失败", "备份数据无法迁移到当前版本。", "请确认文件由本系统导出，且未被手工改坏。");
      }
      const check = validateBackupData(m);
      if (!check.ok) {
        return alertBox("err", "备份校验失败", "文件存在 " + check.errors.length + " 处结构/引用问题，未导入。",
          check.errors.slice(0, 3).join("；") + (check.errors.length > 3 ? "……" : ""));
      }
      const info =
        "商品 " + m.products.length + " 条，单据 " +
        (m.purchases.length + m.sales.length + (m.salesReturns || []).length + (m.purchaseReturns || []).length + (m.stockChecks || []).length) +
        " 张，流水 " + m.moves.length + " 条。" +
        (check.warnings.length ? "\n另有 " + check.warnings.length + " 条提醒：" + check.warnings.slice(0, 2).join("；") : "");
      if (!confirm("导入将覆盖当前账套。\n" + info + "\n\n当前数据会先自动快照，写入失败会自动回滚。确认继续？")) return;
      if (!snapshotCurrent("导入前自动快照")) {
        return alertBox("warn", "无法创建自动快照", "本地存储空间可能已满，已取消导入。", "请先「导出整库备份」或清理浏览器存储。");
      }

      const prevDb = db, prevLoadError = loadError, prevCorruptRaw = corruptRaw;
      db = m;
      loadError = null;
      corruptRaw = null;
      let saved = false;
      try { saved = save({ force: true }); } catch (e) { saved = false; }
      if (!saved) {
        db = prevDb;
        loadError = prevLoadError;
        corruptRaw = prevCorruptRaw;
        return alertBox("err", "导入失败，已回滚", "写入本地存储失败，当前账套没有变化。", "请先导出备份，再清理浏览器空间。");
      }
      state.route = "home";
      state.viewDoc = state.poForm = state.soForm = state.xsthForm = state.cgthForm = state.pddForm = null;
      state.formDirty = false;
      render();
      alertBox("ok", "导入完成", "账套已恢复。", info);
    };
    reader.readAsText(file, "utf-8");
  }

  function exportInvSum() {
    const from = state.f.invFrom, to = state.f.invTo;
    const rows = invSumRows(from, to);
    const t = invSumTotal(rows);
    const data = rows.map((r) => [
      r.code, r.name, r.unit, r.openQty, r.poIn, r.poOut, r.soOut, r.soIn, r.adjustQty, r.endQty,
    ]);
    data.push(["", "合计", "", t.openQty, t.poIn, t.poOut, t.soOut, t.soIn, t.adjustQty, t.endQty]);
    markTask("exportInv");
    db.flags = db.flags || {};
    db.flags.exportedInv = true;
    logAction("导出进销存汇总", from + " ~ " + to);
    exportCSV("进销存汇总_" + from + "_" + to + ".csv",
      ["商品编码", "品名", "单位", "期初", "采购入库", "采购退货", "销售出库", "销售退货", "盘点调整", "期末"], data);
  }

  function exportReconcile() {
    const type = state.f.recType;
    const rows = reconcileRows(type, state.f.recId);
    const data = type === "supplier"
      ? rows.map((r) => [r.code, r.name, money(r.buy), money(r.ret), money(r.pay), money(r.bal)])
      : rows.map((r) => [r.code, r.name, money(r.sell), money(r.ret), money(r.recv), money(r.bal)]);
    exportCSV(
      (type === "supplier" ? "供应商对账单_" : "客户对账单_") + fmtD(today) + ".csv",
      type === "supplier"
        ? ["编码", "名称", "采购额", "退货额", "模拟付款", "结存"]
        : ["编码", "名称", "销售额", "退货额", "模拟回款", "结存"],
      data
    );
  }

  /* ---------- 弹窗 HTML ---------- */
  function modalHtml() {
    if (!modal.show) return "";
    const icon = { ok: "✓", err: "!", warn: "⚠", info: "i" }[modal.type] || "i";
    const cls = { ok: "msg-ok", err: "msg-err", warn: "msg-warn", info: "msg-info" }[modal.type] || "msg-info";
    return `
      <div class="mask" data-act="close-modal-bg">
        <div class="dlg" role="dialog" aria-modal="true" aria-label="系统提示">
          <div class="dlg-hd"><span>系统提示</span><button data-act="close-modal" aria-label="关闭弹窗">×</button></div>
          <div class="dlg-bd ${cls}">
            <div class="msg-icon">${icon}</div>
            <div class="msg-title">${esc(modal.title)}</div>
            <div class="msg-text">${esc(modal.text)}</div>
            ${modal.extra ? `<div class="msg-text" style="margin-top:8px;color:var(--ink3)">${esc(modal.extra)}</div>` : ""}
            <div style="clear:both"></div>
          </div>
          <div class="dlg-ft">
            <button class="btn btn-primary" data-act="close-modal">确定</button>
          </div>
        </div>
      </div>
    `;
  }

  function tourHtml() {
    if (!db.tourOn) return "";
    const i = Math.min(db.tourStep || 0, TOUR.length - 1);
    const s = TOUR[i];
    const mini = !!db.tourMini;
    const pct = Math.round(((i + 1) / TOUR.length) * 100);
    return `
      <div class="tour ${mini ? "mini" : ""}">
        <div class="tour-hd">
          <span>${mini ? "教程 " + (i + 1) + "/" + TOUR.length : "分步教程 " + (i + 1) + "/" + TOUR.length}</span>
          <span class="tour-btns">
            <button data-act="tour-mini" title="${mini ? "展开" : "最小化"}" aria-label="${mini ? "展开教程" : "最小化教程"}">${mini ? "□" : "—"}</button>
            <button data-act="tour-close" title="关闭教程" aria-label="关闭教程">×</button>
          </span>
        </div>
        <div class="tour-progress" role="progressbar" aria-valuemin="1" aria-valuemax="${TOUR.length}" aria-valuenow="${i + 1}" aria-label="教程进度">
          <span style="width:${pct}%"></span>
        </div>
        <div class="tour-bd">
          <div class="tour-step">${esc(s.title)}</div>
          <div class="tour-text">${esc(s.text).replace(/\n/g, "<br>")}</div>
        </div>
        <div class="tour-actions">
          <button class="btn" data-act="tour-prev" ${i === 0 ? "disabled" : ""}>上一步</button>
          <button class="btn btn-primary" data-act="tour-next">${i === TOUR.length - 1 ? "完成" : "下一步"}</button>
        </div>
      </div>
    `;
  }

  /* ---------- 整页渲染 ---------- */
  function render() {
    try {
      renderInner();
    } catch (e) {
      renderFallback(e);
    }
  }

  function renderInner() {
    const menu = menuOf(state.route);
    const sides = SIDE[menu] || [];
    let body = "";
    switch (state.route) {
      case "home": body = pageHome(); break;
      case "tasks": body = pageTasks(); break;
      case "manual": body = pageManual(); break;
      case "sys-logs": body = pageLogs(); break;
      case "backup-history": body = pageBackupHistory(); break;
      case "base-products": body = pageProducts(); break;
      case "base-suppliers": body = pageSuppliers(); break;
      case "base-customers": body = pageCustomers(); break;
      case "purchase-list":
      case "purchase-in": body = state.route === "purchase-list" ? pagePurchaseList() : pagePurchaseIn(); break;
      case "purchase-return": body = pagePurchaseReturnList(); break;
      case "sales-list":
      case "sales-out": body = state.route === "sales-list" ? pageSalesList() : pageSalesOut(); break;
      case "sales-return": body = pageSalesReturnList(); break;
      case "stock-query": body = pageStockQuery(); break;
      case "stock-alert": body = pageStockAlert(); break;
      case "stock-ledger": body = pageStockLedger(); break;
      case "stock-move": body = pageStockMove(); break;
      case "stock-check":
        if (state.pddForm) body = pagePddForm();
        else if (state.viewDoc && state.viewDoc.kind === "pdd") body = pagePddView();
        else body = pageStockCheck();
        break;
      case "rpt-center": body = pageReport(); break;
      case "rpt-invsum": body = pageInvSum(); break;
      case "rpt-reconcile": body = pageReconcile(); break;
      default: body = pageHome();
    }
    const showBack = state.route !== "home";

    /* 重建 DOM 前记录焦点与滚动，防搜索/筛选输入时丢焦点、跳回顶部 */
    let focusId = "";
    let selStart = null;
    let selEnd = null;
    let prevScroll = 0;
    try {
      const a = document.activeElement;
      if (a && a.id) {
        focusId = a.id;
        if (typeof a.selectionStart === "number") {
          selStart = a.selectionStart;
          selEnd = a.selectionEnd;
        }
      }
      const c = document.querySelector(".content");
      if (c) prevScroll = c.scrollTop || 0;
    } catch (e) {}

    document.getElementById("app").innerHTML = `
      <div class="app-title">
        <div class="logo">证</div>
        <div class="name">进销存单证实训沙盘 · 文员后台</div>
        <div class="co">${esc(db.company)}</div>
        <button class="theme-toggle" data-act="toggle-theme" title="切换深色/浅色模式" aria-label="切换主题">◐</button>
        <div class="user">登录：<b>${esc(db.user.name)}</b>（${esc(db.user.role)}）　|　账套：2026演示</div>
      </div>
      ${loadError ? `<div class="recover-bar" role="alert">
        <div><b>数据未加载：</b>${esc(loadError)}</div>
        <div class="recover-acts">
          ${corruptRaw ? `<button class="btn btn-sm" data-act="download-corrupt">下载原始数据</button>` : ""}
          <button class="btn btn-sm" data-act="backup-import">导入备份</button>
          <button class="btn btn-sm" data-act="reset-db">重置演示数据</button>
        </div>
      </div>` : ""}
      <div class="menubar">
        ${MENUS.map(
          (m) =>
            `<button class="mi ${menu === m.id ? "on" : ""}" data-menu="${m.id}">${m.label}</button>`
        ).join("")}
      </div>
      <div class="subbar">
        ${sides
          .map(
            (s) =>
              `<button class="sb ${state.route === s.id ? "on" : ""}" data-nav="${s.id}">${s.label}</button>`
          )
          .join("")}
        <span class="sep"></span>
        <button class="sb" data-nav="home">返回工作台</button>
        <span class="home-hint">文员权限：录入 / 查询 / 导出　｜　无财务审核·成本·凭证权限</span>
      </div>
      <div class="shell">
        <aside class="side">
          <div class="side-hd">${esc(MENUS.find((m) => m.id === menu)?.label || "菜单")}</div>
          ${sides
            .map(
              (s) =>
                `<button class="side-item ${state.route === s.id ? "on" : ""}" data-nav="${s.id}">${s.label}</button>`
            )
            .join("")}
          <button class="side-item" data-act="tour-restart">分步教程</button>
          <div class="side-sub">数据安全</div>
          <button class="side-item" data-act="backup-export">导出整库备份</button>
          <button class="side-item" data-act="backup-import">导入整库备份</button>
          <button class="side-item" data-act="open-backup-history">历史备份</button>
          <button class="side-item" data-act="backup-restore">恢复最近备份</button>
          <input id="backup-file" type="file" accept=".json,application/json" hidden />
          <button class="side-item" data-act="reset-db">重置演示数据</button>
        </aside>
        <main class="content">
          <div class="page-hd">
            ${showBack ? `<button class="btn-back" data-nav="home">← 返回</button>` : ""}
            <div>
              <div class="page-title">${esc(pageTitle(state.route))}${state.formDirty && hasOpenForm() ? ' <span class="dirty-badge" title="表单有未保存修改">未保存</span>' : ""}</div>
              <div class="page-crumb">单证实训沙盘 / ${esc(MENUS.find((m) => m.id === menu)?.label || "")} / ${esc(pageTitle(state.route))}</div>
            </div>
          </div>
          ${body}
        </main>
      </div>
      <div class="statusbar">
        <span>操作员：${esc(db.user.name)}</span>
        <span>公司：${esc(db.company)}</span>
        <span>日期：${fmtD(today)}</span>
        <span class="right">快捷键：Ctrl+S 保存草稿 · / 聚焦搜索 · Esc 关弹窗/返回　｜　独立实现 · 非管家婆官方产品，与任我行软件无关联 · 往来单位与单据均为虚构演示 · 数据存本机浏览器</span>
      </div>
      ${tourHtml()}
      ${modalHtml()}
    `;

    /* 首屏骨架已被真实内容替换，移除 booting 标记 */
    try {
      const appEl = document.getElementById("app");
      if (appEl) {
        appEl.classList.remove("booting");
        appEl.removeAttribute("aria-busy");
      }
    } catch (e) {}

    /* 恢复焦点与滚动位置 */
    try {
      if (focusId) {
        const el = document.getElementById(focusId);
        if (el && typeof el.focus === "function") {
          el.focus();
          if (selStart != null && typeof el.setSelectionRange === "function") {
            el.setSelectionRange(selStart, selEnd == null ? selStart : selEnd);
          }
        }
      }
      const c2 = document.querySelector(".content");
      if (c2 && prevScroll) c2.scrollTop = prevScroll;
    } catch (e) {}

    /* 教程高亮：给当前步 target 对应的元素加橙色脉冲框 */
    try {
      const later = (typeof setTimeout === "function") ? setTimeout : (fn) => fn();
      later(() => {
        document.querySelectorAll(".tour-focus").forEach((el) => el.classList.remove("tour-focus"));
        if (!db.tourOn) return;
        const i = Math.min(db.tourStep || 0, TOUR.length - 1);
        const s = TOUR[i];
        if (!s || !s.target) return;
        const el = document.querySelector(s.target);
        if (el) {
          el.classList.add("tour-focus");
          if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "center" });
        }
      }, 0);
    } catch (e) { /* 测试环境无 setTimeout，忽略高亮 */ }
  }

  /* 渲染异常兜底：避免切换页面后白屏且无任何提示 */
  function renderFallback(e) {
    try {
      console.error("[render] 渲染失败", e);
      const app = document.getElementById("app");
      if (!app) return;
      const detail = esc(String((e && (e.stack || e.message)) || e));
      const route = esc(String((state && state.route) || ""));
      app.innerHTML =
        '<div style="margin:24px;padding:20px;border:1px solid #e0a0a0;border-radius:8px;background:#fff5f5;color:#8a2b2b">' +
        '<h3 style="margin:0 0 8px">页面渲染出错</h3>' +
        '<p style="margin:0 0 12px">当前页面：' + route + '　数据未丢失，可返回工作台继续操作。</p>' +
        '<pre style="max-height:240px;overflow:auto;padding:10px;background:#fff;border:1px solid #eecccc;border-radius:6px;font-size:12px;white-space:pre-wrap">' + detail + '</pre>' +
        '<button class="btn" data-nav="home" style="margin-top:12px">返回工作台</button>' +
        '</div>';
    } catch (e2) {
      /* 兜底自身失败时静默，避免二次抛出 */
    }
  }

  /* ---------- 同步表单输入到 state ---------- */
  function bindInputs(root) {
    // 由事件委托处理 click；input/change 单独绑
    root.addEventListener("input", onInput);
    root.addEventListener("change", onInput);
  }

  function onInput(e) {
    const t = e.target;
    const id = t.id;
    const v = t.value;
    if (id === "backup-file") {
      const file = t.files && t.files[0];
      if (typeof t.value === "string") t.value = "";
      importBackupFile(file);
      return;
    }
    /* 编辑表单里的任何输入都记为“未保存”；筛选框（f-*）不算 */
    if (hasOpenForm() && !(id && id.indexOf("f-") === 0)) {
      if (!state.formDirty) markDirtyBadge();
      state.formDirty = true;
    }
    if (id === "f-prodQ") state.f.prodQ = v;
    else if (id === "f-prodCat") state.f.prodCat = v;
    else if (id === "f-supQ") state.f.supQ = v;
    else if (id === "f-cusQ") state.f.cusQ = v;
    else if (id === "f-poQ") state.f.poQ = v;
    else if (id === "f-poStatus") state.f.poStatus = v;
    else if (id === "f-soQ") state.f.soQ = v;
    else if (id === "f-soStatus") state.f.soStatus = v;
    else if (id === "f-stockQ") state.f.stockQ = v;
    else if (id === "f-moveFrom") state.f.moveFrom = v;
    else if (id === "f-moveTo") state.f.moveTo = v;
    else if (id === "f-moveType") state.f.moveType = v;
    else if (id === "f-moveQ") state.f.moveQ = v;
    else if (id === "f-ledFrom") state.f.ledFrom = v;
    else if (id === "f-ledTo") state.f.ledTo = v;
    else if (id === "f-ledQ") state.f.ledQ = v;
    else if (id === "f-rptType") state.f.rptType = v;
    else if (id === "f-rptFrom") state.f.rptFrom = v;
    else if (id === "f-rptTo") state.f.rptTo = v;
    else if (id === "f-xsthQ") state.f.xsthQ = v;
    else if (id === "f-xsthStatus") state.f.xsthStatus = v;
    else if (id === "f-cgthQ") state.f.cgthQ = v;
    else if (id === "f-cgthStatus") state.f.cgthStatus = v;
    else if (id === "f-invFrom") state.f.invFrom = v;
    else if (id === "f-invTo") state.f.invTo = v;
    else if (id === "f-recType") { state.f.recType = v; state.f.recId = ""; if (e.type === "change") render(); return; }
    else if (id === "f-recId") state.f.recId = v;
    // 关键字搜索框：input 事件防抖实时过滤（不影响 change 立即刷新）
    if (e.type === "input" && id && /^f-\w+Q$/.test(id)) {
      debounceRender("fsearch-" + id, 220);
      return;
    }
    // 商品表单
    else if (state.editProduct) {
      const f = state.editProduct;
      if (id === "p-code") f.code = v;
      else if (id === "p-name") f.name = v;
      else if (id === "p-spec") f.spec = v;
      else if (id === "p-unit") f.unit = v;
      else if (id === "p-cat") f.category = v;
      else if (id === "p-min") f.minStock = Number(v) || 0;
      else if (id === "p-cost") f.cost = Number(v) || 0;
      else if (id === "p-price") f.price = Number(v) || 0;
      else if (id === "p-active") f.active = v === "1";
      else return;
    } else if (state.editSupplier) {
      const f = state.editSupplier;
      if (id === "s-code") f.code = v;
      else if (id === "s-name") f.name = v;
      else if (id === "s-contact") f.contact = v;
      else if (id === "s-phone") f.phone = v;
      else if (id === "s-addr") f.addr = v;
      else return;
    } else if (state.editCustomer) {
      const f = state.editCustomer;
      if (id === "c-code") f.code = v;
      else if (id === "c-name") f.name = v;
      else if (id === "c-contact") f.contact = v;
      else if (id === "c-phone") f.phone = v;
      else if (id === "c-addr") f.addr = v;
      else return;
    } else if (state.poForm) {
      const f = state.poForm;
      if (id === "po-sup") f.supplierId = v;
      else if (id === "po-date") f.date = v;
      else if (id === "po-note") f.note = v;
      else if (t.dataset.lineP != null) {
        const i = +t.dataset.lineP;
        f.lines[i].productId = v;
        const p = productById(v);
        if (p && !f.lines[i].price) f.lines[i].price = p.cost;
      } else if (t.dataset.lineQ != null) {
        f.lines[+t.dataset.lineQ].qty = Number(v) || 0;
      } else if (t.dataset.linePr != null) {
        f.lines[+t.dataset.linePr].price = Number(v) || 0;
      } else return;
      // 金额变化需重绘 — 对数量/单价用 blur 再渲，避免输入打断；此处 change 时重绘
      if (e.type === "change") render();
      return;
    } else if (state.soForm) {
      const f = state.soForm;
      if (id === "so-cus") f.customerId = v;
      else if (id === "so-date") f.date = v;
      else if (id === "so-note") f.note = v;
      else if (t.dataset.slineP != null) {
        const i = +t.dataset.slineP;
        f.lines[i].productId = v;
        const p = productById(v);
        if (p && !f.lines[i].price) f.lines[i].price = p.price;
      } else if (t.dataset.slineQ != null) {
        f.lines[+t.dataset.slineQ].qty = Number(v) || 0;
      } else if (t.dataset.slinePr != null) {
        f.lines[+t.dataset.slinePr].price = Number(v) || 0;
      } else return;
      if (e.type === "change") render();
      return;
    } else if (state.xsthForm) {
      const f = state.xsthForm;
      if (id === "xsth-so") {
        f.soId = v;
        const so = db.sales.find((x) => x.id === v);
        if (so) {
          f.customerId = so.customerId;
          f.soNo = so.no;
          f.lines = so.lines.map((l) => ({
            productId: l.productId,
            qty: Math.min(1, maxReturnableSO(so, l.productId, f.id) || 1),
            price: l.price,
          }));
        } else {
          f.soNo = "";
          f.lines = [{ productId: "", qty: 1, price: 0 }];
        }
      } else if (id === "xsth-cus") f.customerId = v;
      else if (id === "xsth-date") f.date = v;
      else if (id === "xsth-note") f.note = v;
      else if (t.dataset.xlineP != null) {
        const i = +t.dataset.xlineP;
        f.lines[i].productId = v;
        const p = productById(v);
        if (p && !f.lines[i].price) f.lines[i].price = p.price;
      } else if (t.dataset.xlineQ != null) {
        f.lines[+t.dataset.xlineQ].qty = Number(v) || 0;
      } else if (t.dataset.xlinePr != null) {
        f.lines[+t.dataset.xlinePr].price = Number(v) || 0;
      } else return;
      if (e.type === "change") render();
      return;
    } else if (state.cgthForm) {
      const f = state.cgthForm;
      if (id === "cgth-po") {
        f.poId = v;
        const po = db.purchases.find((x) => x.id === v);
        if (po) {
          f.supplierId = po.supplierId;
          f.poNo = po.no;
          f.lines = po.lines.map((l) => ({
            productId: l.productId,
            qty: Math.min(1, maxReturnablePO(po, l.productId, f.id) || 1),
            price: l.price,
          }));
        } else {
          f.poNo = "";
          f.lines = [{ productId: "", qty: 1, price: 0 }];
        }
      } else if (id === "cgth-sup") f.supplierId = v;
      else if (id === "cgth-date") f.date = v;
      else if (id === "cgth-note") f.note = v;
      else if (t.dataset.clineP != null) {
        const i = +t.dataset.clineP;
        f.lines[i].productId = v;
        const p = productById(v);
        if (p && !f.lines[i].price) f.lines[i].price = p.cost;
      } else if (t.dataset.clineQ != null) {
        f.lines[+t.dataset.clineQ].qty = Number(v) || 0;
      } else if (t.dataset.clinePr != null) {
        f.lines[+t.dataset.clinePr].price = Number(v) || 0;
      } else return;
      if (e.type === "change") render();
      return;
    } else if (state.pddForm) {
      const f = state.pddForm;
      if (id === "pdd-date") f.date = v;
      else if (id === "pdd-wh") f.warehouse = v;
      else if (id === "pdd-note") f.note = v;
      else if (t.dataset.plineP != null) {
        const i = +t.dataset.plineP;
        f.lines[i].productId = v;
        const p = productById(v);
        if (p) f.lines[i].realQty = db.stock[p.id] || 0;
      } else if (t.dataset.plineQ != null) {
        f.lines[+t.dataset.plineQ].realQty = Number(v) || 0;
      } else return;
      if (e.type === "change") render();
      return;
    } else {
      return;
    }
    // 筛选类 change 时重绘
    if (e.type === "change" && id && id.startsWith("f-")) render();
  }

  /* ---------- 事件 ---------- */
  function rangeOk(fromKey, toKey) {
    const a = state.f[fromKey], b = state.f[toKey];
    if (a && b && a > b) {
      alertBox("warn", "日期区间不正确", "开始日期不能晚于结束日期。", "请调整后再查询，避免把账目看漏。");
      return false;
    }
    return true;
  }

  function onClick(e) {
    const menuBtn = e.target.closest("[data-menu]");
    if (menuBtn) {
      const id = menuBtn.dataset.menu;
      const first = (SIDE[id] || [{ id: id }])[0];
      go(first.id);
      return;
    }
    const nav = e.target.closest("[data-nav]");
    if (nav) {
      go(nav.dataset.nav);
      return;
    }
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act;
    const id = el.dataset.id;

    switch (act) {
      case "toggle-theme": toggleTheme(); break;
      case "close-modal":
      case "close-modal-bg":
        if (act === "close-modal-bg" && e.target !== el) break;
        closeModal();
        break;
      case "pg": {
        const key = id;
        const p = Number(el.dataset.p) || 0;
        if (key && p > 0) {
          state.f[key + "Page"] = p;
          render();
        }
        break;
      }
      case "tour-next": tourNext(); break;
      case "tour-prev": tourPrev(); break;
      case "tour-close": tourClose(); break;
      case "tour-mini":
        db.tourMini = !db.tourMini;
        save();
        render();
        break;
      case "tour-restart": tourRestart(); break;
      case "reset-db": {
        const ok = confirm(
          "确定重置全部演示数据？\n\n" +
          "将清空你在本机的全部操作（单据、退货、盘点、日志、导出标记），\n" +
          "并恢复含「一笔退货、一笔盘点」的初始种子数据。\n" +
          "此操作不可撤销，建议先导出需要的报表。"
        );
        if (ok) {
          if (!snapshotCurrent("重置前自动快照")) {
            alertBox("warn", "无法创建自动快照", "本地存储空间可能已满，已取消重置。", "请先「导出整库备份」或清理浏览器存储。");
            break;
          }
          const prevDb = db, prevLoadError = loadError;
          db = seed();
          loadError = null;
          corruptRaw = "";
          logAction("重置演示数据", "恢复初始种子（含退货/盘点样例）");
          let saved = false;
          try { saved = save({ force: true }); } catch (e) { saved = false; }
          if (!saved) {
            db = prevDb;
            loadError = prevLoadError;
            alertBox("err", "重置失败，已回滚", "写入本地存储失败，当前账套没有变化。", "请先导出备份，再清理浏览器空间。");
            return;
          }
          state.route = "home";
          state.poForm = state.soForm = state.xsthForm = state.cgthForm = state.pddForm = state.editProduct = state.viewDoc = null;
          render();
          alertBox("ok", "已重置", "演示数据已恢复初始状态（含一笔销售退货、一笔采购退货、一笔盘点）。", "本机操作已清空，重置前已自动快照。");
        }
        break;
      }
      // 商品
      case "prod-search": render(); break;
      case "prod-reset": state.f.prodQ = ""; state.f.prodCat = ""; render(); break;
      case "new-product": openNewProduct(); break;
      case "edit-product": openEditProduct(id); break;
      case "cancel-product":
        if (!confirmLeaveForm()) break;
        state.formDirty = false;
        state.editProduct = null;
        render();
        break;
      case "save-product": saveProduct(); break;
      case "toggle-product": {
        const p = db.products.find((x) => x.id === id);
        if (!p) break;
        p.active = !p.active;
        save();
        render();
        break;
      }
      case "perm-cost":
        noPermission("修改商品成本结转价 / 批量调价");
        break;

      // 供应商客户
      case "sup-search": render(); break;
      case "sup-reset": state.f.supQ = ""; render(); break;
      case "new-supplier": openNewSupplier(); break;
      case "edit-supplier": openEditSupplier(id); break;
      case "cancel-supplier":
        if (!confirmLeaveForm()) break;
        state.formDirty = false;
        state.editSupplier = null;
        render();
        break;
      case "save-supplier": saveSupplier(); break;
      case "cus-search": render(); break;
      case "cus-reset": state.f.cusQ = ""; render(); break;
      case "new-customer": openNewCustomer(); break;
      case "edit-customer": openEditCustomer(id); break;
      case "cancel-customer":
        if (!confirmLeaveForm()) break;
        state.formDirty = false;
        state.editCustomer = null;
        render();
        break;
      case "save-customer": saveCustomer(); break;

      // 采购
      case "po-search": state.f.poPage = 1; render(); break;
      case "po-reset": state.f.poQ = ""; state.f.poStatus = ""; state.f.poPage = 1; render(); break;
      case "new-po": state.route = "purchase-list"; openNewPO(); break;
      case "view-po": openViewPO(id); break;
      case "edit-po": editPO(id); break;
      case "cancel-po":
        if (!confirmLeaveForm()) break;
        state.formDirty = false;
        state.poForm = null;
        render();
        break;
      case "save-po-draft": syncPOLines(); savePO("draft"); break;
      case "save-po-submit": syncPOLines(); savePO("submit"); break;
      case "po-add-line":
        state.poForm.lines.push({ productId: "", qty: 1, price: 0 });
        render();
        break;
      case "po-del-line":
        state.poForm.lines.splice(+el.dataset.i, 1);
        if (!state.poForm.lines.length) state.poForm.lines.push({ productId: "", qty: 1, price: 0 });
        render();
        break;
      case "po-export": {
        const st = state.f.poStatus;
        const q = state.f.poQ.trim().toLowerCase();
        const list = db.purchases.filter((d) => {
          if (st && d.status !== st) return false;
          if (q && !(d.no.toLowerCase().includes(q) || supplierName(d.supplierId).toLowerCase().includes(q)))
            return false;
          return true;
        });
        const rows = list.map((d) => [
          d.no, supplierName(d.supplierId), d.date,
          d.lines.reduce((s, l) => s + l.qty, 0),
          money(lineAmount(d.lines)), d.status, d.createdBy,
        ]);
        exportCSV("采购单列表.csv", ["单号", "供应商", "日期", "数量", "金额", "状态", "制单人"], rows);
        break;
      }
      case "audit-po": auditPO(id); break;
      case "receive-po": receivePO(id); break;
      case "audit-so": auditSO(id); break;
      case "ship-so": shipSO(id); break;
      case "delete-doc": deleteDoc(el.dataset.kind, id); break;
      case "void-doc": voidDoc(el.dataset.kind, id); break;
      case "red-flush": redFlush(el.dataset.kind, id); break;
      case "backup-export": exportBackup(); break;
      case "backup-import": {
        const input = document.getElementById("backup-file");
        if (input) input.click();
        break;
      }
      case "backup-restore": restoreLatestSnapshot(); break;
      case "open-backup-history": go("backup-history"); break;
      case "restore-snapshot": restoreSnapshotById(id); break;
      case "download-corrupt": {
        if (!corruptRaw) { alertBox("warn", "没有原始数据", "当前没有可下载的损坏数据。", ""); break; }
        const blob = new Blob([corruptRaw], { type: "application/json;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "文员ERP_损坏账套_" + fmtD(today) + ".json";
        a.click();
        URL.revokeObjectURL(a.href);
        break;
      }
      case "perm-approve":
        noPermission("审核采购/销售单据、单据生效、红冲单据");
        break;

      // 销售
      case "so-search": state.f.soPage = 1; render(); break;
      case "so-reset": state.f.soQ = ""; state.f.soStatus = ""; state.f.soPage = 1; render(); break;
      case "new-so": state.route = "sales-list"; openNewSO(); break;
      case "view-so": openViewSO(id); break;
      case "edit-so": editSO(id); break;
      case "cancel-so":
        if (!confirmLeaveForm()) break;
        state.formDirty = false;
        state.soForm = null;
        render();
        break;
      case "save-so-draft": syncSOLines(); saveSO("draft"); break;
      case "save-so-submit": syncSOLines(); saveSO("submit"); break;
      case "so-add-line":
        state.soForm.lines.push({ productId: "", qty: 1, price: 0 });
        render();
        break;
      case "so-del-line":
        state.soForm.lines.splice(+el.dataset.i, 1);
        if (!state.soForm.lines.length) state.soForm.lines.push({ productId: "", qty: 1, price: 0 });
        render();
        break;
      case "so-export": {
        // 与销售列表筛选一致
        const st = state.f.soStatus;
        const q = state.f.soQ.trim().toLowerCase();
        const list = db.sales.filter((d) => {
          if (st && d.status !== st) return false;
          if (q && !(d.no.toLowerCase().includes(q) || customerName(d.customerId).toLowerCase().includes(q)))
            return false;
          return true;
        });
        const rows = [];
        list.forEach((so) => {
          so.lines.forEach((l) => {
            const p = productById(l.productId);
            rows.push([
              so.date, so.no, customerName(so.customerId),
              p ? p.code : l.productId, p ? p.name : "",
              l.qty, money(l.price), money(round2(l.qty * l.price)), so.status,
            ]);
          });
        });
        exportCSV("销售明细_" + fmtD(today) + ".csv",
          ["日期", "单号", "客户", "商品编码", "品名", "数量", "单价", "金额", "状态"], rows);
        break;
      }
      case "perm-writeoff":
        noPermission("收款核销 / 应收应付核销");
        break;

      // 库存
      case "stock-search": render(); break;
      case "stock-reset": state.f.stockQ = ""; render(); break;
      case "stock-export": exportStockReport(); break;
      case "move-search": if (!rangeOk("moveFrom", "moveTo")) break; render(); break;
      case "move-reset":
        state.f.moveFrom = daysAgo(30);
        state.f.moveTo = fmtD(today);
        state.f.moveType = "";
        state.f.moveQ = "";
        render();
        break;
      case "move-export": exportMove(); break;
      case "led-search": if (!rangeOk("ledFrom", "ledTo")) break; render(); break;
      case "led-reset":
        state.f.ledFrom = daysAgo(30);
        state.f.ledTo = fmtD(today);
        state.f.ledQ = "";
        render();
        break;
      case "led-export": {
        const rows = filteredLedger().map((m) => [
          m.date, m.type, m.productCode, m.productName, m.unit,
          m.qty > 0 ? m.qty : "", m.qty < 0 ? -m.qty : "",
          m.refNo, m.operator,
        ]);
        exportCSV("库存台账_" + state.f.ledFrom + "_" + state.f.ledTo + ".csv",
          ["日期", "类型", "编码", "品名", "单位", "收入(+)", "发出(-)", "来源单据", "操作人"], rows);
        break;
      }
      case "perm-adjust":
        noPermission("直接调整库存数量 / 库存改写");
        break;
      case "perm-stocktake":
        noPermission("录入/审核库存盘点单");
        break;

      // 报表
      case "rpt-preview": render(); break;
      case "rpt-reset":
        state.f.rptType = "stock";
        state.f.rptFrom = daysAgo(30);
        state.f.rptTo = fmtD(today);
        render();
        break;
      case "rpt-export": {
        if (state.f.rptType === "stock") exportStockReport();
        else if (state.f.rptType === "sales") exportSalesDetail();
        else exportPurchaseDetail();
        break;
      }
      case "perm-edit-report":
        noPermission("修改报表原始数据");
        break;

      case "close-view":
        state.viewDoc = null;
        render();
        break;

      case "print-doc":
        printDoc();
        break;

      /* 销售退货 */
      case "xsth-search": state.f.xsthPage = 1; render(); break;
      case "xsth-reset": state.f.xsthQ = ""; state.f.xsthStatus = ""; state.f.xsthPage = 1; render(); break;
      case "new-xsth":
        state.route = "sales-return";
        state.formDirty = false;
        state.xsthForm = {
          id: null, no: peekXsthNo(), date: fmtD(today),
          customerId: "", soId: "", soNo: "",
          lines: [{ productId: "", qty: 1, price: 0 }],
          note: "",
        };
        render();
        break;
      case "view-xsth": {
        const d = (db.salesReturns || []).find((x) => x.id === id);
        if (d) { state.viewDoc = { kind: "xsth", doc: JSON.parse(JSON.stringify(d)) }; render(); }
        break;
      }
      case "edit-xsth": {
        const d = (db.salesReturns || []).find((x) => x.id === id);
        if (!d) break;
        if (d.status !== "草稿") { alertBox("warn", "系统提示", "该退货单不是草稿，文员不可编辑。", "单号：" + d.no + "　状态：" + d.status); break; }
        state.formDirty = false;
        state.xsthForm = JSON.parse(JSON.stringify(d));
        state.viewDoc = null;
        state.route = "sales-return";
        render();
        break;
      }
      case "cancel-xsth":
        if (!confirmLeaveForm()) break;
        state.formDirty = false;
        state.xsthForm = null;
        render();
        break;
      case "xsth-add-line":
        state.xsthForm.lines.push({ productId: "", qty: 1, price: 0 });
        render();
        break;
      case "xsth-del-line":
        state.xsthForm.lines.splice(+el.dataset.i, 1);
        if (!state.xsthForm.lines.length) state.xsthForm.lines.push({ productId: "", qty: 1, price: 0 });
        render();
        break;
      case "save-xsth-draft": syncXsthLines(); saveXsth("draft"); break;
      case "save-xsth-submit": syncXsthLines(); saveXsth("submit"); break;
      case "submit-xsth": submitXsth(id); break;
      case "confirm-xsth": confirmXsth(id); break;
      case "xsth-export": exportXsth(); break;

      /* 采购退货 */
      case "cgth-search": state.f.cgthPage = 1; render(); break;
      case "cgth-reset": state.f.cgthQ = ""; state.f.cgthStatus = ""; state.f.cgthPage = 1; render(); break;
      case "new-cgth":
        state.route = "purchase-return";
        state.formDirty = false;
        state.cgthForm = {
          id: null, no: peekCgthNo(), date: fmtD(today),
          supplierId: "", poId: "", poNo: "",
          lines: [{ productId: "", qty: 1, price: 0 }],
          note: "",
        };
        render();
        break;
      case "view-cgth": {
        const d = (db.purchaseReturns || []).find((x) => x.id === id);
        if (d) { state.viewDoc = { kind: "cgth", doc: JSON.parse(JSON.stringify(d)) }; render(); }
        break;
      }
      case "edit-cgth": {
        const d = (db.purchaseReturns || []).find((x) => x.id === id);
        if (!d) break;
        if (d.status !== "草稿") { alertBox("warn", "系统提示", "该退货单不是草稿，文员不可编辑。", "单号：" + d.no + "　状态：" + d.status); break; }
        state.formDirty = false;
        state.cgthForm = JSON.parse(JSON.stringify(d));
        state.viewDoc = null;
        state.route = "purchase-return";
        render();
        break;
      }
      case "cancel-cgth":
        if (!confirmLeaveForm()) break;
        state.formDirty = false;
        state.cgthForm = null;
        render();
        break;
      case "cgth-add-line":
        state.cgthForm.lines.push({ productId: "", qty: 1, price: 0 });
        render();
        break;
      case "cgth-del-line":
        state.cgthForm.lines.splice(+el.dataset.i, 1);
        if (!state.cgthForm.lines.length) state.cgthForm.lines.push({ productId: "", qty: 1, price: 0 });
        render();
        break;
      case "save-cgth-draft": syncCgthLines(); saveCgth("draft"); break;
      case "save-cgth-submit": syncCgthLines(); saveCgth("submit"); break;
      case "submit-cgth": submitCgth(id); break;
      case "confirm-cgth": confirmCgth(id); break;
      case "cgth-export": exportCgth(); break;

      /* 盘点 */
      case "new-pdd":
        state.route = "stock-check";
        state.formDirty = false;
        state.pddForm = {
          id: null, no: peekPddNo(), date: fmtD(today), warehouse: "主仓",
          lines: [{ productId: "", realQty: 0 }],
          note: "",
        };
        render();
        break;
      case "view-pdd": {
        const d = (db.stockChecks || []).find((x) => x.id === id);
        if (d) { state.viewDoc = { kind: "pdd", doc: JSON.parse(JSON.stringify(d)) }; render(); }
        break;
      }
      case "edit-pdd": {
        const d = (db.stockChecks || []).find((x) => x.id === id);
        if (!d) break;
        if (d.status !== "草稿") { alertBox("warn", "系统提示", "该盘点单不是草稿，文员不可编辑。", "单号：" + d.no); break; }
        state.pddForm = JSON.parse(JSON.stringify(d));
        state.viewDoc = null;
        state.route = "stock-check";
        render();
        break;
      }
      case "cancel-pdd":
        if (!confirmLeaveForm()) break;
        state.formDirty = false;
        state.pddForm = null;
        render();
        break;
      case "pdd-add-line":
        state.pddForm.lines.push({ productId: "", realQty: 0 });
        render();
        break;
      case "pdd-del-line":
        state.pddForm.lines.splice(+el.dataset.i, 1);
        if (!state.pddForm.lines.length) state.pddForm.lines.push({ productId: "", realQty: 0 });
        render();
        break;
      case "save-pdd-draft": syncPddLines(); savePdd("draft"); break;
      case "save-pdd-submit": syncPddLines(); savePdd("submit"); break;
      case "submit-pdd": submitPdd(id); break;
      case "confirm-pdd": confirmPdd(id); break;

      /* 进销存汇总 / 对账 */
      case "invsum-search": if (!rangeOk("invFrom", "invTo")) break; render(); break;
      case "invsum-reset":
        state.f.invFrom = daysAgo(30);
        state.f.invTo = fmtD(today);
        render();
        break;
      case "invsum-export": exportInvSum(); break;
      case "rec-search": render(); break;
      case "rec-reset":
        state.f.recType = "supplier";
        state.f.recId = "";
        render();
        break;
      case "rec-export": exportReconcile(); break;

      /* 任务 / 日志 */
      case "close-task-guide":
        db.taskGuideClosed = true;
        save();
        render();
        break;
      case "open-task-guide":
        db.taskGuideClosed = false;
        save();
        render();
        break;

      case "perm-stocktake-edit":
        noPermission("直接改写库存 / 盘点差异入账（请用模拟仓管确认演示）");
        break;
    }

    /* 教程自动推进：用户真点了当前步 expect 的按钮，就自动进下一步 */
    if (db.tourOn && act && !act.startsWith("tour-")) {
      const i = Math.min(db.tourStep || 0, TOUR.length - 1);
      const s = TOUR[i];
      if (s && s.expect && act === s.expect) {
        tourNext();
      }
    }
  }

  function syncPOLines() {
    // 从 DOM 再抓一遍，防止 input 未触发 change
    const f = state.poForm;
    if (!f) return;
    document.querySelectorAll("[data-line-p]").forEach((sel) => {
      f.lines[+sel.dataset.lineP].productId = sel.value;
    });
    document.querySelectorAll("[data-line-q]").forEach((inp) => {
      f.lines[+inp.dataset.lineQ].qty = Number(inp.value) || 0;
    });
    document.querySelectorAll("[data-line-pr]").forEach((inp) => {
      f.lines[+inp.dataset.linePr].price = Number(inp.value) || 0;
    });
  }

  function syncSOLines() {
    const f = state.soForm;
    if (!f) return;
    document.querySelectorAll("[data-sline-p]").forEach((sel) => {
      f.lines[+sel.dataset.slineP].productId = sel.value;
    });
    document.querySelectorAll("[data-sline-q]").forEach((inp) => {
      f.lines[+inp.dataset.slineQ].qty = Number(inp.value) || 0;
    });
    document.querySelectorAll("[data-sline-pr]").forEach((inp) => {
      f.lines[+inp.dataset.slinePr].price = Number(inp.value) || 0;
    });
  }

  /* ---------- 启动 ---------- */
  function boot() {
    let app = document.getElementById("app");
    if (!app) {
      app = document.createElement("div");
      app.id = "app";
      document.body.appendChild(app);
    }
    app.addEventListener("click", onClick);
    bindInputs(app);

    document.addEventListener("keydown", function (e) {
      const tag = (e.target && e.target.tagName) || "";
      const inField = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        if (state.poForm) { syncPOLines(); savePO("draft"); return; }
        if (state.soForm) { syncSOLines(); saveSO("draft"); return; }
        if (state.xsthForm) { syncXsthLines(); saveXsth("draft"); return; }
        if (state.cgthForm) { syncCgthLines(); saveCgth("draft"); return; }
        if (state.pddForm) { syncPddLines(); savePdd("draft"); return; }
        alertBox("info", "快捷键 Ctrl+S", "当前没有可保存的表单。", "请先打开采购/销售/退货/盘点单据的编辑页。");
        return;
      }
      /* 按 / 聚焦当前页第一个筛选框，像表格软件一样快速检索 */
      if (e.key === "/" && !inField && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const box = document.querySelector('.content input[id^="f-"]:not([type="date"])');
        if (box) {
          e.preventDefault();
          box.focus();
          if (typeof box.select === "function") box.select();
          return;
        }
      }
      if (e.key === "Escape") {
        if (modal.show) { closeModal(); return; }
        if (state.viewDoc) { state.viewDoc = null; render(); return; }
        if (hasOpenForm()) {
          if (!confirmLeaveForm()) return;
          state.formDirty = false;
        }
        if (state.poForm) { state.poForm = null; render(); return; }
        if (state.soForm) { state.soForm = null; render(); return; }
        if (state.xsthForm) { state.xsthForm = null; render(); return; }
        if (state.cgthForm) { state.cgthForm = null; render(); return; }
        if (state.pddForm) { state.pddForm = null; render(); return; }
        if (state.editProduct || state.editSupplier || state.editCustomer) {
          state.editProduct = state.editSupplier = state.editCustomer = null;
          render();
          return;
        }
        if (inField) e.target.blur();
      }
    });

    if (db.tourOn && TOUR[db.tourStep || 0]) {
      state.route = TOUR[db.tourStep || 0].route;
    }
    /* 刷新/关页前提醒：有未保存表单时让浏览器弹确认 */
    try {
      if (window && typeof window.addEventListener === "function") {
        window.addEventListener("beforeunload", function (e) {
          if (state.formDirty && hasOpenForm()) {
            e.preventDefault();
            e.returnValue = "";
          }
        });
        const dayTick = () => { if (refreshToday()) render(); };
        window.addEventListener("focus", dayTick);
        if (document.addEventListener) {
          document.addEventListener("visibilitychange", () => {
            if (!document.hidden) dayTick();
          });
        }
      }
    } catch (e) {}
    applyTheme();
    render();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
