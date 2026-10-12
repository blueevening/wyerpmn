/* 管家婆辉煌版ERP · 文员实训模拟 */
(function () {
  "use strict";

  const KEY = "gjp-erp-clerk-v1";
  const today = new Date();
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

  /* CSV 单元格：含逗号/引号/换行时加引号 */
  function csvCell(v) {
    const s = String(v == null ? "" : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function daysAgo(n) {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return fmtD(d);
  }

  /* ---------- 种子数据：广西老街坊商贸 ---------- */
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
        { productId: "P001", qty: 60, price: 8.5 },
        { productId: "P002", qty: 40, price: 15.0 },
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
        { productId: "P007", qty: 24, price: 18.0 },
        { productId: "P008", qty: 80, price: 3.5 },
        { productId: "P009", qty: 30, price: 7.2 },
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
        { productId: "P001", qty: 20, price: 12.8 },
        { productId: "P005", qty: 12, price: 13.5 },
        { productId: "P006", qty: 30, price: 2.5 },
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
        { productId: "P003", qty: 10, price: 15.5 },
        { productId: "P011", qty: 8, price: 18.0 },
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

    return {
      v: 1,
      products,
      suppliers,
      customers,
      stock,
      purchases: [po1, po2, po3],
      sales: [so1, so2, so3],
      moves,
      counters: { po: 3, so: 3 },
      user: { name: "文员小陈", role: "商务文员" },
      company: "广西老街坊商贸有限公司",
      tourOn: true,
      tourStep: 0,
      tourDone: false,
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.v === 1) return d;
      }
    } catch (e) {}
    const d = seed();
    localStorage.setItem(KEY, JSON.stringify(d));
    return d;
  }

  let db = load();
  function save() {
    localStorage.setItem(KEY, JSON.stringify(db));
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
    },
    // 编辑态
    editProduct: null,
    editSupplier: null,
    editCustomer: null,
    poForm: null,
    soForm: null,
    viewDoc: null, // {kind, doc}
    selectedId: null,
  };

  /* ---------- 弹窗 ---------- */
  const modal = {
    show: false,
    type: "info", // info|ok|err|warn
    title: "",
    text: "",
    extra: "",
  };

  function alertBox(type, title, text, extra) {
    modal.show = true;
    modal.type = type;
    modal.title = title;
    modal.text = text || "";
    modal.extra = extra || "";
    render();
  }

  function closeModal() {
    modal.show = false;
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
    const src = form.kind === "so"
      ? db.sales.find((x) => x.id === form.id)
      : db.purchases.find((x) => x.id === form.id);
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
  const TOUR = [
    { route: "home", title: "欢迎使用管家婆辉煌版", text: "你是「商务文员」账号。左侧与上方是导航；二级页面都有「返回」。点右下角「下一步」跟着练。" },
    { route: "base-products", title: "① 基础资料·商品档案", text: "点「新增商品」，填写品名「原味花生」、单位「包」、分类「农副食品」。保存后点「返回工作台」。" },
    { route: "purchase-list", title: "② 采购管理", text: "可查看采购单。点「新增采购订单」只能保存为草稿或提交待审核——你不能审核，财务才能审。" },
    { route: "sales-list", title: "③ 销售管理", text: "点「新增销售订单」，选客户、选商品、填数量。状态有：草稿/待审核/待出库/部分出库/已出库。" },
    { route: "stock-query", title: "④ 库存查询", text: "实时库存可按品名/SKU筛选。库存预警里低于最低库存的会标红。你不能直接改库存。" },
    { route: "stock-move", title: "⑤ 出入库流水", text: "按日期筛选台账流水，核对单据与数量。支持导出。" },
    { route: "rpt-center", title: "⑥ 报表中心", text: "选报表类型和起止日期，点「预览」再「导出Excel」。只能看和导，不能改原始数据。" },
    { route: "home", title: "⑦ 练习完成", text: "可对照练习指令：新增商品→建销售草稿单→查库存预警→导出报表。试试超出权限的操作会弹什么提示。" },
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
    state.route = s.route;
    db.tourOn = true;
    save();
    render();
  }

  function tourPrev() {
    db.tourStep = Math.max(0, (db.tourStep || 0) - 1);
    const s = TOUR[db.tourStep];
    state.route = s.route;
    save();
    render();
  }

  function tourClose() {
    db.tourOn = false;
    save();
    render();
  }

  function tourRestart() {
    db.tourOn = true;
    db.tourStep = 0;
    db.tourDone = false;
    db.tourMini = false;
    state.route = TOUR[0].route;
    save();
    render();
  }

  /* ---------- 导航 ---------- */
  function go(route) {
    state.route = route;
    state.editProduct = null;
    state.editSupplier = null;
    state.editCustomer = null;
    state.poForm = null;
    state.soForm = null;
    state.viewDoc = null;
    state.selectedId = null;
    render();
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
    home: [{ id: "home", label: "我的工作台" }],
    base: [
      { id: "base-products", label: "商品档案" },
      { id: "base-suppliers", label: "供应商资料" },
      { id: "base-customers", label: "客户资料" },
    ],
    purchase: [
      { id: "purchase-list", label: "采购订单" },
      { id: "purchase-in", label: "采购入库单" },
    ],
    sales: [
      { id: "sales-list", label: "销售订单" },
      { id: "sales-out", label: "销售出库单" },
    ],
    stock: [
      { id: "stock-query", label: "实时库存" },
      { id: "stock-alert", label: "库存预警" },
      { id: "stock-ledger", label: "库存台账" },
      { id: "stock-move", label: "出入库流水" },
      { id: "stock-check", label: "盘点单查看" },
    ],
    rpt: [
      { id: "rpt-center", label: "业务报表" },
    ],
  };

  function menuOf(route) {
    if (route === "home") return "home";
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
      "base-products": "商品档案",
      "base-suppliers": "供应商资料",
      "base-customers": "客户资料",
      "purchase-list": "采购订单",
      "purchase-in": "采购入库单",
      "sales-list": "销售订单",
      "sales-out": "销售出库单",
      "stock-query": "实时库存查询",
      "stock-alert": "库存预警",
      "stock-ledger": "库存台账",
      "stock-move": "出入库流水查询",
      "stock-check": "库存盘点单（只读）",
      "rpt-center": "业务报表中心",
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
    if (st === "已入库" || st === "已出库") return "st-executed";
    if (st === "部分出库") return "st-partial";
    if (st === "已作废") return "st-cancelled";
    return "st-draft";
  }

  /* ---------- 商品 CRUD ---------- */
  function openNewProduct() {
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
    state.editProduct = null;
    save();
    render();
    alertBox("ok", "保存成功", "商品档案已保存。", f.id ? "已更新：" + name : "新增：" + name + "（" + code + "）");
  }

  /* ---------- 供应商 / 客户 ---------- */
  function openNewSupplier() {
    state.editSupplier = {
      id: null, code: nextSeqCode("GYS", db.suppliers),
      name: "", contact: "", phone: "", addr: "", active: true,
    };
    render();
  }
  function openEditSupplier(id) {
    const s = db.suppliers.find((x) => x.id === id);
    if (!s) return;
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
    state.editSupplier = null;
    save();
    render();
    alertBox("ok", "保存成功", "供应商资料已保存。", name);
  }

  function openNewCustomer() {
    state.editCustomer = {
      id: null, code: nextSeqCode("KH", db.customers),
      name: "", contact: "", phone: "", addr: "", active: true,
    };
    render();
  }
  function openEditCustomer(id) {
    const c = db.customers.find((x) => x.id === id);
    if (!c) return;
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
    state.editCustomer = null;
    save();
    render();
    alertBox("ok", "保存成功", "客户资料已保存。", name);
  }

  /* ---------- 采购单 ---------- */
  function openNewPO() {
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
    state.poForm = null;
    save();
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
    state.soForm = null;
    save();
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
          您不能：财务审核、成本结转、凭证记账、红冲单据、收付款核销、直接调整库存。</p>
        </div>
        <div class="perm">权限说明<br/>账号类型：商务文员（基础业务）<br/>财务审核：无权限<br/>成本/凭证：无权限<br/>库存调整：无权限</div>
      </div>

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
                ${["草稿", "待审核", "已入库", "已作废"]
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
        <div class="box-hd">${esc(title)} <span class="sub">共 ${list.length} 张</span></div>
        <div class="box-bd">
          <div class="btn-row" style="margin-bottom:8px">
            <button class="btn btn-primary" data-act="new-po">新增采购订单</button>
            <button class="btn" data-act="po-export">导出列表</button>
            <button class="btn" data-act="perm-approve">财务审核</button>
            <span class="locked">提交后需财务审核才能入库生效；文员不能审核/红冲</span>
          </div>
          <div class="tbl-wrap">
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
                          <td class="btn-row">
                            <button class="link" data-act="view-po" data-id="${esc(d.id)}">查看</button>
                            ${d.status === "草稿" ? `<button class="link" data-act="edit-po" data-id="${esc(d.id)}">编辑</button>` : ""}
                          </td>
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
            <div class="total-line">合计金额：<b>¥${money(amt)}</b></div>
          </div>
        </div>
        <div class="box-ft">
          <button class="btn" data-act="cancel-po">返回列表</button>
          <button class="btn" data-act="save-po-draft">保存草稿</button>
          <button class="btn btn-primary" data-act="save-po-submit">保存并提交审核</button>
        </div>
      </div>
    `;
  }

  function pagePOView() {
    const d = state.viewDoc.doc;
    const qty = d.lines.reduce((s, l) => s + l.qty, 0);
    return `
      <div class="box">
        <div class="box-hd">采购单据详情（只读） <span class="st ${statusClass(d.status)}">${esc(d.status)}</span></div>
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
          <div style="margin-top:12px"><b>操作时间线</b>
            <ul style="margin:8px 0 0 18px;line-height:1.8">
              ${(d.timeline || [])
                .map((t) => `<li>${esc(t.act)}　<span style="color:var(--ink4)">${esc(t.who)}　${fmtDT(t.at)}</span></li>`)
                .join("")}
            </ul>
          </div>
          ${
            d.status === "待审核"
              ? `<div style="margin-top:12px;padding:8px;background:#fff8e6;border:1px solid #e0c36a;font-size:12px">
                  待财务审核。你可以点下面「模拟财务审核」看看无权限提示（文员真实环境不能审核）。
                </div>`
              : ""
          }
        </div>
        <div class="box-ft">
          <button class="btn" data-act="close-view">返回列表</button>
          ${d.status === "草稿" ? `<button class="btn btn-primary" data-act="edit-po" data-id="${esc(d.id)}">编辑草稿</button>` : ""}
          <button class="btn" data-act="perm-approve">模拟财务审核</button>
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
                ${["草稿", "待审核", "待出库", "部分出库", "已出库"]
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
        <div class="box-hd">${esc(title)} <span class="sub">共 ${list.length} 张</span></div>
        <div class="box-bd">
          <div class="btn-row" style="margin-bottom:8px">
            <button class="btn btn-primary" data-act="new-so">新增销售订单</button>
            <button class="btn" data-act="so-export">导出销售明细</button>
            <button class="btn" data-act="perm-approve">财务审核</button>
            <span class="locked">状态：草稿→待审核→待出库→部分出库/已出库；文员不能审核、不能核销收款</span>
          </div>
          <div class="tbl-wrap">
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
                          <td class="btn-row">
                            <button class="link" data-act="view-so" data-id="${esc(d.id)}">查看</button>
                            ${d.status === "草稿" ? `<button class="link" data-act="edit-so" data-id="${esc(d.id)}">编辑</button>` : ""}
                          </td>
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
                      const stock = l.productId ? db.stock[l.productId] || 0 : "—";
                      return `<tr>
                      <td>
                        <select data-sline-p="${i}">
                          <option value="">选择商品</option>
                          ${productOptions(l.productId, true)}
                        </select>
                      </td>
                      <td><input type="number" min="1" class="num" data-sline-q="${i}" value="${l.qty}" /></td>
                      <td><input type="number" min="0" step="0.01" class="num" data-sline-pr="${i}" value="${l.price}" /></td>
                      <td class="right num">${stock}</td>
                      <td class="right num">¥${money(round2(l.qty * l.price))}</td>
                      <td><button class="link danger" data-act="so-del-line" data-i="${i}">删</button></td>
                    </tr>`;
                    })
                    .join("")}
                </tbody>
              </table>
            </div>
            <div class="total-line">合计金额：<b>¥${money(lineAmount(f.lines))}</b></div>
          </div>
        </div>
        <div class="box-ft">
          <button class="btn" data-act="cancel-so">返回列表</button>
          <button class="btn" data-act="save-so-draft">保存草稿</button>
          <button class="btn btn-primary" data-act="save-so-submit">保存并提交审核</button>
        </div>
      </div>
    `;
  }

  function pageSOView() {
    const d = state.viewDoc.doc;
    return `
      <div class="box">
        <div class="box-hd">销售单据详情（只读） <span class="st ${statusClass(d.status)}">${esc(d.status)}</span></div>
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
          <div style="margin-top:12px"><b>时间线</b>
            <ul style="margin:8px 0 0 18px;line-height:1.8">
              ${(d.timeline || []).map((t) => `<li>${esc(t.act)}　<span style="color:var(--ink4)">${esc(t.who)}　${fmtDT(t.at)}</span></li>`).join("")}
            </ul>
          </div>
        </div>
        <div class="box-ft">
          <button class="btn" data-act="close-view">返回列表</button>
          ${d.status === "草稿" ? `<button class="btn btn-primary" data-act="edit-so" data-id="${esc(d.id)}">编辑草稿</button>` : ""}
          <button class="btn" data-act="perm-writeoff">收款核销</button>
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
    return `
      <div class="box">
        <div class="box-hd">库存盘点单 <span class="sub">只读 — 文员不能创建/审核盘点，仅可查阅</span></div>
        <div class="box-bd">
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr><th>盘点单号</th><th>盘点日期</th><th>仓库</th><th>状态</th><th>说明</th></tr></thead>
              <tbody>
                <tr>
                  <td class="mono">PDD-${fmtD(today).replace(/-/g, "")}-0001</td>
                  <td class="mono">${daysAgo(15)}</td>
                  <td>主仓</td>
                  <td><span class="st st-executed">已审核</span></td>
                  <td>月末例行盘点，差异已处理（财务/仓管权限）</td>
                </tr>
                <tr>
                  <td class="mono">PDD-${fmtD(today).replace(/-/g, "")}-0002</td>
                  <td class="mono">${daysAgo(2)}</td>
                  <td>主仓</td>
                  <td><span class="st st-pending">待审核</span></td>
                  <td>抽盘日用百货，待财务审核</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style="margin-top:10px;padding:8px;background:#fff8e6;border:1px solid #e0c36a">
            如需盘点差异调整库存，请联系仓管/财务账号处理。文员无「盘点录入」与「审核」权限。
          </div>
        </div>
        <div class="box-ft">
          <button class="btn" data-nav="home">返回工作台</button>
          <button class="btn" data-act="perm-stocktake">录入盘点单</button>
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
                <button class="btn btn-primary" data-act="rpt-export">导出Excel</button>
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

  /* ---------- 弹窗 HTML ---------- */
  function modalHtml() {
    if (!modal.show) return "";
    const icon = { ok: "✓", err: "!", warn: "⚠", info: "i" }[modal.type] || "i";
    const cls = { ok: "msg-ok", err: "msg-err", warn: "msg-warn", info: "msg-info" }[modal.type] || "msg-info";
    return `
      <div class="mask" data-act="close-modal-bg">
        <div class="dlg" role="dialog">
          <div class="dlg-hd"><span>系统提示</span><button data-act="close-modal">×</button></div>
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
    return `
      <div class="tour ${mini ? "mini" : ""}">
        <div class="tour-hd">
          <span>${mini ? "教程 " + (i + 1) + "/" + TOUR.length : "分步教程 " + (i + 1) + "/" + TOUR.length}</span>
          <span class="tour-btns">
            <button data-act="tour-mini" title="${mini ? "展开" : "最小化"}">${mini ? "□" : "—"}</button>
            <button data-act="tour-close" title="关闭教程">×</button>
          </span>
        </div>
        <div class="tour-bd">
          <div class="tour-step">${esc(s.title)}</div>
          <div>${esc(s.text)}</div>
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
    const menu = menuOf(state.route);
    const sides = SIDE[menu] || [];
    let body = "";
    switch (state.route) {
      case "home": body = pageHome(); break;
      case "base-products": body = pageProducts(); break;
      case "base-suppliers": body = pageSuppliers(); break;
      case "base-customers": body = pageCustomers(); break;
      case "purchase-list":
      case "purchase-in": body = state.route === "purchase-list" ? pagePurchaseList() : pagePurchaseIn(); break;
      case "sales-list":
      case "sales-out": body = state.route === "sales-list" ? pageSalesList() : pageSalesOut(); break;
      case "stock-query": body = pageStockQuery(); break;
      case "stock-alert": body = pageStockAlert(); break;
      case "stock-ledger": body = pageStockLedger(); break;
      case "stock-move": body = pageStockMove(); break;
      case "stock-check": body = pageStockCheck(); break;
      case "rpt-center": body = pageReport(); break;
      default: body = pageHome();
    }

    const showBack = state.route !== "home";

    document.getElementById("app").innerHTML = `
      <div class="app-title">
        <div class="logo">婆</div>
        <div class="name">管家婆辉煌版 · 网页实训后台</div>
        <div class="co">${esc(db.company)}</div>
        <div class="user">登录：<b>${esc(db.user.name)}</b>（${esc(db.user.role)}）　|　账套：2026演示</div>
      </div>
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
          <button class="side-item" data-act="reset-db">重置演示数据</button>
        </aside>
        <main class="content">
          <div class="page-hd">
            ${showBack ? `<button class="btn-back" data-nav="home">← 返回</button>` : ""}
            <div>
              <div class="page-title">${esc(pageTitle(state.route))}</div>
              <div class="page-crumb">管家婆辉煌版 / ${esc(MENUS.find((m) => m.id === menu)?.label || "")} / ${esc(pageTitle(state.route))}</div>
            </div>
          </div>
          ${body}
        </main>
      </div>
      <div class="statusbar">
        <span>操作员：${esc(db.user.name)}</span>
        <span>公司：${esc(db.company)}</span>
        <span>日期：${fmtD(today)}</span>
        <span class="right">文员实训版 · 数据存本机浏览器 · F5 刷新不丢（除非点重置）</span>
      </div>
      ${tourHtml()}
      ${modalHtml()}
    `;
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
    } else {
      return;
    }
    // 筛选类 change 时重绘
    if (e.type === "change" && id && id.startsWith("f-")) render();
  }

  /* ---------- 事件 ---------- */
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
      case "close-modal":
      case "close-modal-bg":
        if (act === "close-modal-bg" && e.target !== el) break;
        closeModal();
        break;
      case "tour-next": tourNext(); break;
      case "tour-prev": tourPrev(); break;
      case "tour-close": tourClose(); break;
      case "tour-mini":
        db.tourMini = !db.tourMini;
        save();
        render();
        break;
      case "tour-restart": tourRestart(); break;
      case "reset-db":
        if (confirm("确定重置全部演示数据？")) {
          db = seed();
          save();
          state.route = "home";
          state.poForm = state.soForm = state.editProduct = state.viewDoc = null;
          render();
          alertBox("ok", "已重置", "演示数据已恢复初始状态。", "");
        }
        break;

      // 商品
      case "prod-search": render(); break;
      case "prod-reset": state.f.prodQ = ""; state.f.prodCat = ""; render(); break;
      case "new-product": openNewProduct(); break;
      case "edit-product": openEditProduct(id); break;
      case "cancel-product": state.editProduct = null; render(); break;
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
      case "cancel-supplier": state.editSupplier = null; render(); break;
      case "save-supplier": saveSupplier(); break;
      case "cus-search": render(); break;
      case "cus-reset": state.f.cusQ = ""; render(); break;
      case "new-customer": openNewCustomer(); break;
      case "edit-customer": openEditCustomer(id); break;
      case "cancel-customer": state.editCustomer = null; render(); break;
      case "save-customer": saveCustomer(); break;

      // 采购
      case "po-search": render(); break;
      case "po-reset": state.f.poQ = ""; state.f.poStatus = ""; render(); break;
      case "new-po": state.route = "purchase-list"; openNewPO(); break;
      case "view-po": openViewPO(id); break;
      case "edit-po": editPO(id); break;
      case "cancel-po": state.poForm = null; render(); break;
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
      case "perm-approve":
        noPermission("审核采购/销售单据、单据生效、红冲单据");
        break;

      // 销售
      case "so-search": render(); break;
      case "so-reset": state.f.soQ = ""; state.f.soStatus = ""; render(); break;
      case "new-so": state.route = "sales-list"; openNewSO(); break;
      case "view-so": openViewSO(id); break;
      case "edit-so": editSO(id); break;
      case "cancel-so": state.soForm = null; render(); break;
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
      case "move-search": render(); break;
      case "move-reset":
        state.f.moveFrom = daysAgo(30);
        state.f.moveTo = fmtD(today);
        state.f.moveType = "";
        state.f.moveQ = "";
        render();
        break;
      case "move-export": exportMove(); break;
      case "led-search": render(); break;
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

    if (db.tourOn && TOUR[db.tourStep || 0]) {
      state.route = TOUR[db.tourStep || 0].route;
    }
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
