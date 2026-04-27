(function () {
  "use strict";

  /** Release version. Keep this aligned with package.json and CHANGELOG. */
  var APP_VERSION = "2.0.5";

  var TASK_KEY = "workhelper.tasks.v1";
  var MEMO_KEY = "workhelper.memo.v1";
  var TASK_HISTORY_KEY = "workhelper.taskHistory.v1";
  var TASK_HISTORY_MAX = 50;
  var EMPLOYEES_KEY = "workhelper.employees.v1";
  var EMPLOYEE_COL_MAX = 100;
  var EMPLOYEE_ROW_MAX = 5000;
  var OVERTIME_LIMITS_KEY = "workhelper.overtimeLimits.v1";
  var OVERTIME_KYOTEI_RULES_KEY = "workhelper.overtimeKyoteiRules.v1";
  var OVERTIME_KYOTEI_EDITOR_COL_VIS_KEY = "workhelper.overtimeKyoteiEditorColVis.v1";
  var OVERTIME_COL_VIS_KEY = "workhelper.overtimeColumnVisibility.v1";
  var OVERTIME_MONTHLY_HISTORY_KEY = "workhelper.overtimeMonthlyHistory.v1";
  var OVERTIME_PERIOD_SETTINGS_KEY = "workhelper.overtimePeriodSettings.v1";

  function isElectronApp() {
    return (
      typeof window !== "undefined" &&
      window.workhelper &&
      window.workhelper.isElectron === true
    );
  }

  function whActive() {
    if (isElectronApp() && window.workhelper.isDirectoryMode) {
      return !!window.workhelper.isDirectoryMode();
    }
    return (
      typeof WorkHelperDirectoryStorage !== "undefined" &&
      WorkHelperDirectoryStorage.isActive &&
      WorkHelperDirectoryStorage.isActive()
    );
  }

  function whGet(key) {
    if (isElectronApp()) {
      var ev = window.workhelper.getItem(key);
      if (ev === null || ev === undefined || ev === "") return null;
      return String(ev);
    }
    if (whActive()) {
      var v = WorkHelperDirectoryStorage.getItem(key);
      return v === null || v === undefined ? null : v;
    }
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function whSet(key, val) {
    var v = val == null ? "" : String(val);
    if (isElectronApp()) {
      window.workhelper.setItem(key, v);
      return;
    }
    if (whActive()) {
      WorkHelperDirectoryStorage.setItem(key, v);
      return;
    }
    try {
      localStorage.setItem(key, v);
    } catch (e) {}
  }

  /** 黄信号しきい値の既定（0～1）。保存値が無い・不正なときに使う */
  var DEFAULT_OVERTIME_APPROACH_RATIO = 0.8;
  var overtimeState = null;
  var overtimeEditMode = false;
  var overtimeExportStatusTimer = null;
  /** 直近の月次CSV取込（履歴に残す直前） */
  var overtimePendingMonthlyPack = null;
  var kyoteiDialogEditMode = false;
  var employeeEditMode = false;

  /** 36協定ポップアップの数値列（所属は常に表示） */
  var KYOTEI_EDITOR_NUM_COLS = [
    { id: "mNormal", label: "1ヶ月（通常）" },
    { id: "mSpecial", label: "1ヶ月（特別）" },
    { id: "avg6", label: "6ヶ月平均" },
    { id: "yTotal", label: "1年合計" },
  ];

  /** 時間外一覧の列順（先頭から）。lock の列は常に表示し列削除ボタンなし */
  var OVERTIME_COLUMN_ORDER = [
    { id: "empId", lock: true },
    { id: "listName" },
    { id: "listDept" },
    { id: "mfWeekday" },
    { id: "mfPrescribed" },
    { id: "mfLegalHoliday" },
    { id: "mfKyotei36" },
    { id: "mfTokubetsu" },
    { id: "mfYearTotal" },
    { id: "mfExceed" },
    { id: "multiMonthVal" },
    { id: "compareValue" },
    { id: "monthlyNormal" },
    { id: "monthlySpecial" },
    { id: "avg6Limit" },
    { id: "yearlyLimit" },
  ];

  function applyEmployeeEditModeUi() {
    var root = qs("view-employees");
    var btn = qs("btn-employee-edit-mode");
    if (root) root.classList.toggle("employees--edit-mode", employeeEditMode);
    if (btn) {
      btn.textContent = employeeEditMode ? "編集モード終了" : "編集モード";
      btn.setAttribute("aria-pressed", employeeEditMode ? "true" : "false");
    }
  }

  /**
   * Home のカード並び（左上が1 … 3列グリッドの DOM 順）
   * route: アプリ内画面ID / externalUrl: 別タブで開く URL / 両方なし: 準備中ビュー
   */
  var HOME_CARDS = [
    {
      id: "tasks",
      icon: "📋",
      title: "マイタスク",
      description: "あなたのタスクを一覧で確認・管理できます。",
      route: "tasks",
    },
    {
      id: "history",
      icon: "🗂️",
      title: "タスク履歴",
      description: "Home の「完了」から記録されたタスクを日時付きで確認できます。",
      route: "history",
    },
    {
      id: "overtime",
      icon: "⏱",
      title: "時間外・36協定",
      description: "マネーフォワード勤怠のCSVと社員リストを照合し、入力した上限との比較で確認できます。",
      route: "overtime",
    },
    {
      id: "slot04",
      icon: "🔜",
      title: "今後実装予定",
      description: "順次、機能を追加する予定です。",
      route: null,
    },
    {
      id: "slot05",
      icon: "🔜",
      title: "今後実装予定",
      description: "順次、機能を追加する予定です。",
      route: null,
    },
    {
      id: "slot06",
      icon: "🔜",
      title: "今後実装予定",
      description: "順次、機能を追加する予定です。",
      route: null,
    },
    {
      id: "slot07",
      icon: "🔜",
      title: "今後実装予定",
      description: "順次、機能を追加する予定です。",
      route: null,
    },
    {
      id: "slot08",
      icon: "🔜",
      title: "今後実装予定",
      description: "順次、機能を追加する予定です。",
      route: null,
    },
    {
      id: "slot09",
      icon: "🔜",
      title: "今後実装予定",
      description: "順次、機能を追加する予定です。",
      route: null,
    },
    {
      id: "employees",
      icon: "👥",
      title: "社員リスト",
      description: "社員番号・氏名・所属を基本に、列を自由に増やして登録できます。",
      route: "employees",
    },
    {
      id: "backup",
      icon: "💾",
      title: "バックアップ",
      description: "データの書き出し・読み込みができます。",
      route: "backup",
    },
    {
      id: "settings",
      icon: "⚙️",
      title: "設定",
      description: "表示やデータの扱いをまとめて変更します。",
      route: null,
    },
    {
      id: "chatluck",
      icon: "💬",
      title: "ChatLuck",
      description: "社内チャット（ChatLuck）を別タブで開きます。",
      externalUrl: "https://akeytec.chatluck.net/cgi-bin/chatlk/chat.cgi",
    },
    {
      id: "ni-collabo",
      icon: "🤝",
      title: "NI Collabo",
      description: "NI Collabo ポータルを別タブで開きます。",
      externalUrl:
        "https://niconsul.com/akt-2020/ni/niware/portal/index.php?hkey=clbheader_eebc4952dabb8c30468ae11cb6946e30",
    },
    {
      id: "mf-attendance",
      icon: "🔷",
      title: "MF勤怠",
      description: "マネーフォワード クラウド勤怠を別タブで開きます。",
      externalUrl: "https://attendance.moneyforward.com/",
    },
  ];

  function loadTasks() {
    try {
      var raw = whGet(TASK_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveTasks(tasks) {
    whSet(TASK_KEY, JSON.stringify(tasks));
  }

  function loadMemo() {
    try {
      return whGet(MEMO_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  function saveMemo(text) {
    whSet(MEMO_KEY, text);
  }

  function loadTaskHistory() {
    try {
      var raw = whGet(TASK_HISTORY_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      var out = [];
      for (var h = 0; h < parsed.length; h++) {
        var e = parsed[h];
        if (!e || typeof e.text !== "string" || typeof e.completedAt !== "string") continue;
        out.push({ text: e.text, completedAt: e.completedAt });
      }
      return out.slice(0, TASK_HISTORY_MAX);
    } catch (err) {
      return [];
    }
  }

  function saveTaskHistory(items) {
    var list = Array.isArray(items) ? items.slice(0, TASK_HISTORY_MAX) : [];
    whSet(TASK_HISTORY_KEY, JSON.stringify(list));
  }

  function appendTaskHistoryEntry(text) {
    var t = (text || "").trim();
    if (!t) return;
    var items = loadTaskHistory();
    items.unshift({ text: t, completedAt: new Date().toISOString() });
    saveTaskHistory(items);
  }

  function normalizeImportedTaskHistory(raw) {
    if (!Array.isArray(raw)) return null;
    var out = [];
    for (var i = 0; i < raw.length && out.length < TASK_HISTORY_MAX; i++) {
      var e = raw[i];
      if (!e || typeof e.text !== "string") continue;
      var at = typeof e.completedAt === "string" ? e.completedAt : "";
      if (!at) continue;
      out.push({ text: e.text, completedAt: at });
    }
    return out;
  }

  function formatCompletedAt(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch (err) {
      return iso;
    }
  }

  function defaultEmployeeSheet() {
    return {
      v: 1,
      columns: ["社員番号", "氏名", "所属"],
      rows: [],
    };
  }

  function loadEmployeeSheet() {
    try {
      var raw = whGet(EMPLOYEES_KEY);
      if (!raw) return defaultEmployeeSheet();
      var data = JSON.parse(raw);
      if (!data || typeof data !== "object") return defaultEmployeeSheet();
      var cols = Array.isArray(data.columns) ? data.columns.map(String) : [];
      if (cols.length === 0) cols = defaultEmployeeSheet().columns.slice();
      if (cols.length > EMPLOYEE_COL_MAX) cols = cols.slice(0, EMPLOYEE_COL_MAX);
      var rowsIn = Array.isArray(data.rows) ? data.rows : [];
      var rows = [];
      for (var r = 0; r < rowsIn.length; r++) {
        var row = Array.isArray(rowsIn[r]) ? rowsIn[r].map(String) : [];
        while (row.length < cols.length) row.push("");
        row.length = cols.length;
        rows.push(row);
      }
      return { v: 1, columns: cols, rows: rows };
    } catch (err) {
      return defaultEmployeeSheet();
    }
  }

  function saveEmployeeSheet(data) {
    if (!data || !Array.isArray(data.columns)) return;
    var cols = data.columns.map(String).slice(0, EMPLOYEE_COL_MAX);
    if (cols.length === 0) cols = defaultEmployeeSheet().columns.slice();
    var rows = Array.isArray(data.rows) ? data.rows : [];
    var outRows = [];
    for (var i = 0; i < rows.length; i++) {
      var row = Array.isArray(rows[i]) ? rows[i].map(String) : [];
      while (row.length < cols.length) row.push("");
      row.length = cols.length;
      outRows.push(row);
    }
    whSet(EMPLOYEES_KEY, JSON.stringify({ v: 1, columns: cols, rows: outRows }));
  }

  function escapeCsvField(s) {
    var v = s == null ? "" : String(s);
    if (/[",\r\n]/.test(v)) {
      return '"' + v.replace(/"/g, '""') + '"';
    }
    return v;
  }

  function employeesSheetToCsv(sheet) {
    var cols = sheet && Array.isArray(sheet.columns) ? sheet.columns : [];
    var line = cols.map(escapeCsvField).join(",");
    return "\uFEFF" + line + "\r\n";
  }

  function parseCsvToMatrix(text) {
    var raw = text == null ? "" : String(text);
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    if (!raw.trim()) throw new Error("CSV が空です。");
    var matrix = [];
    var row = [];
    var field = "";
    var inQuotes = false;
    for (var i = 0; i < raw.length; i++) {
      var c = raw.charAt(i);
      if (inQuotes) {
        if (c === '"') {
          if (raw.charAt(i + 1) === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += c;
        }
      } else {
        if (c === '"') {
          inQuotes = true;
        } else if (c === ",") {
          row.push(field);
          field = "";
        } else if (c === "\n") {
          row.push(field);
          field = "";
          matrix.push(row);
          row = [];
        } else if (c === "\r") {
          row.push(field);
          field = "";
          if (raw.charAt(i + 1) === "\n") i++;
          matrix.push(row);
          row = [];
        } else {
          field += c;
        }
      }
    }
    row.push(field);
    matrix.push(row);
    if (inQuotes) throw new Error("CSV の引用符が閉じていません。");
    while (matrix.length > 0) {
      var last = matrix[matrix.length - 1];
      var empty = true;
      for (var j = 0; j < last.length; j++) {
        if (String(last[j]).trim() !== "") {
          empty = false;
          break;
        }
      }
      if (empty && matrix.length > 1) matrix.pop();
      else break;
    }
    if (matrix.length === 0) throw new Error("CSV に行がありません。");
    return matrix;
  }

  function matrixToEmployeeSheet(matrix) {
    if (!matrix || matrix.length === 0) throw new Error("データがありません。");
    var header = matrix[0].map(String);
    var cols = [];
    for (var h = 0; h < header.length; h++) {
      cols.push(header[h]);
    }
    while (cols.length > 0 && cols[cols.length - 1].trim() === "") {
      cols.pop();
    }
    if (cols.length === 0) throw new Error("列見出しがありません。");
    if (cols.length > EMPLOYEE_COL_MAX) {
      throw new Error("列数が上限（" + EMPLOYEE_COL_MAX + "）を超えています。");
    }
    var rows = [];
    var maxRows = EMPLOYEE_ROW_MAX;
    for (var r = 1; r < matrix.length && rows.length < maxRows; r++) {
      var src = matrix[r].map(String);
      var out = [];
      for (var c = 0; c < cols.length; c++) {
        out.push(c < src.length ? src[c] : "");
      }
      rows.push(out);
    }
    return { v: 1, columns: cols, rows: rows };
  }

  function parseHoursLikeMf(s) {
    var t = String(s == null ? "" : s).trim();
    if (!t || t === "-" || t === "―" || t === "ー") return NaN;
    var hm = t.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
    if (hm) {
      var h = parseInt(hm[1], 10);
      var m = parseInt(hm[2], 10);
      var sec = hm[3] != null ? parseInt(hm[3], 10) : 0;
      if (isNaN(h) || isNaN(m)) return NaN;
      return h + m / 60 + sec / 3600;
    }
    var n = parseFloat(t.replace(/,/g, ""));
    return isNaN(n) ? NaN : n;
  }

  function headerNamesTrim(headers) {
    var out = [];
    for (var i = 0; i < headers.length; i++) {
      out.push(String(headers[i] == null ? "" : headers[i]).trim());
    }
    return out;
  }

  function colLabelIndex(names, label) {
    for (var i = 0; i < names.length; i++) {
      if (names[i] === label) return i;
    }
    return -1;
  }

  function colLabelIndices(names, label) {
    var ix = [];
    for (var i = 0; i < names.length; i++) {
      if (names[i] === label) ix.push(i);
    }
    return ix;
  }

  /** CSV 先頭行の第1フィールド（引用符対応・改行まで1行のみ走査） */
  function firstCsvField(text) {
    var raw = String(text || "");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    if (!raw) return "";
    var lineEnd = raw.search(/\r\n|\n|\r/);
    var line = lineEnd < 0 ? raw : raw.slice(0, lineEnd);
    var field = "";
    var inQ = false;
    for (var i = 0; i < line.length; i++) {
      var c = line.charAt(i);
      if (inQ) {
        if (c === '"') {
          if (line.charAt(i + 1) === '"') {
            field += '"';
            i++;
          } else {
            inQ = false;
          }
        } else {
          field += c;
        }
      } else {
        if (c === '"') {
          inQ = true;
        } else if (c === ",") {
          return field.trim();
        } else {
          field += c;
        }
      }
    }
    return field.trim();
  }

  function mfCsvFirstFieldLooksLikeEmployeeHeader(text) {
    try {
      return firstCsvField(text) === "従業員番号";
    } catch (e) {
      return false;
    }
  }

  /** MF勤怠の CSV は UTF-8 または Shift_JIS（Windows）で出力されることがある */
  function decodeMoneyForwardCsvFile(buffer) {
    var u8 = new Uint8Array(buffer);
    var utf8 = new TextDecoder("utf-8", { fatal: false }).decode(u8);
    if (mfCsvFirstFieldLooksLikeEmployeeHeader(utf8)) return utf8;
    var labels = ["windows-31j", "shift_jis", "sjis"];
    for (var li = 0; li < labels.length; li++) {
      try {
        var t2 = new TextDecoder(labels[li]).decode(u8);
        if (mfCsvFirstFieldLooksLikeEmployeeHeader(t2)) return t2;
      } catch (e1) {}
    }
    return utf8;
  }

  function buildMfOvertimeColumnMap(headers) {
    var names = headerNamesTrim(headers);
    var idx36 = colLabelIndices(names, "36協定");
    var kyotei36sum = -1;
    var kyotei36name = -1;
    if (idx36.length >= 2) {
      kyotei36name = idx36[0];
      kyotei36sum = idx36[1];
    } else if (idx36.length === 1) {
      kyotei36name = idx36[0];
      var leg = colLabelIndex(names, "法定休日");
      if (leg >= 0 && leg + 1 < names.length && names[leg + 1] === "36協定") {
        kyotei36sum = leg + 1;
      }
    }
    return {
      employeeId: colLabelIndex(names, "従業員番号"),
      mfName: colLabelIndex(names, "氏名"),
      role: colLabelIndex(names, "役職"),
      weekday: colLabelIndex(names, "平日法定外"),
      prescribed: colLabelIndex(names, "所定休日法定外"),
      legalHoliday: colLabelIndex(names, "法定休日"),
      kyotei36name: kyotei36name,
      kyotei36sum: kyotei36sum,
      tokubetsu: colLabelIndex(names, "特別条項"),
      yearTotal: colLabelIndex(names, "年度累計"),
      exceedCount: colLabelIndex(names, "特別条項該当回数"),
      multiMonthAvg: colLabelIndex(names, "複数月（2～6ヶ月平均）"),
    };
  }

  /** 月次勤怠など「法定外時間（平日）」列を持つレポート */
  function buildMfMonthlyAttendanceColumnMap(names) {
    return {
      employeeId: colLabelIndex(names, "従業員番号"),
      mfName: colLabelIndex(names, "氏名"),
      role: colLabelIndex(names, "役職"),
      hoteigaiHeijitsu: colLabelIndex(names, "法定外時間（平日）"),
      hoteigaiShotei: colLabelIndex(names, "法定外時間（所定休日）"),
      hoteigaiHotei: colLabelIndex(names, "法定外時間（法定休日）"),
      hoteigaiWp: colLabelIndex(names, "法定外時間（平日・所定休日）"),
      over60: colLabelIndex(names, "60時間超法定外時間（平日・所定休日）"),
      yearTotal: colLabelIndex(names, "年度累計"),
      exceedLike: colLabelIndex(names, "特別条項該当回数"),
    };
  }

  function matrixRowToMfFlatOvertimeReport(row, colMap) {
    function g(key) {
      var ix = colMap[key];
      if (ix == null || ix < 0 || ix >= row.length) return "";
      return String(row[ix] != null ? row[ix] : "");
    }
    return {
      employeeId: g("employeeId").trim(),
      mfName: g("mfName"),
      role: g("role"),
      weekday: g("weekday"),
      prescribed: g("prescribed"),
      legalHoliday: g("legalHoliday"),
      kyotei36sum: g("kyotei36sum"),
      tokubetsu: g("tokubetsu"),
      yearTotal: g("yearTotal"),
      exceedCount: g("exceedCount"),
      multiMonthAvg: g("multiMonthAvg"),
    };
  }

  function matrixRowToMfFlatMonthly(row, m) {
    function g(ix) {
      if (ix < 0 || ix >= row.length) return "";
      return String(row[ix] != null ? row[ix] : "");
    }
    var wStr = g(m.hoteigaiHeijitsu);
    var pStr = g(m.hoteigaiShotei);
    var lStr = g(m.hoteigaiHotei);
    var wpStr = g(m.hoteigaiWp);
    var w = parseHoursLikeMf(wStr);
    var p = parseHoursLikeMf(pStr);
    var l = parseHoursLikeMf(lStr);
    var wp = parseHoursLikeMf(wpStr);
    if (isNaN(wp)) {
      wp = (isNaN(w) ? 0 : w) + (isNaN(p) ? 0 : p);
    }
    var tokNum = (isNaN(wp) ? 0 : wp) + (isNaN(l) ? 0 : l);
    var hasAny =
      (wStr && wStr.trim()) ||
      (pStr && pStr.trim()) ||
      (lStr && lStr.trim()) ||
      (wpStr && wpStr.trim());
    var tokStr = hasAny && !isNaN(tokNum) ? String(tokNum) : "";
    var kyStr = wpStr && wpStr.trim() ? wpStr : !isNaN(wp) && hasAny ? String(wp) : "";
    return {
      employeeId: g(m.employeeId).trim(),
      mfName: g(m.mfName),
      role: g(m.role),
      weekday: wStr,
      prescribed: pStr,
      legalHoliday: lStr,
      kyotei36sum: kyStr,
      tokubetsu: tokStr,
      yearTotal: g(m.yearTotal),
      exceedCount: m.over60 >= 0 ? g(m.over60) : g(m.exceedLike),
      multiMonthAvg: "",
    };
  }

  function matrixRowToMfFlat(row, spec) {
    if (spec.kind === "monthly") {
      return matrixRowToMfFlatMonthly(row, spec.colMap);
    }
    return matrixRowToMfFlatOvertimeReport(row, spec.colMap);
  }

  function buildMfColumnSpec(headers) {
    var names = headerNamesTrim(headers);
    if (colLabelIndex(names, "従業員番号") < 0) {
      throw new Error(
        "CSVに「従業員番号」列が見つかりません。文字化けの場合は Shift_JIS で再エクスポートするか、そのまま読み込んでください。"
      );
    }
    var overtimeWeek = colLabelIndex(names, "平日法定外");
    var overtimeTok = colLabelIndex(names, "特別条項");
    if (overtimeWeek >= 0 && overtimeTok >= 0) {
      return { kind: "overtime", colMap: buildMfOvertimeColumnMap(headers) };
    }
    var monW = colLabelIndex(names, "法定外時間（平日）");
    var monWp = colLabelIndex(names, "法定外時間（平日・所定休日）");
    if (monW >= 0 || monWp >= 0) {
      return { kind: "monthly", colMap: buildMfMonthlyAttendanceColumnMap(names) };
    }
    throw new Error(
      "このCSVの列構成に対応していません。法定外・休日労働時間レポート、または月次の勤怠集計（法定外時間列あり）を使ってください。"
    );
  }

  function parseMoneyForwardOvertimeCsv(text) {
    var matrix = parseCsvToMatrix(text);
    if (matrix.length < 2) throw new Error("データ行がありません。");
    var spec = buildMfColumnSpec(matrix[0]);
    var rows = [];
    for (var r = 1; r < matrix.length; r++) {
      var flat = matrixRowToMfFlat(matrix[r], spec);
      if (!flat.employeeId) continue;
      rows.push(flat);
    }
    return { colMap: spec, rows: rows };
  }

  function resolveEmployeeListColumns(sheet) {
    var cols = sheet.columns.map(function (c) {
      return String(c == null ? "" : c).trim();
    });
    var idCol = cols.indexOf("社員番号") >= 0 ? cols.indexOf("社員番号") : 0;
    var nameCol = cols.indexOf("氏名") >= 0 ? cols.indexOf("氏名") : cols.length > 1 ? 1 : 0;
    var deptCol =
      cols.indexOf("所属") >= 0 ? cols.indexOf("所属") : cols.length > 2 ? 2 : cols.length > 1 ? 1 : 0;
    return { idCol: idCol, nameCol: nameCol, deptCol: deptCol, columns: cols };
  }

  function mergeEmployeeListWithMfRows(sheet, mfList) {
    var ec = resolveEmployeeListColumns(sheet);
    var mfById = {};
    for (var i = 0; i < mfList.length; i++) {
      var rec = mfList[i];
      if (rec.employeeId) mfById[rec.employeeId] = rec;
    }
    var merged = [];
    var rows = sheet.rows || [];
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      var empId = String(row[ec.idCol] != null ? row[ec.idCol] : "").trim();
      var listName = String(row[ec.nameCol] != null ? row[ec.nameCol] : "").trim();
      var listDept = String(row[ec.deptCol] != null ? row[ec.deptCol] : "").trim();
      merged.push({
        empId: empId,
        listName: listName,
        listDept: listDept,
        mf: empId && mfById[empId] ? mfById[empId] : null,
      });
    }
    var used = {};
    for (var m = 0; m < merged.length; m++) {
      if (merged[m].mf) used[merged[m].empId] = 1;
    }
    var orphans = [];
    for (var k in mfById) {
      if (!Object.prototype.hasOwnProperty.call(mfById, k)) continue;
      if (!used[k]) orphans.push(mfById[k]);
    }
    return { merged: merged, orphans: orphans };
  }

  function defaultKyoteiRules() {
    return {
      rows: [
        { dept: "NWS技術者", mNormal: 45, mSpecial: 80, avg6: 80, yTotal: 480 },
        { dept: "SWS技術者", mNormal: 45, mSpecial: 99, avg6: 80, yTotal: 720 },
        { dept: "受発注業務", mNormal: 30, mSpecial: 60, avg6: 60, yTotal: 420 },
        { dept: "運用サポート業務", mNormal: 30, mSpecial: 30, avg6: 30, yTotal: 240 },
        { dept: "営業の業務", mNormal: 30, mSpecial: 30, avg6: 30, yTotal: 240 },
        { dept: "総務・経理", mNormal: 30, mSpecial: 30, avg6: 30, yTotal: 240 },
      ],
    };
  }

  function normalizeKyoteiRuleRows(rows) {
    var out = [];
    if (!Array.isArray(rows)) return out;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r || typeof r !== "object") continue;
      var dept = String(r.dept != null ? r.dept : "").trim();
      if (!dept) continue;
      out.push({
        dept: dept,
        mNormal: parseFloat(String(r.mNormal != null ? r.mNormal : "").replace(/,/g, ".")),
        mSpecial: parseFloat(String(r.mSpecial != null ? r.mSpecial : "").replace(/,/g, ".")),
        avg6: parseFloat(String(r.avg6 != null ? r.avg6 : "").replace(/,/g, ".")),
        yTotal: parseFloat(String(r.yTotal != null ? r.yTotal : "").replace(/,/g, ".")),
      });
    }
    return out;
  }

  function loadKyoteiRules() {
    try {
      var raw = whGet(OVERTIME_KYOTEI_RULES_KEY);
      if (!raw) return defaultKyoteiRules();
      var p = JSON.parse(raw);
      if (!p || !Array.isArray(p.rows)) return defaultKyoteiRules();
      var rows = normalizeKyoteiRuleRows(p.rows);
      if (rows.length === 0) return defaultKyoteiRules();
      return { rows: rows };
    } catch (err) {
      return defaultKyoteiRules();
    }
  }

  function saveKyoteiRules(data) {
    try {
      whSet(OVERTIME_KYOTEI_RULES_KEY, JSON.stringify({ rows: data.rows || [] }));
    } catch (err) {}
  }

  function findKyoteiRuleForDept(listDept, rows) {
    var d = String(listDept || "").trim();
    if (!d || !rows) return null;
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].dept || "").trim() === d) return rows[i];
    }
    return null;
  }

  function getEffectiveApproachRatio(r) {
    var x = typeof r === "number" ? r : parseFloat(r);
    if (isNaN(x) || x <= 0 || x > 1) return DEFAULT_OVERTIME_APPROACH_RATIO;
    return x;
  }

  /** ダイアログ内の通常/特別の黄信号プレビュー用（編集モード中は入力欄を優先） */
  function getLiveApproachRatioForSignals() {
    var inp = qs("overtime-kyotei-approach-pct");
    if (inp && !inp.readOnly && String(inp.value).trim() !== "") {
      var pv = parseInt(String(inp.value), 10);
      if (!isNaN(pv)) {
        return getEffectiveApproachRatio(Math.min(100, Math.max(1, pv)) / 100);
      }
    }
    return getEffectiveApproachRatio(loadOvertimeLimits().approachRatio);
  }

  function loadOvertimeLimits() {
    try {
      var raw = whGet(OVERTIME_LIMITS_KEY);
      if (!raw) {
        return { monthlyMetric: "tokubetsu", approachRatio: DEFAULT_OVERTIME_APPROACH_RATIO };
      }
      var p = JSON.parse(raw);
      return {
        monthlyMetric: p.monthlyMetric === "kyotei36sum" ? "kyotei36sum" : "tokubetsu",
        approachRatio: getEffectiveApproachRatio(p.approachRatio),
      };
    } catch (err) {
      return { monthlyMetric: "tokubetsu", approachRatio: DEFAULT_OVERTIME_APPROACH_RATIO };
    }
  }

  function saveOvertimeLimits(obj) {
    try {
      var ratio =
        obj && obj.approachRatio != null
          ? getEffectiveApproachRatio(obj.approachRatio)
          : loadOvertimeLimits().approachRatio;
      whSet(
        OVERTIME_LIMITS_KEY,
        JSON.stringify({
          monthlyMetric:
            obj && obj.monthlyMetric === "kyotei36sum" ? "kyotei36sum" : "tokubetsu",
          approachRatio: ratio,
        })
      );
    } catch (err) {}
  }

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function parseYm(ym) {
    var m = /^(\d{4})-(\d{2})$/.exec(String(ym || "").trim());
    if (!m) return null;
    return { y: parseInt(m[1], 10), mo: parseInt(m[2], 10) };
  }

  function formatYm(y, mo) {
    return y + "-" + pad2(mo);
  }

  function addMonthsToYm(ym, delta) {
    var p = parseYm(ym);
    if (!p) return null;
    var idx = p.y * 12 + (p.mo - 1) + delta;
    var ny = Math.floor(idx / 12);
    var nmo = (idx % 12) + 1;
    return formatYm(ny, nmo);
  }

  function listMonthsBackward(endYm, count) {
    var out = [];
    var cur = endYm;
    for (var i = 0; i < count && cur; i++) {
      out.push(cur);
      cur = addMonthsToYm(cur, -1);
    }
    return out;
  }

  /** 暦年 1〜12 月の YYYY-MM 一覧 */
  function calendarJanDecMonthList(calendarYear) {
    var out = [];
    for (var mo = 1; mo <= 12; mo++) out.push(formatYm(calendarYear, mo));
    return out;
  }

  /** 指定年の「開始月」から連続 12 ヶ月（例: 2025年4月始まり → 2025-04 … 2026-03） */
  function rolling12MonthList(startCalendarYear, startMonth) {
    var sm = startMonth != null ? parseInt(String(startMonth), 10) : 1;
    if (isNaN(sm)) sm = 1;
    sm = Math.min(12, Math.max(1, sm));
    var out = [];
    var yy = startCalendarYear;
    var m = sm;
    for (var i = 0; i < 12; i++) {
      out.push(formatYm(yy, m));
      m++;
      if (m > 12) {
        m = 1;
        yy++;
      }
    }
    return out;
  }

  function defaultCalendarYearFromDate(d) {
    return d.getFullYear();
  }

  function normalizeOvertimePeriodSettings(p) {
    var def = {
      useHistoryAggregation: true,
      rollingMonths: 5,
      rollingEndYm: "",
      fiscalAprilYear: 0,
      yearMode: "calendar",
      yearStartMonth: 1,
    };
    if (!p || typeof p !== "object") return def;
    var rm = parseInt(p.rollingMonths, 10);
    if (isNaN(rm)) rm = 5;
    rm = Math.min(24, Math.max(1, rm));
    var fy = parseInt(p.fiscalAprilYear, 10);
    var yearVal = !isNaN(fy) && fy > 1999 ? fy : 0;
    var ysm = parseInt(p.yearStartMonth, 10);
    if (isNaN(ysm)) ysm = 1;
    ysm = Math.min(12, Math.max(1, ysm));
    var ym = p.yearMode;
    if (ym !== "calendar" && ym !== "rolling12") {
      if (yearVal > 0) {
        ym = "rolling12";
        ysm = 4;
      } else {
        ym = "calendar";
        ysm = 1;
      }
    }
    return {
      useHistoryAggregation: p.useHistoryAggregation !== false,
      rollingMonths: rm,
      rollingEndYm: p.rollingEndYm != null ? String(p.rollingEndYm).trim() : "",
      fiscalAprilYear: yearVal,
      yearMode: ym,
      yearStartMonth: ysm,
    };
  }

  function effectiveYearBaseForPeriod(ps) {
    return ps.fiscalAprilYear > 0 ? ps.fiscalAprilYear : defaultCalendarYearFromDate(new Date());
  }

  /** 年間（12ヶ月）集計の月リストとツールチップ用文言 */
  function getYearAggregationMonthsAndMeta(ps) {
    var yBase = effectiveYearBaseForPeriod(ps);
    var months;
    var meta;
    if (ps.yearMode === "rolling12") {
      var sm = ps.yearStartMonth != null ? ps.yearStartMonth : 1;
      months = rolling12MonthList(yBase, sm);
      meta = months[0] + "〜" + months[11] + "（12ヶ月）";
    } else {
      months = calendarJanDecMonthList(yBase);
      meta = yBase + "年（1月〜12月）";
    }
    return { months: months, meta: meta };
  }

  function loadOvertimeMonthlyHistory() {
    try {
      var raw = whGet(OVERTIME_MONTHLY_HISTORY_KEY);
      if (!raw) return { snapshots: [] };
      var p = JSON.parse(raw);
      if (!p || !Array.isArray(p.snapshots)) return { snapshots: [] };
      return { snapshots: p.snapshots.slice(-60) };
    } catch (e) {
      return { snapshots: [] };
    }
  }

  function saveOvertimeMonthlyHistory(hist) {
    try {
      var snaps = Array.isArray(hist.snapshots) ? hist.snapshots.slice(-60) : [];
      whSet(OVERTIME_MONTHLY_HISTORY_KEY, JSON.stringify({ snapshots: snaps }));
    } catch (e) {}
  }

  /** 月次履歴に登録されている年月を一覧表示 */
  function renderOvertimeMonthlyHistorySummary() {
    var wrap = qs("overtime-history-summary");
    if (!wrap) return;
    var hist = loadOvertimeMonthlyHistory();
    var snaps = (hist.snapshots || []).slice().sort(function (a, b) {
      return String(a.ym || "").localeCompare(String(b.ym || ""));
    });
    wrap.innerHTML = "";
    var head = document.createElement("p");
    head.className = "overtime-history-summary__title";
    head.textContent = "登録済みの月次履歴";
    wrap.appendChild(head);
    if (snaps.length === 0) {
      var empty = document.createElement("p");
      empty.className = "overtime-history-summary__empty";
      empty.textContent =
        "まだありません。月次勤怠集計のCSVを取り込み、「履歴に取り込む」と登録されます。";
      wrap.appendChild(empty);
      return;
    }
    var note = document.createElement("p");
    note.className = "overtime-history-summary__note";
    note.textContent = "直近で最大60ヶ月分を保持します（古いものから削除されます）。";
    wrap.appendChild(note);
    var ul = document.createElement("ul");
    ul.className = "overtime-history-summary__list";
    for (var i = 0; i < snaps.length; i++) {
      var s = snaps[i];
      var ym = s.ym ? String(s.ym) : "（年月不明）";
      var n = 0;
      if (s.byEmp && typeof s.byEmp === "object") {
        for (var k in s.byEmp) {
          if (Object.prototype.hasOwnProperty.call(s.byEmp, k)) n++;
        }
      }
      var li = document.createElement("li");
      li.textContent = ym + " … 社員数 " + n + " 名";
      ul.appendChild(li);
    }
    wrap.appendChild(ul);
  }

  function findSnapshotByYm(snapshots, ym) {
    for (var i = 0; i < snapshots.length; i++) {
      if (snapshots[i].ym === ym) return snapshots[i];
    }
    return null;
  }

  function getLatestYmInSnapshots(snapshots) {
    var best = "";
    for (var i = 0; i < snapshots.length; i++) {
      var ym = snapshots[i].ym;
      if (ym && (!best || ym > best)) best = ym;
    }
    return best || "";
  }

  function getEmpHistoryHours(snap, empId, metricKey) {
    if (!snap || !snap.byEmp) return NaN;
    var row = snap.byEmp[empId];
    if (!row) return NaN;
    var v = metricKey === "kyotei36" ? row.kyotei36 : row.tokubetsu;
    if (v == null || isNaN(v)) return NaN;
    return v;
  }

  function appendOvertimeMonthlyHistorySnapshot(ym, mfRows) {
    var p = parseYm(ym);
    if (!p) throw new Error("年月は YYYY-MM 形式で指定してください。");
    var hist = loadOvertimeMonthlyHistory();
    var byEmp = {};
    for (var i = 0; i < mfRows.length; i++) {
      var rec = mfRows[i];
      var id = String(rec.employeeId || "").trim();
      if (!id) continue;
      var t = parseHoursLikeMf(rec.tokubetsu || "");
      var k = parseHoursLikeMf(rec.kyotei36sum || "");
      byEmp[id] = {
        tokubetsu: isNaN(t) ? null : t,
        kyotei36: isNaN(k) ? null : k,
      };
    }
    var next = [];
    for (var j = 0; j < hist.snapshots.length; j++) {
      if (hist.snapshots[j].ym !== ym) next.push(hist.snapshots[j]);
    }
    next.push({ ym: ym, byEmp: byEmp });
    next.sort(function (a, b) {
      return String(a.ym).localeCompare(String(b.ym));
    });
    saveOvertimeMonthlyHistory({ snapshots: next });
  }

  function loadOvertimePeriodSettings() {
    try {
      var raw = whGet(OVERTIME_PERIOD_SETTINGS_KEY);
      if (!raw) return normalizeOvertimePeriodSettings(null);
      var p = JSON.parse(raw);
      return normalizeOvertimePeriodSettings(p && typeof p === "object" ? p : null);
    } catch (e) {
      return normalizeOvertimePeriodSettings(null);
    }
  }

  function saveOvertimePeriodSettings(obj) {
    try {
      whSet(OVERTIME_PERIOD_SETTINGS_KEY, JSON.stringify(normalizeOvertimePeriodSettings(obj || {})));
    } catch (e) {}
  }

  function roundHoursStore(x) {
    return Math.round(x * 10) / 10;
  }

  function computeRollAverageForEmp(snapshots, empId, endYm, monthCount, metricKey) {
    if (!endYm || !monthCount) return null;
    var months = listMonthsBackward(endYm, monthCount);
    var sum = 0;
    var cnt = 0;
    for (var i = 0; i < months.length; i++) {
      var sn = findSnapshotByYm(snapshots, months[i]);
      var h = getEmpHistoryHours(sn, empId, metricKey);
      if (!isNaN(h)) {
        sum += h;
        cnt++;
      }
    }
    if (cnt === 0) return null;
    return sum / cnt;
  }

  function computeYearWindowSumForEmp(snapshots, empId, months, metricKey) {
    if (!months || months.length === 0) return null;
    var sum = 0;
    var cnt = 0;
    for (var i = 0; i < months.length; i++) {
      var sn = findSnapshotByYm(snapshots, months[i]);
      var h = getEmpHistoryHours(sn, empId, metricKey);
      if (!isNaN(h)) {
        sum += h;
        cnt++;
      }
    }
    if (cnt === 0) return null;
    return sum;
  }

  function enrichMergedWithPeriodMetrics(merged, limits) {
    if (!merged || !limits) return;
    var ps = loadOvertimePeriodSettings();
    var hist = loadOvertimeMonthlyHistory();
    var metricKey = limits.monthlyMetric === "kyotei36sum" ? "kyotei36" : "tokubetsu";
    var snaps = hist.snapshots || [];
    var latest = getLatestYmInSnapshots(snaps);
    var endYm =
      ps.rollingEndYm && findSnapshotByYm(snaps, ps.rollingEndYm) ? ps.rollingEndYm : latest || "";
    var rollN = ps.rollingMonths != null ? ps.rollingMonths : 5;
    var yearWin = getYearAggregationMonthsAndMeta(ps);
    for (var i = 0; i < merged.length; i++) {
      var mf = merged[i].mf;
      if (!mf) continue;
      delete mf._computedRollAvgStr;
      delete mf._computedFiscalYearSumStr;
      delete mf._computedRollMeta;
      delete mf._computedFiscalMeta;
      if (!ps.useHistoryAggregation || snaps.length === 0) continue;
      var empId = String(merged[i].empId || "").trim();
      if (!empId) continue;
      var effEnd = endYm;
      if (!effEnd || !findSnapshotByYm(snaps, effEnd)) effEnd = latest;
      if (!effEnd) continue;
      var roll = computeRollAverageForEmp(snaps, empId, effEnd, rollN, metricKey);
      if (roll != null && !isNaN(roll)) {
        mf._computedRollAvgStr = String(roundHoursStore(roll));
        mf._computedRollMeta = effEnd + " までの " + rollN + " ヶ月";
      }
      var fsum = computeYearWindowSumForEmp(snaps, empId, yearWin.months, metricKey);
      if (fsum != null && !isNaN(fsum)) {
        mf._computedFiscalYearSumStr = String(roundHoursStore(fsum));
        mf._computedFiscalMeta = yearWin.meta;
      }
    }
  }

  function setOvertimeMonthlyHistoryBannerVisible(on) {
    var b = qs("overtime-monthly-history-banner");
    if (b) b.hidden = !on;
  }

  function syncOvertimePeriodFieldsToDom() {
    var ps = loadOvertimePeriodSettings();
    var ch = qs("overtime-use-history-aggregation");
    if (ch) ch.checked = ps.useHistoryAggregation !== false;
    var re = qs("overtime-roll-end-ym");
    if (re) re.value = ps.rollingEndYm || "";
    var rm = qs("overtime-roll-months");
    if (rm) rm.value = String(ps.rollingMonths != null ? ps.rollingMonths : 5);
    var fy = qs("overtime-fy-april-year");
    if (fy) {
      var y = effectiveYearBaseForPeriod(ps);
      fy.value = String(y);
    }
    var mCal = qs("overtime-year-mode-calendar");
    var mRoll = qs("overtime-year-mode-rolling");
    if (mCal && mRoll) {
      if (ps.yearMode === "rolling12") mRoll.checked = true;
      else mCal.checked = true;
    }
    var ysm = qs("overtime-year-start-month");
    if (ysm) ysm.value = String(ps.yearStartMonth != null ? ps.yearStartMonth : 1);
    updateOvertimeYearModeMicroUi();
  }

  function updateOvertimeYearModeMicroUi() {
    var cal = qs("overtime-year-mode-calendar");
    var wrap = qs("overtime-year-start-wrap");
    if (wrap && cal) wrap.hidden = !!cal.checked;
  }

  function collectOvertimePeriodSettingsFromDom() {
    var ch = qs("overtime-use-history-aggregation");
    var re = qs("overtime-roll-end-ym");
    var rm = qs("overtime-roll-months");
    var fy = qs("overtime-fy-april-year");
    var rollM = qs("overtime-year-mode-rolling");
    var ysmEl = qs("overtime-year-start-month");
    var rmi = rm ? parseInt(String(rm.value || "5"), 10) : 5;
    if (isNaN(rmi)) rmi = 5;
    rmi = Math.min(24, Math.max(1, rmi));
    var fyi = fy ? parseInt(String(fy.value || "0"), 10) : 0;
    var ysmi = ysmEl ? parseInt(String(ysmEl.value || "1"), 10) : 1;
    if (isNaN(ysmi)) ysmi = 1;
    ysmi = Math.min(12, Math.max(1, ysmi));
    saveOvertimePeriodSettings({
      useHistoryAggregation: !!(ch && ch.checked),
      rollingEndYm: re && re.value ? String(re.value).trim() : "",
      rollingMonths: rmi,
      fiscalAprilYear: !isNaN(fyi) && fyi > 1999 ? fyi : 0,
      yearMode: rollM && rollM.checked ? "rolling12" : "calendar",
      yearStartMonth: ysmi,
    });
  }

  function evaluateOvertimeRow(mf, limits, listDept) {
    var metric = limits.monthlyMetric === "kyotei36sum" ? "kyotei36sum" : "tokubetsu";
    var monthlyRaw = mf ? (metric === "kyotei36sum" ? mf.kyotei36sum : mf.tokubetsu) : "";
    var ps = loadOvertimePeriodSettings();
    var useHist = ps.useHistoryAggregation !== false;
    var yearlyRaw = "";
    var multiMonthRaw = "";
    if (mf) {
      if (useHist && mf._computedRollAvgStr && String(mf._computedRollAvgStr).trim() !== "") {
        multiMonthRaw = String(mf._computedRollAvgStr);
      } else {
        multiMonthRaw = mf.multiMonthAvg || "";
      }
      if (useHist && mf._computedFiscalYearSumStr && String(mf._computedFiscalYearSumStr).trim() !== "") {
        yearlyRaw = String(mf._computedFiscalYearSumStr);
      } else {
        yearlyRaw = mf.yearTotal || "";
      }
    }
    var monthlyHours = parseHoursLikeMf(monthlyRaw);
    var yearlyHours = parseHoursLikeMf(yearlyRaw);
    var multiMonthHours = parseHoursLikeMf(multiMonthRaw);
    var rulesRows = loadKyoteiRules().rows;
    var rule = findKyoteiRuleForDept(listDept, rulesRows);
    var ruleMatched = !!rule;

    var capN = ruleMatched && !isNaN(rule.mNormal) && rule.mNormal > 0 ? rule.mNormal : NaN;
    var capS = ruleMatched && !isNaN(rule.mSpecial) && rule.mSpecial > 0 ? rule.mSpecial : NaN;
    var cap6 = ruleMatched && !isNaN(rule.avg6) && rule.avg6 > 0 ? rule.avg6 : NaN;
    var capY = ruleMatched && !isNaN(rule.yTotal) && rule.yTotal > 0 ? rule.yTotal : NaN;

    var monthlyNormalActive = !!mf && ruleMatched && !isNaN(capN);
    var monthlySpecialActive = !!mf && ruleMatched && !isNaN(capS);
    var hasMultiEffective = !!(mf && multiMonthRaw && String(multiMonthRaw).trim() !== "");
    var avg6Active = !!mf && ruleMatched && !isNaN(cap6) && hasMultiEffective;

    var hasYearEffective = !!(mf && yearlyRaw && String(yearlyRaw).trim() !== "");
    var yearlyActive = !!mf && ruleMatched && !isNaN(capY) && hasYearEffective;

    var monthlyNormalOver =
      monthlyNormalActive && !isNaN(monthlyHours) && !isNaN(capN) && monthlyHours > capN;
    var monthlySpecialOver =
      monthlySpecialActive && !isNaN(monthlyHours) && !isNaN(capS) && monthlyHours > capS;
    var ar = limits && limits.approachRatio != null ? getEffectiveApproachRatio(limits.approachRatio) : DEFAULT_OVERTIME_APPROACH_RATIO;
    var monthlyNormalApproach =
      monthlyNormalActive &&
      !isNaN(monthlyHours) &&
      !isNaN(capN) &&
      capN > 0 &&
      !monthlyNormalOver &&
      monthlyHours >= capN * ar;
    var monthlySpecialApproach =
      monthlySpecialActive &&
      !isNaN(monthlyHours) &&
      !isNaN(capS) &&
      capS > 0 &&
      !monthlySpecialOver &&
      monthlyHours >= capS * ar;

    var avg6Over = avg6Active && !isNaN(multiMonthHours) && multiMonthHours > cap6;
    var yearlyOver = yearlyActive && !isNaN(yearlyHours) && yearlyHours > capY;
    var avg6Approach =
      avg6Active &&
      !isNaN(multiMonthHours) &&
      !isNaN(cap6) &&
      cap6 > 0 &&
      !avg6Over &&
      multiMonthHours >= cap6 * ar;
    var yearlyApproach =
      yearlyActive &&
      !isNaN(yearlyHours) &&
      !isNaN(capY) &&
      capY > 0 &&
      !yearlyOver &&
      yearlyHours >= capY * ar;

    return {
      monthlyRaw: monthlyRaw,
      yearlyRaw: yearlyRaw,
      multiMonthRaw: multiMonthRaw,
      monthlyHours: monthlyHours,
      yearlyHours: yearlyHours,
      multiMonthHours: multiMonthHours,
      ruleMatched: ruleMatched,
      monthlyNormalActive: monthlyNormalActive,
      monthlySpecialActive: monthlySpecialActive,
      avg6Active: avg6Active,
      yearlyActive: yearlyActive,
      monthlyNormalOver: monthlyNormalOver,
      monthlySpecialOver: monthlySpecialOver,
      monthlyNormalApproach: monthlyNormalApproach,
      monthlySpecialApproach: monthlySpecialApproach,
      avg6Over: avg6Over,
      yearlyOver: yearlyOver,
      avg6Approach: avg6Approach,
      yearlyApproach: yearlyApproach,
    };
  }

  function getOvertimeColMeta(colId) {
    for (var i = 0; i < OVERTIME_COLUMN_ORDER.length; i++) {
      if (OVERTIME_COLUMN_ORDER[i].id === colId) return OVERTIME_COLUMN_ORDER[i];
    }
    return null;
  }

  function loadOvertimeColumnVisibility() {
    var vis = {};
    for (var d = 0; d < OVERTIME_COLUMN_ORDER.length; d++) {
      vis[OVERTIME_COLUMN_ORDER[d].id] = true;
    }
    try {
      var raw = whGet(OVERTIME_COL_VIS_KEY);
      if (!raw) return vis;
      var p = JSON.parse(raw);
      if (!p || typeof p !== "object") return vis;
      for (var k in vis) {
        if (Object.prototype.hasOwnProperty.call(p, k)) vis[k] = !!p[k];
      }
      return vis;
    } catch (err) {
      return vis;
    }
  }

  function saveOvertimeColumnVisibility(vis) {
    try {
      whSet(OVERTIME_COL_VIS_KEY, JSON.stringify(vis));
    } catch (err) {}
  }

  function isOvertimeColumnVisible(colId, vis) {
    var meta = getOvertimeColMeta(colId);
    if (meta && meta.lock) return true;
    return vis[colId] !== false;
  }

  function countOvertimeVisibleColumns(vis) {
    var n = 0;
    for (var i = 0; i < OVERTIME_COLUMN_ORDER.length; i++) {
      var id = OVERTIME_COLUMN_ORDER[i].id;
      if (isOvertimeColumnVisible(id, vis)) n++;
    }
    return n;
  }

  function removeOvertimeDisplayColumn(colId) {
    var meta = getOvertimeColMeta(colId);
    if (!meta || meta.lock) return;
    var vis = loadOvertimeColumnVisibility();
    var next = {};
    for (var k in vis) {
      if (Object.prototype.hasOwnProperty.call(vis, k)) next[k] = vis[k];
    }
    next[colId] = false;
    if (countOvertimeVisibleColumns(next) < 1) {
      alert("表示する列は最低1列必要です（社員番号は常に表示されます）。");
      return;
    }
    vis[colId] = false;
    saveOvertimeColumnVisibility(vis);
    refreshOvertimeViewFromState();
  }

  function addOvertimeDisplayColumn(colId) {
    var meta = getOvertimeColMeta(colId);
    if (!meta || meta.lock) return;
    var vis = loadOvertimeColumnVisibility();
    var next = {};
    for (var k in vis) {
      if (Object.prototype.hasOwnProperty.call(vis, k)) next[k] = vis[k];
    }
    next[colId] = true;
    saveOvertimeColumnVisibility(next);
    refreshOvertimeViewFromState();
  }

  /** 編集モード用: 列削除で非表示になっている列（lock 除く） */
  function listOvertimeHiddenColumnIds(vis) {
    var out = [];
    for (var i = 0; i < OVERTIME_COLUMN_ORDER.length; i++) {
      var def = OVERTIME_COLUMN_ORDER[i];
      if (def.lock) continue;
      if (vis[def.id] === false) out.push(def.id);
    }
    return out;
  }

  function updateOvertimeColumnAddPanel(kind, limits) {
    var panel = qs("overtime-column-add-panel");
    var wrap = qs("overtime-column-add-buttons");
    if (!panel || !wrap) return;
    if (!overtimeEditMode) {
      panel.hidden = true;
      wrap.innerHTML = "";
      return;
    }
    panel.hidden = false;
    var vis = loadOvertimeColumnVisibility();
    var lim = limits || readOvertimeLimitsFromDom();
    var k =
      kind != null
        ? kind
        : overtimeState && overtimeState.colMap && overtimeState.colMap.kind
          ? overtimeState.colMap.kind
          : "overtime";
    var hidden = listOvertimeHiddenColumnIds(vis);
    wrap.innerHTML = "";
    if (hidden.length === 0) {
      var empty = document.createElement("p");
      empty.className = "overtime-column-add-panel__empty";
      empty.textContent = "いま非表示の列はありません。「列削除」で隠した列がここに並びます。";
      wrap.appendChild(empty);
      return;
    }
    for (var h = 0; h < hidden.length; h++) {
      var cid = hidden[h];
      var lab = overtimeColumnHeading(cid, k, lim);
      var b = document.createElement("button");
      b.type = "button";
      b.className = "secondary overtime-col-add-btn";
      b.textContent = lab;
      b.setAttribute("data-add-overtime-col", cid);
      b.title = "「" + lab + "」を一覧に表示します";
      wrap.appendChild(b);
    }
  }

  function overtimeColumnHeading(colId, kind, limits) {
    var m = limits.monthlyMetric === "kyotei36sum" ? "36協定計" : "特別条項";
    if (kind === "monthly") {
      var mo = {
        empId: "社員番号",
        listName: "氏名",
        listDept: "所属",
        mfWeekday: "法定外時間（平日）",
        mfPrescribed: "法定外時間（所定休日）",
        mfLegalHoliday: "法定外時間（法定休日）",
        mfKyotei36: "法定外時間（平日・所定休日）",
        mfTokubetsu: "特別条項相当",
        mfYearTotal: "年度累計",
        mfExceed: "60時間超（平日・所定休日）",
        multiMonthVal: "複数月平均",
        compareValue: "比較値（" + m + "）",
        monthlyNormal: "1ヶ月（通常）",
        monthlySpecial: "1ヶ月（特別）",
        avg6Limit: "6ヶ月平均",
        yearlyLimit: "1年合計",
      };
      return mo[colId] || colId;
    }
    var ot = {
      empId: "社員番号",
      listName: "氏名",
      listDept: "所属",
      mfWeekday: "平日法定外",
      mfPrescribed: "所定休日法定外",
      mfLegalHoliday: "法定休日",
      mfKyotei36: "36協定計",
      mfTokubetsu: "特別条項",
      mfYearTotal: "年度累計",
      mfExceed: "特別条項該当回数",
      multiMonthVal: "複数月平均",
      compareValue: "比較値（" + m + "）",
      monthlyNormal: "1ヶ月（通常）",
      monthlySpecial: "1ヶ月（特別）",
      avg6Limit: "6ヶ月平均",
      yearlyLimit: "1年合計",
    };
    return ot[colId] || colId;
  }

  /**
   * 時間外一覧の1セル（画面・Excel 共通）。
   * variant: plain | muted | warn | approach | over | ok
   * （approach＝比較値が上限×しきい値以上で未超過＝黄信号、over＝超過＝赤信号）
   */
  function getOvertimeCellPresentation(colId, item, mf, ev) {
    function mfSourceVal(val) {
      return mf ? val : "";
    }
    switch (colId) {
      case "empId":
        return { text: item.empId ? String(item.empId) : "—", variant: "plain" };
      case "listName":
        return {
          text: item.listName != null && String(item.listName) !== "" ? String(item.listName) : "",
          variant: "plain",
        };
      case "listDept":
        return {
          text: item.listDept != null && String(item.listDept) !== "" ? String(item.listDept) : "",
          variant: "plain",
        };
      case "mfWeekday":
        if (!mf) return { text: "—", variant: "muted" };
        return {
          text:
            mf.weekday != null && String(mf.weekday).trim() !== ""
              ? String(mf.weekday)
              : "—",
          variant: "plain",
        };
      case "mfPrescribed":
        if (!mf) return { text: "—", variant: "muted" };
        return {
          text:
            mf.prescribed != null && String(mf.prescribed).trim() !== ""
              ? String(mf.prescribed)
              : "—",
          variant: "plain",
        };
      case "mfLegalHoliday":
        if (!mf) return { text: "—", variant: "muted" };
        return {
          text:
            mf.legalHoliday != null && String(mf.legalHoliday).trim() !== ""
              ? String(mf.legalHoliday)
              : "—",
          variant: "plain",
        };
      case "mfKyotei36":
        if (!mf) return { text: "—", variant: "muted" };
        return {
          text:
            mf.kyotei36sum != null && String(mf.kyotei36sum).trim() !== ""
              ? String(mf.kyotei36sum)
              : "—",
          variant: "plain",
        };
      case "mfTokubetsu":
        if (!mf) return { text: "—", variant: "muted" };
        return {
          text:
            mf.tokubetsu != null && String(mf.tokubetsu).trim() !== ""
              ? String(mf.tokubetsu)
              : "—",
          variant: "plain",
        };
      case "mfYearTotal":
        if (!mf) return { text: "—", variant: "muted" };
        return {
          text:
            ev.yearlyRaw != null && String(ev.yearlyRaw).trim() !== ""
              ? String(ev.yearlyRaw)
              : mf.yearTotal != null && String(mf.yearTotal).trim() !== ""
                ? String(mf.yearTotal)
                : "—",
          variant: "plain",
        };
      case "mfExceed":
        if (!mf) return { text: "—", variant: "muted" };
        return {
          text:
            mf.exceedCount != null && String(mf.exceedCount).trim() !== ""
              ? String(mf.exceedCount)
              : "—",
          variant: "plain",
        };
      case "multiMonthVal":
        if (!mf) return { text: "—", variant: "muted" };
        return {
          text:
            ev.multiMonthRaw != null && String(ev.multiMonthRaw).trim() !== ""
              ? String(ev.multiMonthRaw)
              : mf.multiMonthAvg != null && String(mf.multiMonthAvg).trim() !== ""
                ? String(mf.multiMonthAvg)
                : "—",
          variant: "plain",
        };
      case "compareValue":
        if (!mf) return { text: "CSVなし", variant: "muted" };
        return {
          text:
            ev.monthlyRaw && String(ev.monthlyRaw).trim() ? String(ev.monthlyRaw) : "—",
          variant: "plain",
        };
      case "monthlyNormal":
        if (!mf) return { text: "—", variant: "muted" };
        if (!ev.ruleMatched) return { text: "所属該当なし", variant: "warn" };
        if (!ev.monthlyNormalActive) return { text: "—", variant: "muted" };
        if (isNaN(ev.monthlyHours)) return { text: "数値不可", variant: "warn" };
        if (ev.monthlyNormalOver) return { text: "超過", variant: "over" };
        if (ev.monthlyNormalApproach) return { text: "以内", variant: "approach" };
        return { text: "以内", variant: "ok" };
      case "monthlySpecial":
        if (!mf) return { text: "—", variant: "muted" };
        if (!ev.ruleMatched) return { text: "所属該当なし", variant: "warn" };
        if (!ev.monthlySpecialActive) return { text: "—", variant: "muted" };
        if (isNaN(ev.monthlyHours)) return { text: "数値不可", variant: "warn" };
        if (ev.monthlySpecialOver) return { text: "超過", variant: "over" };
        if (ev.monthlySpecialApproach) return { text: "以内", variant: "approach" };
        return { text: "以内", variant: "ok" };
      case "avg6Limit":
        if (!mf) return { text: "—", variant: "muted" };
        if (!ev.ruleMatched) return { text: "所属該当なし", variant: "warn" };
        if (!ev.avg6Active) return { text: "—", variant: "muted" };
        if (isNaN(ev.multiMonthHours)) return { text: "数値不可", variant: "warn" };
        if (ev.avg6Over) return { text: "超過", variant: "over" };
        if (ev.avg6Approach) return { text: "警告", variant: "approach" };
        return { text: "以内", variant: "ok" };
      case "yearlyLimit":
        if (!mf) return { text: "—", variant: "muted" };
        if (!ev.ruleMatched) return { text: "所属該当なし", variant: "warn" };
        if (!ev.yearlyActive) return { text: "—", variant: "muted" };
        if (isNaN(ev.yearlyHours)) return { text: "数値不可", variant: "warn" };
        if (ev.yearlyOver) return { text: "超過", variant: "over" };
        if (ev.yearlyApproach) return { text: "警告", variant: "approach" };
        return { text: "以内", variant: "ok" };
      default:
        return { text: "", variant: "plain" };
    }
  }

  function appendOvertimeDataCell(tr, colId, item, mf, ev) {
    var p = getOvertimeCellPresentation(colId, item, mf, ev);
    var td = document.createElement("td");
    td.textContent = p.text;
    if (colId === "multiMonthVal" && mf && mf._computedRollMeta) {
      td.title = String(mf._computedRollMeta);
    }
    if (colId === "mfYearTotal" && mf && mf._computedFiscalMeta) {
      td.title = String(mf._computedFiscalMeta);
    }
    if (p.variant !== "plain") td.className = "overtime-cell-" + p.variant;
    tr.appendChild(td);
  }

  function applyOvertimeEditModeUi() {
    var root = qs("view-overtime");
    var btn = qs("btn-overtime-edit-mode");
    if (root) root.classList.toggle("overtime--edit-mode", overtimeEditMode);
    if (btn) {
      btn.textContent = overtimeEditMode ? "編集モード終了" : "編集モード";
      btn.setAttribute("aria-pressed", overtimeEditMode ? "true" : "false");
    }
  }

  function renderOvertimeReport(container, orphansEl, state, limits) {
    if (!container) return;
    var merged = state.merged;
    var kind = state.colMap && state.colMap.kind ? state.colMap.kind : "overtime";
    var vis = loadOvertimeColumnVisibility();
    var visibleIds = [];
    for (var vi = 0; vi < OVERTIME_COLUMN_ORDER.length; vi++) {
      var cid = OVERTIME_COLUMN_ORDER[vi].id;
      if (isOvertimeColumnVisible(cid, vis)) visibleIds.push(cid);
    }
    var colCount = visibleIds.length;

    var table = document.createElement("table");
    table.className = "overtime-table";
    var thead = document.createElement("thead");
    var trh = document.createElement("tr");
    for (var hi = 0; hi < visibleIds.length; hi++) {
      var colId = visibleIds[hi];
      var meta = getOvertimeColMeta(colId);
      var th = document.createElement("th");
      th.className = "overtime-th";
      var inner = document.createElement("div");
      inner.className = "overtime-th-inner";
      var lab = document.createElement("span");
      lab.className = "overtime-th-label";
      lab.textContent = overtimeColumnHeading(colId, kind, limits);
      inner.appendChild(lab);
      if (overtimeEditMode && meta && !meta.lock) {
        var delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "overtime-col-del-btn secondary";
        delBtn.textContent = "列削除";
        delBtn.setAttribute("data-del-overtime-col", colId);
        delBtn.title = "この列を一覧から非表示にします";
        inner.appendChild(delBtn);
      }
      th.appendChild(inner);
      trh.appendChild(th);
    }
    thead.appendChild(trh);

    var tbody = document.createElement("tbody");
    if (merged.length === 0) {
      var trEmpty = document.createElement("tr");
      var tdEmpty = document.createElement("td");
      tdEmpty.colSpan = Math.max(1, colCount);
      tdEmpty.className = "overtime-cell-muted overtime-cell-empty";
      tdEmpty.textContent = "社員リストに行がありません。先に社員リストで社員を登録してください。";
      trEmpty.appendChild(tdEmpty);
      tbody.appendChild(trEmpty);
    }
    for (var i = 0; i < merged.length; i++) {
      var item = merged[i];
      var mf = item.mf;
      var ev = evaluateOvertimeRow(mf, limits, item.listDept);
      var tr = document.createElement("tr");
      for (var ci = 0; ci < visibleIds.length; ci++) {
        appendOvertimeDataCell(tr, visibleIds[ci], item, mf, ev);
      }
      tbody.appendChild(tr);
    }

    table.appendChild(thead);
    table.appendChild(tbody);
    container.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.className = "overtime-scroll";
    wrap.appendChild(table);
    container.appendChild(wrap);

    applyOvertimeEditModeUi();

    if (orphansEl) {
      var orphans = state.orphans || [];
      if (orphans.length === 0) {
        orphansEl.hidden = true;
        orphansEl.innerHTML = "";
      } else {
        orphansEl.hidden = false;
        var parts = [
          "<p class=\"overtime-orphans__title\"><strong>社員リストに未登録の従業員番号（CSVのみ）</strong>（",
          String(orphans.length),
          "件）</p><ul class=\"overtime-orphans__list\">",
        ];
        for (var o = 0; o < orphans.length; o++) {
          var or = orphans[o];
          parts.push("<li>");
          parts.push(escapeHtml(or.employeeId || ""));
          parts.push(" — ");
          parts.push(escapeHtml(or.mfName || ""));
          parts.push("</li>");
        }
        parts.push("</ul>");
        orphansEl.innerHTML = parts.join("");
      }
    }
    updateOvertimeColumnAddPanel(kind, limits);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function readOvertimeLimitsFromDom() {
    var metricSel = qs("overtime-monthly-metric");
    var stored = loadOvertimeLimits();
    return {
      monthlyMetric: metricSel && metricSel.value === "kyotei36sum" ? "kyotei36sum" : "tokubetsu",
      approachRatio: getEffectiveApproachRatio(stored.approachRatio),
    };
  }

  function syncOvertimeExportButton() {
    var btn = qs("btn-overtime-export-xlsx");
    if (!btn) return;
    var has = !!overtimeState;
    btn.disabled = !has;
    btn.title = has
      ? "表示中の列と判定結果を Excel（.xlsx）でダウンロードします"
      : "先に MF 勤怠の CSV を取り込んでください";
  }

  function setOvertimeExportStatusMessage(msg, clearAfterMs) {
    var el = qs("overtime-export-status");
    if (!el) return;
    if (overtimeExportStatusTimer) {
      clearTimeout(overtimeExportStatusTimer);
      overtimeExportStatusTimer = null;
    }
    el.textContent = msg || "";
    if (msg && clearAfterMs > 0) {
      overtimeExportStatusTimer = setTimeout(function () {
        el.textContent = "";
        overtimeExportStatusTimer = null;
      }, clearAfterMs);
    }
  }

  function applyOvertimeXlsxThinBorder(cell) {
    var c = { argb: "FFCBD5E1" };
    cell.border = {
      top: { style: "thin", color: c },
      left: { style: "thin", color: c },
      bottom: { style: "thin", color: c },
      right: { style: "thin", color: c },
    };
  }

  function applyOvertimeXlsxCellStyle(cell, variant, isHeader) {
    var base = { name: "Yu Gothic", size: 10 };
    if (isHeader) {
      cell.font = Object.assign({}, base, { bold: true, color: { argb: "FF1E293B" } });
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE2E8F0" },
      };
      cell.alignment = { vertical: "middle", wrapText: true };
      return;
    }
    cell.alignment = { vertical: "middle", wrapText: false };
    switch (variant) {
      case "muted":
        cell.font = Object.assign({}, base, { color: { argb: "FF64748B" } });
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF1F5F9" },
        };
        break;
      case "warn":
        cell.font = Object.assign({}, base, { bold: true, color: { argb: "FFA16207" } });
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFEF9C3" },
        };
        break;
      case "approach":
        cell.font = Object.assign({}, base, { bold: true, color: { argb: "FFB45309" } });
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFEF08A" },
        };
        break;
      case "over":
        cell.font = Object.assign({}, base, { bold: true, color: { argb: "FFB91C1C" } });
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFEE2E2" },
        };
        break;
      case "ok":
        cell.font = Object.assign({}, base, { bold: true, color: { argb: "FF15803D" } });
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFDCFCE7" },
        };
        break;
      default:
        cell.font = Object.assign({}, base, { color: { argb: "FF0F172A" } });
        break;
    }
  }

  function buildOvertimeXlsxWorkbook(state, limits) {
    if (typeof ExcelJS === "undefined") {
      throw new Error("ExcelJS が読み込まれていません（vendor/exceljs.min.js を確認してください）。");
    }
    var wb = new ExcelJS.Workbook();
    wb.creator = "WorkHelper";
    wb.created = new Date();

    var merged = state.merged || [];
    var kind = state.colMap && state.colMap.kind ? state.colMap.kind : "overtime";
    var vis = loadOvertimeColumnVisibility();
    var visibleIds = [];
    for (var vi = 0; vi < OVERTIME_COLUMN_ORDER.length; vi++) {
      var cid = OVERTIME_COLUMN_ORDER[vi].id;
      if (isOvertimeColumnVisible(cid, vis)) visibleIds.push(cid);
    }
    var colCount = Math.max(1, visibleIds.length);

    var ws = wb.addWorksheet("時間外一覧", {
      views: [{ state: "frozen", ySplit: 1, activeCell: "A2", showGridLines: true }],
    });

    var headers = [];
    for (var hi = 0; hi < visibleIds.length; hi++) {
      headers.push(overtimeColumnHeading(visibleIds[hi], kind, limits));
    }
    var headerRow = ws.addRow(headers);
    headerRow.height = 22;
    headerRow.eachCell({ includeEmpty: true }, function (cell) {
      applyOvertimeXlsxCellStyle(cell, "plain", true);
      applyOvertimeXlsxThinBorder(cell);
    });

    if (merged.length === 0) {
      var emptyMsg = "社員リストに行がありません。先に社員リストで社員を登録してください。";
      var er = ws.addRow([emptyMsg]);
      if (colCount > 1) {
        ws.mergeCells(2, 1, 2, colCount);
      }
      var emptyCell = er.getCell(1);
      emptyCell.value = emptyMsg;
      applyOvertimeXlsxCellStyle(emptyCell, "muted", false);
      applyOvertimeXlsxThinBorder(emptyCell);
    } else {
      for (var ri = 0; ri < merged.length; ri++) {
        var item = merged[ri];
        var mf = item.mf;
        var ev = evaluateOvertimeRow(mf, limits, item.listDept);
        var texts = [];
        var variants = [];
        for (var ci = 0; ci < visibleIds.length; ci++) {
          var p = getOvertimeCellPresentation(visibleIds[ci], item, mf, ev);
          texts.push(p.text);
          variants.push(p.variant);
        }
        var dataRow = ws.addRow(texts);
        for (var di = 0; di < variants.length; di++) {
          var cell = dataRow.getCell(di + 1);
          applyOvertimeXlsxCellStyle(cell, variants[di], false);
          applyOvertimeXlsxThinBorder(cell);
        }
      }
    }

    var lastRow = merged.length === 0 ? 2 : merged.length + 1;
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: lastRow, column: colCount },
    };

    var maxW = 42;
    for (var wi = 0; wi < visibleIds.length; wi++) {
      var hlen = String(headers[wi] || "").length;
      var maxlen = hlen;
      for (var wr = 0; wr < merged.length; wr++) {
        var itemW = merged[wr];
        var mfW = itemW.mf;
        var evW = evaluateOvertimeRow(mfW, limits, itemW.listDept);
        var pw = getOvertimeCellPresentation(visibleIds[wi], itemW, mfW, evW);
        maxlen = Math.max(maxlen, String(pw.text || "").length);
      }
      var wch = Math.min(maxW, Math.max(10, Math.ceil(maxlen * 1.05 + 2)));
      ws.getColumn(wi + 1).width = wch;
    }

    var meta = wb.addWorksheet("エクスポート情報");
    meta.getColumn(1).width = 22;
    meta.getColumn(2).width = 72;
    var exportedAt = new Date().toISOString();
    var kindJa =
      kind === "monthly" ? "月次の勤怠集計（想定）" : "法定外・休日労働時間レポート（想定）";
    var metricJa =
      limits.monthlyMetric === "kyotei36sum"
        ? "36協定（平日＋所定休日法定外のみ）"
        : "特別条項（平日・所定休日法定外＋法定休日）";
    var psMeta = loadOvertimePeriodSettings();
    var yearWinMeta = getYearAggregationMonthsAndMeta(psMeta);
    var rollMetaTxt =
      psMeta.useHistoryAggregation !== false
        ? "ON（終了月 " +
          (psMeta.rollingEndYm || "最新") +
          " · 対象 " +
          (psMeta.rollingMonths != null ? psMeta.rollingMonths : 5) +
          " ヶ月平均）"
        : "OFF（CSVの複数月列のみ）";
    var fyMetaTxt =
      psMeta.useHistoryAggregation !== false
        ? "ON（" + yearWinMeta.meta + "の合計）"
        : "OFF（CSVの年度累計列のみ）";
    var metaRows = [
      ["エクスポート日時（ISO）", exportedAt],
      ["アプリバージョン", APP_VERSION],
      ["CSVレポート種別（自動判定）", kindJa],
      ["月間の比較に使う指標", metricJa],
      [
        "黄信号しきい値（比較値が上限の何％以上で未超過）",
        String(Math.round(getEffectiveApproachRatio(limits.approachRatio) * 100)) + "%",
      ],
      ["月次履歴スナップショット数", String(loadOvertimeMonthlyHistory().snapshots.length)],
      ["6ヶ月平均の集計", rollMetaTxt],
      ["1年合計の集計", fyMetaTxt],
      ["データ行数", String(merged.length)],
      ["出力列", headers.join(" / ")],
      [
        "注意",
        "法的助言ではありません。MF勤怠のCSVと社員リスト・36協定値設定に基づく社内確認用です。",
      ],
    ];
    for (var mi = 0; mi < metaRows.length; mi++) {
      var mr = meta.addRow(metaRows[mi]);
      mr.getCell(1).font = { name: "Yu Gothic", size: 10, bold: true };
      mr.getCell(2).font = { name: "Yu Gothic", size: 10 };
      mr.getCell(2).alignment = { wrapText: true, vertical: "top" };
    }

    return wb;
  }

  function triggerOvertimeXlsxDownload(buffer, filename) {
    var blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 2500);
  }

  function runOvertimeXlsxExport() {
    if (!overtimeState) return;
    var btn = qs("btn-overtime-export-xlsx");
    if (btn) {
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
      btn.textContent = "出力中…";
    }
    setOvertimeExportStatusMessage("", 0);
    var lim = readOvertimeLimitsFromDom();
    var wb;
    try {
      wb = buildOvertimeXlsxWorkbook(overtimeState, lim);
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.removeAttribute("aria-busy");
        btn.textContent = "Excelにエクスポート";
      }
      syncOvertimeExportButton();
      alert(err && err.message ? err.message : String(err));
      return;
    }
    wb.xlsx
      .writeBuffer()
      .then(function (buffer) {
        var d = new Date();
        function pad2(n) {
          return (n < 10 ? "0" : "") + n;
        }
        var fname =
          "WorkHelper_時間外36協定_" +
          d.getFullYear() +
          pad2(d.getMonth() + 1) +
          pad2(d.getDate()) +
          "_" +
          pad2(d.getHours()) +
          pad2(d.getMinutes()) +
          pad2(d.getSeconds()) +
          ".xlsx";
        triggerOvertimeXlsxDownload(buffer, fname);
        setOvertimeExportStatusMessage("ダウンロードしました（" + fname + "）", 4500);
      })
      .catch(function (err) {
        alert(
          "Excel の出力に失敗しました: " + (err && err.message ? err.message : String(err))
        );
      })
      .then(function () {
        if (btn) {
          btn.removeAttribute("aria-busy");
          btn.textContent = "Excelにエクスポート";
        }
        syncOvertimeExportButton();
      });
  }

  function refreshOvertimeViewFromState() {
    renderOvertimeMonthlyHistorySummary();
    var container = qs("overtime-report-container");
    var orphansEl = qs("overtime-orphans");
    if (!container) return;
    if (!overtimeState) {
      container.innerHTML =
        "<p class=\"overtime-placeholder\">CSVを選択すると、社員リスト順の一覧が表示されます。</p>";
      if (orphansEl) {
        orphansEl.hidden = true;
        orphansEl.innerHTML = "";
      }
      applyOvertimeEditModeUi();
      updateOvertimeColumnAddPanel(null, readOvertimeLimitsFromDom());
      syncOvertimeExportButton();
      setOvertimeMonthlyHistoryBannerVisible(false);
      return;
    }
    var lim = readOvertimeLimitsFromDom();
    enrichMergedWithPeriodMetrics(overtimeState.merged, lim);
    renderOvertimeReport(container, orphansEl, overtimeState, lim);
    syncOvertimeExportButton();
  }

  function loadKyoteiEditorColumnVisibility() {
    var vis = { mNormal: true, mSpecial: true, avg6: true, yTotal: true };
    try {
      var raw = whGet(OVERTIME_KYOTEI_EDITOR_COL_VIS_KEY);
      if (!raw) return vis;
      var p = JSON.parse(raw);
      if (!p || typeof p !== "object") return vis;
      for (var k in vis) {
        if (Object.prototype.hasOwnProperty.call(p, k)) vis[k] = !!p[k];
      }
      return vis;
    } catch (err) {
      return vis;
    }
  }

  function saveKyoteiEditorColumnVisibility(vis) {
    try {
      whSet(OVERTIME_KYOTEI_EDITOR_COL_VIS_KEY, JSON.stringify(vis));
    } catch (err) {}
  }

  function hideKyoteiEditorColumn(colId) {
    if (colId === "dept") return;
    var vis = loadKyoteiEditorColumnVisibility();
    if (vis[colId] === false) return;
    var next = {};
    for (var k in vis) {
      if (Object.prototype.hasOwnProperty.call(vis, k)) next[k] = vis[k];
    }
    next[colId] = false;
    var remain = 0;
    for (var j = 0; j < KYOTEI_EDITOR_NUM_COLS.length; j++) {
      var id = KYOTEI_EDITOR_NUM_COLS[j].id;
      if (next[id] !== false) remain++;
    }
    if (remain < 1) {
      alert("数値列は最低1列表示してください。");
      return;
    }
    vis[colId] = false;
    saveKyoteiEditorColumnVisibility(vis);
    fillKyoteiSettingsTable();
    applyKyoteiDialogEditModeUi();
  }

  function applyKyoteiDialogEditModeUi() {
    var dlg = qs("overtime-kyotei-dialog");
    var btn = qs("btn-overtime-kyotei-edit-mode");
    if (dlg) dlg.classList.toggle("overtime-kyotei-dialog--edit-mode", kyoteiDialogEditMode);
    if (btn) {
      btn.textContent = kyoteiDialogEditMode ? "編集モード終了" : "編集モード";
      btn.setAttribute("aria-pressed", kyoteiDialogEditMode ? "true" : "false");
    }
    if (dlg) {
      var inputs = dlg.querySelectorAll(".overtime-kyotei-input");
      for (var i = 0; i < inputs.length; i++) {
        inputs[i].readOnly = !kyoteiDialogEditMode;
      }
      var apIn = qs("overtime-kyotei-approach-pct");
      if (apIn) apIn.readOnly = !kyoteiDialogEditMode;
    }
  }

  function syncKyoteiApproachInputFromStorage() {
    var inp = qs("overtime-kyotei-approach-pct");
    if (!inp) return;
    var lim = loadOvertimeLimits();
    inp.value = String(Math.round(getEffectiveApproachRatio(lim.approachRatio) * 100));
  }

  function createKyoteiTableRow(data) {
    var vis = loadKyoteiEditorColumnVisibility();
    var tr = document.createElement("tr");
    var dept = data && data.dept != null ? String(data.dept) : "";
    var mn = data && !isNaN(data.mNormal) ? String(data.mNormal) : "";
    var ms = data && !isNaN(data.mSpecial) ? String(data.mSpecial) : "";
    var a6 = data && !isNaN(data.avg6) ? String(data.avg6) : "";
    var yt = data && !isNaN(data.yTotal) ? String(data.yTotal) : "";
    function cellInput(cls, val, attr) {
      var td = document.createElement("td");
      td.setAttribute("data-kyotei-col", attr);
      var inp = document.createElement("input");
      inp.type = attr === "dept" ? "text" : "number";
      inp.className = "overtime-kyotei-input" + (attr === "dept" ? " overtime-kyotei-input--dept" : "");
      inp.value = val;
      inp.setAttribute("data-kyotei-field", attr);
      if (attr !== "dept") {
        inp.min = "0";
        inp.step = "0.01";
      }
      inp.readOnly = !kyoteiDialogEditMode;
      td.appendChild(inp);
      return td;
    }
    tr.appendChild(cellInput("overtime-kyotei-input overtime-kyotei-input--dept", dept, "dept"));
    for (var c = 0; c < KYOTEI_EDITOR_NUM_COLS.length; c++) {
      var cid = KYOTEI_EDITOR_NUM_COLS[c].id;
      if (vis[cid] === false) continue;
      if (cid === "mNormal") tr.appendChild(cellInput("", mn, "mNormal"));
      else if (cid === "mSpecial") tr.appendChild(cellInput("", ms, "mSpecial"));
      else if (cid === "avg6") tr.appendChild(cellInput("", a6, "avg6"));
      else if (cid === "yTotal") tr.appendChild(cellInput("", yt, "yTotal"));
    }
    var tdOp = document.createElement("td");
    tdOp.className = "overtime-kyotei-td-op overtime-kyotei-edit-only";
    tdOp.setAttribute("data-kyotei-col", "op");
    var delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "overtime-kyotei-row-del secondary";
    delBtn.textContent = "行削除";
    delBtn.setAttribute("data-kyotei-del-row", "1");
    tdOp.appendChild(delBtn);
    tr.appendChild(tdOp);
    return tr;
  }

  function clearKyoteiMonthlyNumericSignals(tr) {
    var fields = ["mNormal", "mSpecial"];
    for (var i = 0; i < fields.length; i++) {
      var inp = tr.querySelector("[data-kyotei-field=\"" + fields[i] + "\"]");
      if (inp) {
        inp.classList.remove("overtime-kyotei-input--signal-warn");
        inp.classList.remove("overtime-kyotei-input--signal-over");
      }
    }
  }

  /** 36協定ダイアログ: 通常＞特別は赤、通常が特別の80%以上なら黄（余裕が少ない） */
  function refreshKyoteiRowNumericSignals(tr) {
    if (!tr) return;
    clearKyoteiMonthlyNumericSignals(tr);
    var inN = tr.querySelector("[data-kyotei-field=\"mNormal\"]");
    var inS = tr.querySelector("[data-kyotei-field=\"mSpecial\"]");
    if (!inN || !inS) return;
    var n = parseFloat(String(inN.value || "").replace(/,/g, "."));
    var s = parseFloat(String(inS.value || "").replace(/,/g, "."));
    if (isNaN(n) || isNaN(s)) return;
    if (n > s) {
      inN.classList.add("overtime-kyotei-input--signal-over");
      inS.classList.add("overtime-kyotei-input--signal-over");
      return;
    }
    var ar = getLiveApproachRatioForSignals();
    if (s > 0 && n >= s * ar) {
      inN.classList.add("overtime-kyotei-input--signal-warn");
      inS.classList.add("overtime-kyotei-input--signal-warn");
    }
  }

  function refreshKyoteiDialogAllRowSignals() {
    var tb = qs("overtime-kyotei-tbody");
    if (!tb) return;
    var trs = tb.querySelectorAll("tr");
    for (var ri = 0; ri < trs.length; ri++) {
      refreshKyoteiRowNumericSignals(trs[ri]);
    }
  }

  function wireKyoteiDialogSignalInputs() {
    var kyDlg = qs("overtime-kyotei-dialog");
    if (!kyDlg || kyDlg.dataset.signalInputWired) return;
    kyDlg.dataset.signalInputWired = "1";
    kyDlg.addEventListener("input", function (e) {
      var t = e.target;
      if (!t) return;
      if (t.id === "overtime-kyotei-approach-pct") {
        refreshKyoteiDialogAllRowSignals();
        return;
      }
      if (!t.getAttribute) return;
      var f = t.getAttribute("data-kyotei-field");
      if (f !== "mNormal" && f !== "mSpecial") return;
      var tr = t.closest ? t.closest("tr") : null;
      if (tr) refreshKyoteiRowNumericSignals(tr);
    });
  }

  function fillKyoteiSettingsTable() {
    var thead = qs("overtime-kyotei-thead");
    var tbody = qs("overtime-kyotei-tbody");
    if (!thead || !tbody) return;
    thead.innerHTML = "";
    tbody.innerHTML = "";
    var vis = loadKyoteiEditorColumnVisibility();
    var trh = document.createElement("tr");

    var thDept = document.createElement("th");
    thDept.setAttribute("data-kyotei-col", "dept");
    var innerDept = document.createElement("div");
    innerDept.className = "overtime-kyotei-th-inner";
    var labDept = document.createElement("span");
    labDept.className = "overtime-kyotei-th-label";
    labDept.textContent = "所属";
    innerDept.appendChild(labDept);
    thDept.appendChild(innerDept);
    trh.appendChild(thDept);

    for (var h = 0; h < KYOTEI_EDITOR_NUM_COLS.length; h++) {
      var def = KYOTEI_EDITOR_NUM_COLS[h];
      if (vis[def.id] === false) continue;
      var th = document.createElement("th");
      th.setAttribute("data-kyotei-col", def.id);
      var inner = document.createElement("div");
      inner.className = "overtime-kyotei-th-inner";
      var lab = document.createElement("span");
      lab.className = "overtime-kyotei-th-label";
      lab.textContent = def.label;
      inner.appendChild(lab);
      var delCol = document.createElement("button");
      delCol.type = "button";
      delCol.className = "overtime-kyotei-col-del secondary overtime-kyotei-edit-only";
      delCol.textContent = "列削除";
      delCol.setAttribute("data-kyotei-hide-col", def.id);
      delCol.title = "この列を非表示にします";
      inner.appendChild(delCol);
      th.appendChild(inner);
      trh.appendChild(th);
    }

    var thOp = document.createElement("th");
    thOp.className = "overtime-kyotei-th-op overtime-kyotei-edit-only";
    thOp.setAttribute("data-kyotei-col", "op");
    thOp.setAttribute("aria-label", "行操作");
    trh.appendChild(thOp);
    thead.appendChild(trh);

    var pack = loadKyoteiRules();
    var rows = pack.rows && pack.rows.length ? pack.rows : defaultKyoteiRules().rows;
    for (var i = 0; i < rows.length; i++) {
      tbody.appendChild(createKyoteiTableRow(rows[i]));
    }
    applyKyoteiDialogEditModeUi();
    syncKyoteiApproachInputFromStorage();
    refreshKyoteiDialogAllRowSignals();
  }

  function collectKyoteiRowsFromDialog() {
    var tbody = qs("overtime-kyotei-tbody");
    if (!tbody) return [];
    var out = [];
    var trs = tbody.querySelectorAll("tr");
    for (var i = 0; i < trs.length; i++) {
      var tr = trs[i];
      function val(attr) {
        var el = tr.querySelector("[data-kyotei-field=\"" + attr + "\"]");
        return el ? String(el.value || "").trim() : "";
      }
      var dept = val("dept");
      if (!dept) continue;
      function numOrZero(attr) {
        var s = val(attr);
        if (!s) return 0;
        var n = parseFloat(s.replace(/,/g, "."));
        return isNaN(n) ? 0 : n;
      }
      out.push({
        dept: dept,
        mNormal: numOrZero("mNormal"),
        mSpecial: numOrZero("mSpecial"),
        avg6: numOrZero("avg6"),
        yTotal: numOrZero("yTotal"),
      });
    }
    return out;
  }

  function openKyoteiSettingsDialog() {
    var dlg = qs("overtime-kyotei-dialog");
    if (!dlg) return;
    wireKyoteiDialogSignalInputs();
    kyoteiDialogEditMode = false;
    fillKyoteiSettingsTable();
    dlg.hidden = false;
    dlg.classList.add("is-open");
    dlg.setAttribute("aria-hidden", "false");
  }

  function closeKyoteiSettingsDialog() {
    var dlg = qs("overtime-kyotei-dialog");
    if (!dlg) return;
    kyoteiDialogEditMode = false;
    dlg.classList.remove("overtime-kyotei-dialog--edit-mode");
    dlg.classList.remove("is-open");
    dlg.hidden = true;
    dlg.setAttribute("aria-hidden", "true");
    applyKyoteiDialogEditModeUi();
    syncKyoteiApproachInputFromStorage();
  }

  function saveKyoteiSettingsDialog() {
    var rows = collectKyoteiRowsFromDialog();
    if (rows.length === 0) {
      if (!confirm("所属が1件もありません。このまま保存すると、次回読み込み時に既定の表が使われます。よろしいですか？")) {
        return;
      }
      saveKyoteiRules({ rows: [] });
    } else {
      saveKyoteiRules({ rows: rows });
    }
    var pctIn = qs("overtime-kyotei-approach-pct");
    var pct = 80;
    if (pctIn && String(pctIn.value).trim() !== "") {
      var pv = parseInt(String(pctIn.value), 10);
      if (!isNaN(pv)) pct = Math.min(100, Math.max(1, pv));
    }
    var domLim = readOvertimeLimitsFromDom();
    saveOvertimeLimits({
      monthlyMetric: domLim.monthlyMetric,
      approachRatio: pct / 100,
    });
    closeKyoteiSettingsDialog();
    refreshOvertimeViewFromState();
  }

  function initOvertimeView() {
    var root = qs("view-overtime");
    if (!root || root.dataset.overtimeWired) return;
    root.dataset.overtimeWired = "1";

    root.addEventListener("click", function (e) {
      var t = e.target;
      if (!t) return;
      if (t.id === "btn-overtime-edit-mode") {
        overtimeEditMode = !overtimeEditMode;
        applyOvertimeEditModeUi();
        refreshOvertimeViewFromState();
        return;
      }
      var periodBtn =
        t.id === "btn-overtime-period-toggle"
          ? t
          : t.closest
            ? t.closest("#btn-overtime-period-toggle")
            : null;
      if (periodBtn) {
        var periodPanel = qs("overtime-period-panel");
        if (periodPanel) {
          var nowCollapsed = periodPanel.classList.toggle("overtime-period-panel--collapsed");
          periodBtn.setAttribute("aria-expanded", nowCollapsed ? "false" : "true");
        }
        return;
      }
      var addColEl = t.closest ? t.closest("[data-add-overtime-col]") : null;
      if (addColEl && overtimeEditMode) {
        var addId = addColEl.getAttribute("data-add-overtime-col");
        if (addId) addOvertimeDisplayColumn(addId);
        return;
      }
      if (t.id === "btn-overtime-kyotei-settings") {
        openKyoteiSettingsDialog();
        return;
      }
      if (t.id === "btn-overtime-export-xlsx") {
        runOvertimeXlsxExport();
        return;
      }
      if (t.id === "btn-overtime-save-period") {
        collectOvertimePeriodSettingsFromDom();
        refreshOvertimeViewFromState();
        return;
      }
      if (t.id === "btn-overtime-append-history") {
        var ymIn = qs("overtime-import-history-ym");
        var ym = ymIn && ymIn.value ? String(ymIn.value).trim() : "";
        if (!overtimePendingMonthlyPack || !overtimePendingMonthlyPack.rows) {
          alert("先に月次勤怠集計のCSVを取り込んでください。");
          return;
        }
        if (!parseYm(ym)) {
          alert("年月を選択してください。");
          return;
        }
        try {
          appendOvertimeMonthlyHistorySnapshot(ym, overtimePendingMonthlyPack.rows);
          overtimePendingMonthlyPack = null;
          setOvertimeMonthlyHistoryBannerVisible(false);
          refreshOvertimeViewFromState();
        } catch (err2) {
          alert(err2 && err2.message ? err2.message : String(err2));
        }
        return;
      }
      var delEl = t.closest ? t.closest("[data-del-overtime-col]") : null;
      if (delEl && overtimeEditMode) {
        var cid = delEl.getAttribute("data-del-overtime-col");
        if (cid) removeOvertimeDisplayColumn(cid);
      }
    });

    var fileInput = qs("input-overtime-csv-import");
    var metricSel = qs("overtime-monthly-metric");

    var saved = loadOvertimeLimits();
    if (metricSel) metricSel.value = saved.monthlyMetric;

    function persistLimits() {
      saveOvertimeLimits(readOvertimeLimitsFromDom());
      refreshOvertimeViewFromState();
    }

    if (metricSel) metricSel.addEventListener("change", persistLimits);

    var kyDlg = qs("overtime-kyotei-dialog");
    if (kyDlg) {
      kyDlg.addEventListener("click", function (e) {
        var t = e.target;
        if (!t) return;
        if (t.getAttribute("data-overtime-kyotei-close")) {
          closeKyoteiSettingsDialog();
          return;
        }
        if (t.id === "btn-overtime-kyotei-cancel") {
          closeKyoteiSettingsDialog();
          return;
        }
        if (t.id === "btn-overtime-kyotei-save") {
          saveKyoteiSettingsDialog();
          return;
        }
        if (t.id === "btn-overtime-kyotei-edit-mode") {
          kyoteiDialogEditMode = !kyoteiDialogEditMode;
          applyKyoteiDialogEditModeUi();
          return;
        }
        var hideCol = t.getAttribute && t.getAttribute("data-kyotei-hide-col");
        if (hideCol) {
          if (!kyoteiDialogEditMode) return;
          hideKyoteiEditorColumn(hideCol);
          return;
        }
        if (t.id === "btn-overtime-kyotei-add-row") {
          var tb = qs("overtime-kyotei-tbody");
          if (tb) {
            var newTr = createKyoteiTableRow(null);
            tb.appendChild(newTr);
            applyKyoteiDialogEditModeUi();
            refreshKyoteiRowNumericSignals(newTr);
          }
          return;
        }
        if (t.closest && t.closest("[data-kyotei-del-row]")) {
          var trd = t.closest("tr");
          var tb2 = qs("overtime-kyotei-tbody");
          if (trd && tb2) {
            var n = tb2.querySelectorAll("tr").length;
            if (n <= 1) {
              alert("最後の1行は削除できません。");
            } else {
              trd.remove();
            }
          }
        }
      });
    }

    if (fileInput) {
      fileInput.addEventListener("change", function () {
        var file = fileInput.files && fileInput.files[0];
        fileInput.value = "";
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var text = decodeMoneyForwardCsvFile(reader.result);
            var parsed = parseMoneyForwardOvertimeCsv(text);
            var sheet = loadEmployeeSheet();
            var mergedPack = mergeEmployeeListWithMfRows(sheet, parsed.rows);
            overtimeState = {
              merged: mergedPack.merged,
              orphans: mergedPack.orphans,
              colMap: parsed.colMap,
            };
            if (parsed.colMap && parsed.colMap.kind === "monthly") {
              overtimePendingMonthlyPack = { rows: parsed.rows };
              setOvertimeMonthlyHistoryBannerVisible(true);
              var ymInput = qs("overtime-import-history-ym");
              if (ymInput) {
                var d = new Date();
                ymInput.value = d.getFullYear() + "-" + pad2(d.getMonth() + 1);
              }
            } else {
              overtimePendingMonthlyPack = null;
              setOvertimeMonthlyHistoryBannerVisible(false);
            }
            refreshOvertimeViewFromState();
          } catch (err) {
            alert(
              "CSVの読み込みに失敗しました: " +
                (err && err.message ? err.message : String(err))
            );
          }
        };
        reader.onerror = function () {
          alert("ファイルを読めませんでした。");
        };
        reader.readAsArrayBuffer(file);
      });
    }

    var rootOv = qs("view-overtime");
    if (rootOv && !rootOv.dataset.whYearModeWired) {
      rootOv.dataset.whYearModeWired = "1";
      var ymc2 = qs("overtime-year-mode-calendar");
      var ymr2 = qs("overtime-year-mode-rolling");
      var onYearModeChange = function () {
        updateOvertimeYearModeMicroUi();
      };
      if (ymc2) ymc2.addEventListener("change", onYearModeChange);
      if (ymr2) ymr2.addEventListener("change", onYearModeChange);
    }

    syncOvertimePeriodFieldsToDom();
    applyOvertimeEditModeUi();
    syncOvertimeExportButton();
  }

  function normalizeImportedEmployees(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (!Array.isArray(raw.columns) || raw.columns.length === 0) return null;
    var cols = raw.columns.map(String).slice(0, EMPLOYEE_COL_MAX);
    var rowsIn = Array.isArray(raw.rows) ? raw.rows : [];
    var rows = [];
    for (var i = 0; i < rowsIn.length; i++) {
      var row = Array.isArray(rowsIn[i]) ? rowsIn[i].map(String) : [];
      while (row.length < cols.length) row.push("");
      row.length = cols.length;
      rows.push(row);
    }
    return { v: 1, columns: cols, rows: rows };
  }

  function collectEmployeeSheetFromDom() {
    var table = qs("employee-table");
    if (!table || !table.querySelector("thead")) return loadEmployeeSheet();
    var ths = table.querySelectorAll("thead tr th.employee-th");
    var cols = [];
    for (var i = 0; i < ths.length; i++) {
      var inp = ths[i].querySelector("input.employee-col-header");
      cols.push(inp ? String(inp.value) : "");
    }
    if (cols.length === 0) return defaultEmployeeSheet();
    var trs = table.querySelectorAll("tbody tr");
    var rows = [];
    for (var r = 0; r < trs.length; r++) {
      var tds = trs[r].querySelectorAll("td.employee-data");
      var row = [];
      for (var c = 0; c < tds.length; c++) {
        var cellInp = tds[c].querySelector("input.employee-cell");
        row.push(cellInp ? String(cellInp.value) : "");
      }
      while (row.length < cols.length) row.push("");
      row.length = cols.length;
      rows.push(row);
    }
    return { v: 1, columns: cols, rows: rows };
  }

  function renderEmployeesView() {
    var table = qs("employee-table");
    if (!table) return;
    var sheet = loadEmployeeSheet();
    var cols = sheet.columns;
    var rows = sheet.rows;
    table.innerHTML = "";

    var thead = document.createElement("thead");
    var trh = document.createElement("tr");
    for (var c = 0; c < cols.length; c++) {
      var th = document.createElement("th");
      th.className = "employee-th";
      var inner = document.createElement("div");
      inner.className = "employee-th-inner";
      var hinp = document.createElement("input");
      hinp.type = "text";
      hinp.className = "employee-col-header";
      hinp.value = cols[c];
      hinp.setAttribute("aria-label", "列見出し " + (c + 1));
      inner.appendChild(hinp);
      var delCol = document.createElement("button");
      delCol.type = "button";
      delCol.className = "employee-icon-btn employee-del-col";
      delCol.textContent = "列削除";
      delCol.setAttribute("data-del-col", String(c));
      delCol.title = c === 0 ? "先頭列（社員番号）を削除" : "この列を削除";
      inner.appendChild(delCol);
      th.appendChild(inner);
      trh.appendChild(th);
    }
    var thOp = document.createElement("th");
    thOp.className = "employee-th-op";
    thOp.setAttribute("aria-label", "行操作");
    trh.appendChild(thOp);
    thead.appendChild(trh);

    var tbody = document.createElement("tbody");
    for (var r = 0; r < rows.length; r++) {
      var tr = document.createElement("tr");
      for (var c2 = 0; c2 < cols.length; c2++) {
        var td = document.createElement("td");
        td.className = "employee-data";
        var inp = document.createElement("input");
        inp.type = "text";
        inp.className = "employee-cell";
        inp.value = rows[r][c2] != null ? String(rows[r][c2]) : "";
        inp.setAttribute("aria-label", "行" + (r + 1) + " 列" + (c2 + 1));
        td.appendChild(inp);
        tr.appendChild(td);
      }
      var tdR = document.createElement("td");
      tdR.className = "employee-td-op";
      var opStack = document.createElement("div");
      opStack.className = "employee-op-stack";

      var btnUp = document.createElement("button");
      btnUp.type = "button";
      btnUp.className = "employee-icon-btn employee-icon-btn--narrow employee-move-btn";
      btnUp.textContent = "上へ";
      btnUp.setAttribute("data-move-up", String(r));
      btnUp.title = "ひとつ上の行と入れ替え";
      if (r === 0) {
        btnUp.disabled = true;
        btnUp.title = "これ以上上に移動できません";
      }

      var btnDown = document.createElement("button");
      btnDown.type = "button";
      btnDown.className = "employee-icon-btn employee-icon-btn--narrow employee-move-btn";
      btnDown.textContent = "下へ";
      btnDown.setAttribute("data-move-down", String(r));
      btnDown.title = "ひとつ下の行と入れ替え";
      if (r >= rows.length - 1) {
        btnDown.disabled = true;
        btnDown.title = "これ以上下に移動できません";
      }

      var delRow = document.createElement("button");
      delRow.type = "button";
      delRow.className = "employee-icon-btn employee-del-row";
      delRow.textContent = "行削除";
      delRow.setAttribute("data-del-row", String(r));
      delRow.title = "この行を削除";

      opStack.appendChild(btnUp);
      opStack.appendChild(btnDown);
      opStack.appendChild(delRow);
      tdR.appendChild(opStack);
      tr.appendChild(tdR);
      tbody.appendChild(tr);
    }

    table.appendChild(thead);
    table.appendChild(tbody);
    applyEmployeeEditModeUi();
  }

  function initEmployeesView() {
    var root = qs("view-employees");
    if (!root || root.dataset.employeesWired) return;
    root.dataset.employeesWired = "1";
    var saveTimer = null;
    function debounceSave() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        saveEmployeeSheet(collectEmployeeSheetFromDom());
      }, 400);
    }
    root.addEventListener("input", function (e) {
      if (
        e.target &&
        e.target.matches &&
        e.target.matches("input.employee-col-header, input.employee-cell")
      ) {
        debounceSave();
      }
    });
    root.addEventListener("click", function (e) {
      var t = e.target;
      if (!t) return;
      if (t.id === "btn-employee-csv-template") {
        var csvStr = employeesSheetToCsv(loadEmployeeSheet());
        var blob = new Blob([csvStr], { type: "text/csv;charset=utf-8" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "社員リスト_テンプレート.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }
      if (t.id === "btn-employee-add-row") {
        if (!employeeEditMode) {
          alert("行を追加するには、先に「編集モード」をオンにしてください。");
          return;
        }
        var s = collectEmployeeSheetFromDom();
        var nr = [];
        for (var i = 0; i < s.columns.length; i++) nr.push("");
        s.rows.push(nr);
        saveEmployeeSheet(s);
        renderEmployeesView();
        return;
      }
      if (t.id === "btn-employee-add-col") {
        if (!employeeEditMode) {
          alert("列を追加するには、先に「編集モード」をオンにしてください。");
          return;
        }
        var s2 = collectEmployeeSheetFromDom();
        if (s2.columns.length >= EMPLOYEE_COL_MAX) {
          alert("列は最大 " + EMPLOYEE_COL_MAX + " までです。");
          return;
        }
        s2.columns.push("新しい列");
        s2.rows.forEach(function (row) {
          row.push("");
        });
        saveEmployeeSheet(s2);
        renderEmployeesView();
        return;
      }
      if (t.id === "btn-employee-edit-mode") {
        employeeEditMode = !employeeEditMode;
        applyEmployeeEditModeUi();
        return;
      }
      if (t.getAttribute("data-del-col") != null) {
        if (!employeeEditMode) {
          alert("列を削除するには、先に「編集モード」をオンにしてください。");
          return;
        }
        var ci = parseInt(t.getAttribute("data-del-col"), 10);
        if (isNaN(ci)) return;
        var s3 = collectEmployeeSheetFromDom();
        if (s3.columns.length <= 1) {
          alert("列は最低1列必要です。");
          return;
        }
        s3.columns.splice(ci, 1);
        s3.rows.forEach(function (row) {
          row.splice(ci, 1);
        });
        saveEmployeeSheet(s3);
        renderEmployeesView();
        return;
      }
      if (t.getAttribute("data-move-up") != null && !t.disabled) {
        if (!employeeEditMode) {
          alert("行の順序を入れ替えるには、先に「編集モード」をオンにしてください。");
          return;
        }
        var ru = parseInt(t.getAttribute("data-move-up"), 10);
        if (isNaN(ru) || ru <= 0) return;
        var su = collectEmployeeSheetFromDom();
        if (ru >= su.rows.length) return;
        var tmpU = su.rows[ru - 1];
        su.rows[ru - 1] = su.rows[ru];
        su.rows[ru] = tmpU;
        saveEmployeeSheet(su);
        renderEmployeesView();
        return;
      }
      if (t.getAttribute("data-move-down") != null && !t.disabled) {
        if (!employeeEditMode) {
          alert("行の順序を入れ替えるには、先に「編集モード」をオンにしてください。");
          return;
        }
        var rd = parseInt(t.getAttribute("data-move-down"), 10);
        if (isNaN(rd)) return;
        var sd = collectEmployeeSheetFromDom();
        if (rd < 0 || rd >= sd.rows.length - 1) return;
        var tmpD = sd.rows[rd + 1];
        sd.rows[rd + 1] = sd.rows[rd];
        sd.rows[rd] = tmpD;
        saveEmployeeSheet(sd);
        renderEmployeesView();
        return;
      }
      if (t.getAttribute("data-del-row") != null) {
        if (!employeeEditMode) {
          alert("行を削除するには、先に「編集モード」をオンにしてください。");
          return;
        }
        var ri = parseInt(t.getAttribute("data-del-row"), 10);
        if (isNaN(ri)) return;
        var s4 = collectEmployeeSheetFromDom();
        s4.rows.splice(ri, 1);
        saveEmployeeSheet(s4);
        renderEmployeesView();
        return;
      }
    });

    var csvInput = qs("input-employee-csv-import");
    if (csvInput) {
      csvInput.addEventListener("change", function () {
        var file = csvInput.files && csvInput.files[0];
        csvInput.value = "";
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var matrix = parseCsvToMatrix(String(reader.result || ""));
            var dataRows = matrix.length - 1;
            var truncated = dataRows > EMPLOYEE_ROW_MAX;
            var sheet = matrixToEmployeeSheet(matrix);
            if (
              !confirm(
                "現在の社員リスト（列名とすべての行）を、このCSVの内容で置き換えます。実行しますか？"
              )
            ) {
              return;
            }
            if (saveTimer) clearTimeout(saveTimer);
            saveTimer = null;
            saveEmployeeSheet(sheet);
            renderEmployeesView();
            if (truncated) {
              alert(
                "取り込みが完了しました。データ行が " +
                  EMPLOYEE_ROW_MAX +
                  " 行を超えていたため、先頭 " +
                  EMPLOYEE_ROW_MAX +
                  " 行のみ反映しています。"
              );
            }
          } catch (err) {
            alert(
              "CSVの読み込みに失敗しました: " +
                (err && err.message ? err.message : String(err))
            );
          }
        };
        reader.onerror = function () {
          alert("ファイルを読めませんでした。");
        };
        reader.readAsText(file, "UTF-8");
      });
    }

    applyEmployeeEditModeUi();
  }

  function exportPayload(tasks, memoText) {
    return JSON.stringify(
      {
        v: 1,
        appVersion: APP_VERSION,
        exportedAt: new Date().toISOString(),
        tasks: tasks,
        memo: memoText,
        taskHistory: loadTaskHistory(),
        employees: loadEmployeeSheet(),
      },
      null,
      2
    );
  }

  function importPayload(json, listEl, memoEl, syncOuterTasks) {
    var data = JSON.parse(json);
    if (!data || typeof data !== "object") throw new Error("形式が正しくありません");
    var next = data.tasks;
    if (!Array.isArray(next)) throw new Error("tasks が見つかりません");
    for (var i = 0; i < next.length; i++) {
      var t = next[i];
      if (!t || typeof t.text !== "string") throw new Error("タスクの形式が正しくありません");
      if (typeof t.done !== "boolean") t.done = false;
    }
    var memoText = typeof data.memo === "string" ? data.memo : "";
    saveTasks(next);
    saveMemo(memoText);
    syncOuterTasks(next);
    if (listEl) renderTasks(next, listEl);
    if (memoEl) memoEl.value = memoText;
    if (Object.prototype.hasOwnProperty.call(data, "taskHistory")) {
      var normalized = normalizeImportedTaskHistory(data.taskHistory);
      if (normalized !== null) saveTaskHistory(normalized);
    }
    if (Object.prototype.hasOwnProperty.call(data, "employees")) {
      var em = normalizeImportedEmployees(data.employees);
      if (em !== null) saveEmployeeSheet(em);
    }
  }

  function renderTasks(tasks, listEl) {
    if (!listEl) return;
    listEl.innerHTML = "";
    tasks.forEach(function (task, index) {
      var li = document.createElement("li");

      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!task.done;
      cb.setAttribute("aria-label", "完了");
      cb.addEventListener("change", function () {
        tasks[index].done = cb.checked;
        saveTasks(tasks);
        span.classList.toggle("done", cb.checked);
      });

      var span = document.createElement("span");
      span.textContent = task.text;
      if (task.done) span.classList.add("done");

      var rm = document.createElement("button");
      rm.type = "button";
      rm.className = "remove";
      rm.textContent = "削除";
      rm.addEventListener("click", function () {
        tasks.splice(index, 1);
        saveTasks(tasks);
        renderTasks(tasks, listEl);
      });

      li.appendChild(cb);
      li.appendChild(span);
      li.appendChild(rm);
      listEl.appendChild(li);
    });
  }

  function qs(id) {
    return document.getElementById(id);
  }

  function refreshWorkHelperStorageHints() {
    var el = qs("wh-storage-hint-short");
    if (el) {
      el.textContent = whActive()
        ? "選択したフォルダ内の workhelper-storage.json"
        : isElectronApp()
          ? "このアプリの保存領域（PC 上のプロファイル）"
          : "このブラウザ内の保存領域（localStorage）";
    }
  }

  function refreshBackupFsUi() {
    var status = qs("backup-fs-status");
    var pickBtn = qs("btn-backup-fs-pick");
    var forgetBtn = qs("btn-backup-fs-forget");
    var sup =
      typeof WorkHelperDirectoryStorage !== "undefined" &&
      WorkHelperDirectoryStorage.isSupported &&
      WorkHelperDirectoryStorage.isSupported();
    if (status) {
      if (!sup) {
        status.textContent =
          "フォルダ保存: インストール版の WorkHelper で利用できます。通常のアプリとして起動してください。";
      } else if (whActive()) {
        status.textContent =
          "フォルダ保存: 利用中です。データはこのフォルダ内の「" +
          WorkHelperDirectoryStorage.fileName +
          "」にまとめて自動書き込みされます。";
      } else {
        status.textContent =
          "フォルダ保存: 未設定です。「フォルダを選ぶ」で保存先を指定すると、タスク・社員リスト・メモ・時間外の各データが JSON ファイルへ自動保存されます。";
      }
    }
    if (forgetBtn) forgetBtn.hidden = !whActive();
    if (pickBtn) pickBtn.disabled = false;
  }

  /** Home の「完了」後に一覧の tasks 配列と DOM を揃える（DOMContentLoaded で上書き） */
  var whSyncTasksFromStorage = function () {};

  function renderTaskHistoryView() {
    var ul = qs("history-list");
    var empty = qs("history-empty");
    if (!ul || !empty) return;
    var items = loadTaskHistory();
    ul.innerHTML = "";
    if (items.length === 0) {
      empty.hidden = false;
      ul.hidden = true;
      return;
    }
    empty.hidden = true;
    ul.hidden = false;
    items.forEach(function (e) {
      var li = document.createElement("li");
      li.className = "history-row";

      var timeEl = document.createElement("time");
      timeEl.className = "history-date";
      timeEl.setAttribute("datetime", e.completedAt);
      timeEl.textContent = formatCompletedAt(e.completedAt);

      var textEl = document.createElement("span");
      textEl.className = "history-text";
      textEl.textContent = e.text;

      li.appendChild(timeEl);
      li.appendChild(textEl);
      ul.appendChild(li);
    });
  }

  function renderHomeTaskPreview() {
    var ul = qs("home-task-preview");
    var emptyEl = qs("home-task-preview-empty");
    var summary = qs("home-task-summary");
    var undoneEl = qs("home-task-undone-count");
    var totalEl = qs("home-task-total-count");
    if (!ul || !emptyEl) return;

    var all = loadTasks();
    var undone = 0;
    for (var u = 0; u < all.length; u++) {
      if (!all[u].done) undone++;
    }

    if (summary && undoneEl && totalEl) {
      if (all.length === 0) {
        summary.hidden = true;
      } else {
        summary.hidden = false;
        undoneEl.textContent = String(undone);
        totalEl.textContent = String(all.length);
      }
    }

    if (all.length === 0) {
      ul.innerHTML = "";
      ul.hidden = true;
      emptyEl.hidden = false;
      emptyEl.textContent =
        "タスクはまだありません。「一覧を開く」から追加できます。";
      return;
    }

    if (undone === 0) {
      ul.innerHTML = "";
      ul.hidden = true;
      emptyEl.hidden = false;
      emptyEl.textContent =
        "未完了のタスクはありません。「一覧を開く」で追加するか、完了済みを確認できます。";
      return;
    }

    emptyEl.hidden = true;
    ul.hidden = false;

    var pendingIndices = [];
    for (var p = 0; p < all.length; p++) {
      if (!all[p].done) pendingIndices.push(p);
    }

    var max = 12;
    var shownIndices = pendingIndices.slice(0, max);
    ul.innerHTML = "";
    shownIndices.forEach(function (indexInAll) {
      var task = all[indexInAll];
      var li = document.createElement("li");
      li.className = "home-preview__row";

      var mark = document.createElement("span");
      mark.className = "home-preview__mark";
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = "○";

      var span = document.createElement("span");
      span.className = "home-preview__text";
      span.textContent = task.text;

      var doneBtn = document.createElement("button");
      doneBtn.type = "button";
      doneBtn.className = "home-preview__complete";
      doneBtn.textContent = "完了";
      doneBtn.setAttribute("aria-label", "「" + task.text + "」を完了して消す");

      doneBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var fresh = loadTasks();
        var idx = indexInAll;
        if (idx < 0 || idx >= fresh.length) return;
        if (fresh[idx].text !== task.text || fresh[idx].done) {
          idx = -1;
          for (var j = 0; j < fresh.length; j++) {
            if (!fresh[j].done && fresh[j].text === task.text) {
              idx = j;
              break;
            }
          }
        }
        if (idx < 0 || idx >= fresh.length) return;
        var removed = fresh[idx];
        appendTaskHistoryEntry(removed.text);
        fresh.splice(idx, 1);
        saveTasks(fresh);
        whSyncTasksFromStorage();
        renderHomeTaskPreview();
      });

      li.appendChild(mark);
      li.appendChild(span);
      li.appendChild(doneBtn);
      ul.appendChild(li);
    });

    if (pendingIndices.length > max) {
      var more = document.createElement("li");
      more.className = "home-preview__more";
      more.textContent =
        "ほか " + (pendingIndices.length - max) + " 件は一覧で確認できます";
      ul.appendChild(more);
    }
  }

  function renderHomeUpdateStatus(status) {
    var wrap = qs("home-update-status");
    var btn = qs("home-update-button");
    if (!wrap || !btn) return;

    if (!isElectronApp() || !window.workhelper.getUpdateStatus) {
      wrap.textContent = "デスクトップ版でのみ更新を確認できます。";
      btn.textContent = "更新を確認";
      btn.disabled = true;
      btn.dataset.updateStatus = "unsupported";
      return;
    }

    var s = status || {};
    var current = s.currentVersion || APP_VERSION;
    var latest = s.latestVersion || "";
    btn.disabled = false;
    btn.dataset.updateStatus = s.status || "idle";

    if (s.status === "checking") {
      wrap.textContent = "更新状態: 確認中です。";
      btn.textContent = "確認中";
      btn.disabled = true;
      return;
    }
    if (s.status === "latest") {
      wrap.textContent = "更新状態: 最新です（現在 " + current + "）。";
      btn.textContent = "更新を確認";
      return;
    }
    if (s.status === "available") {
      wrap.textContent =
        "更新状態: 更新が必要です" + (latest ? "（最新版 " + latest + "）" : "") + "。";
      btn.textContent = "アップデート";
      return;
    }
    if (s.status === "downloaded") {
      wrap.textContent =
        "更新状態: 更新が必要です。アップデートの準備ができました。";
      btn.textContent = "アップデート";
      return;
    }
    if (s.status === "error") {
      wrap.textContent = "更新状態: 確認できませんでした。";
      btn.textContent = "更新を確認";
      return;
    }
    if (s.status === "unsupported") {
      wrap.textContent = s.message || "この環境では更新を確認できません。";
      btn.textContent = "更新を確認";
      btn.disabled = true;
      return;
    }

    wrap.textContent = "更新状態: 未確認です（現在 " + current + "）。";
    btn.textContent = "更新を確認";
  }

  function initHomeUpdateStatus() {
    var btn = qs("home-update-button");
    if (!btn) return;
    renderHomeUpdateStatus(null);
    if (!isElectronApp() || !window.workhelper.getUpdateStatus) return;

    window.workhelper.getUpdateStatus()
      .then(renderHomeUpdateStatus)
      .catch(function () {
        renderHomeUpdateStatus({ status: "error", currentVersion: APP_VERSION });
      });

    if (window.workhelper.onUpdateStatus) {
      window.workhelper.onUpdateStatus(renderHomeUpdateStatus);
    }

    btn.addEventListener("click", function () {
      var status = btn.dataset.updateStatus || "";
      btn.disabled = true;
      if (status === "downloaded" && window.workhelper.installUpdate) {
        window.workhelper.installUpdate();
        return;
      }
      if (window.workhelper.checkForUpdates) {
        window.workhelper.checkForUpdates()
          .then(renderHomeUpdateStatus)
          .catch(function () {
            renderHomeUpdateStatus({ status: "error", currentVersion: APP_VERSION });
          });
      }
    });
  }

  function showView(name, soonMeta) {
    var views = document.querySelectorAll(".view");
    for (var i = 0; i < views.length; i++) {
      var v = views[i];
      var on = v.id === "view-" + name;
      v.hidden = !on;
    }
    if (name === "home") {
      renderHomeTaskPreview();
      if (window.workhelper && window.workhelper.getUpdateStatus) {
        window.workhelper.getUpdateStatus()
          .then(renderHomeUpdateStatus)
          .catch(function () {});
      }
    }
    if (name === "history") {
      renderTaskHistoryView();
    }
    if (name === "employees") {
      renderEmployeesView();
    }
    if (name === "overtime") {
      initOvertimeView();
      syncOvertimePeriodFieldsToDom();
      refreshWorkHelperStorageHints();
      refreshOvertimeViewFromState();
    }
    if (name === "soon" && soonMeta) {
      var st = qs("soon-title");
      var sd = qs("soon-desc");
      if (st) st.textContent = soonMeta.title || "準備中";
      if (sd) {
        sd.textContent =
          "この機能は今後のバージョンで追加予定です。\n\n" +
          (soonMeta.description || "しばらくお待ちください。");
      }
    }
    if (name === "tasks") {
      var input = qs("task-input");
      if (input) input.focus();
    }
    if (name === "backup") {
      var verEl = qs("backup-app-version");
      if (verEl) {
        verEl.textContent = "このアプリのバージョン: " + APP_VERSION;
      }
      refreshBackupFsUi();
    }
  }

  function renderHomeCards(container) {
    container.innerHTML = "";
    HOME_CARDS.forEach(function (card) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "home-card";
      btn.setAttribute("data-card-id", card.id);
      if (!card.route && !card.externalUrl) btn.setAttribute("data-soon", "1");
      if (card.externalUrl) {
        btn.setAttribute("data-external", "1");
        btn.title = card.title + "（別タブで開きます）";
      }

      var icon = document.createElement("span");
      icon.className = "home-card__icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = card.icon;

      var title = document.createElement("span");
      title.className = "home-card__title";
      title.textContent = card.title;

      var desc = document.createElement("span");
      desc.className = "home-card__desc";
      desc.textContent = card.description;

      btn.appendChild(icon);
      btn.appendChild(title);
      btn.appendChild(desc);

      btn.addEventListener("click", function () {
        if (card.externalUrl) {
          window.open(card.externalUrl, "_blank", "noopener,noreferrer");
          return;
        }
        if (card.route) {
          showView(card.route);
          return;
        }
        showView("soon", { title: card.title, description: card.description });
      });

      container.appendChild(btn);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.addEventListener("workhelper-fs-changed", function () {
      refreshWorkHelperStorageHints();
      refreshBackupFsUi();
    });

    function wireBackupFsButtons() {
      var pickBtn = qs("btn-backup-fs-pick");
      var forgetBtn = qs("btn-backup-fs-forget");
      if (pickBtn && !pickBtn.dataset.whFsWired) {
        pickBtn.dataset.whFsWired = "1";
        pickBtn.addEventListener("click", function () {
          if (typeof WorkHelperDirectoryStorage === "undefined" || !WorkHelperDirectoryStorage.pickFolder) {
            alert("フォルダ保存モジュールが読み込まれていません。");
            return;
          }
          WorkHelperDirectoryStorage.pickFolder()
            .then(function () {
              whSyncTasksFromStorage();
              renderHomeTaskPreview();
              renderTaskHistoryView();
              renderEmployeesView();
              refreshOvertimeViewFromState();
              var md = qs("memo");
              if (md) md.value = loadMemo();
              alert("フォルダを保存先に設定しました。");
            })
            .catch(function (err) {
              if (err && err.name === "AbortError") return;
              alert(err && err.message ? err.message : String(err));
            });
        });
      }
      if (forgetBtn && !forgetBtn.dataset.whFsWired) {
        forgetBtn.dataset.whFsWired = "1";
        forgetBtn.addEventListener("click", function () {
          if (
            !confirm(
              isElectronApp()
                ? "フォルダ連携をやめますか？データはアプリ内の保存領域にコピーされ、以降はアプリ内のみに保存されます。"
                : "フォルダ連携をやめますか？データはブラウザ内（localStorage）へコピーされ、以降はブラウザ側に保存されます。"
            )
          ) {
            return;
          }
          if (typeof WorkHelperDirectoryStorage === "undefined" || !WorkHelperDirectoryStorage.forgetFolder) {
            return;
          }
          WorkHelperDirectoryStorage.forgetFolder()
            .then(function () {
              whSyncTasksFromStorage();
              renderHomeTaskPreview();
              renderTaskHistoryView();
              renderEmployeesView();
              refreshOvertimeViewFromState();
              var md = qs("memo");
              if (md) md.value = loadMemo();
              alert(isElectronApp() ? "アプリ内の保存に切り替えました。" : "ブラウザ内保存に切り替えました。");
            })
            .catch(function (err) {
              alert(err && err.message ? err.message : String(err));
            });
        });
      }
    }

    function runAppStartup() {
      var grid = qs("home-grid");
      if (grid) renderHomeCards(grid);

      var listEl = qs("task-list");
      var tasks = loadTasks();

      whSyncTasksFromStorage = function () {
        tasks = loadTasks();
        if (listEl) renderTasks(tasks, listEl);
      };

      renderHomeTaskPreview();
      initHomeUpdateStatus();

      var openTasks = qs("home-open-tasks");
      if (openTasks) {
        openTasks.addEventListener("click", function () {
          showView("tasks");
        });
      }

      document.querySelectorAll(".btn-back").forEach(function (b) {
        b.addEventListener("click", function () {
          showView("home");
        });
      });

      var form = qs("task-form");
      var input = qs("task-input");
      var memo = qs("memo");
      var btnExport = qs("btn-export");
      var btnImport = qs("btn-import");

      renderTasks(tasks, listEl);

      if (memo) {
        memo.value = loadMemo();
        var memoTimer = null;
        memo.addEventListener("input", function () {
          if (memoTimer) clearTimeout(memoTimer);
          memoTimer = setTimeout(function () {
            saveMemo(memo.value);
          }, 300);
        });
      }

      if (form && input && listEl) {
        form.addEventListener("submit", function (ev) {
          ev.preventDefault();
          var text = (input.value || "").trim();
          if (!text) return;
          tasks.push({ text: text, done: false });
          saveTasks(tasks);
          input.value = "";
          renderTasks(tasks, listEl);
          input.focus();
        });
      }

      if (btnExport) {
        btnExport.addEventListener("click", function () {
          var memoText = memo ? memo.value : loadMemo();
          var body = exportPayload(loadTasks(), memoText);
          var blob = new Blob([body], { type: "application/json;charset=utf-8" });
          var url = URL.createObjectURL(blob);
          var a = document.createElement("a");
          a.href = url;
          a.download = "workhelper-backup.json";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        });
      }

      if (btnImport && listEl) {
        btnImport.addEventListener("change", function () {
          var file = btnImport.files && btnImport.files[0];
          btnImport.value = "";
          if (!file) return;
          var reader = new FileReader();
          reader.onload = function () {
            try {
              importPayload(String(reader.result || ""), listEl, memo, function (next) {
                tasks = next;
              });
              renderHomeTaskPreview();
              renderTaskHistoryView();
              renderEmployeesView();
              alert("インポートが完了しました。");
            } catch (err) {
              alert("読み込みに失敗しました: " + (err && err.message ? err.message : String(err)));
            }
          };
          reader.onerror = function () {
            alert("ファイルを読めませんでした。");
          };
          reader.readAsText(file, "utf-8");
        });
      }

      initEmployeesView();
      initOvertimeView();
    }

    var fsP =
      typeof WorkHelperDirectoryStorage !== "undefined" && WorkHelperDirectoryStorage.init
        ? WorkHelperDirectoryStorage.init()
        : Promise.resolve();
    fsP
      .then(function () {
        runAppStartup();
        refreshWorkHelperStorageHints();
        refreshBackupFsUi();
        wireBackupFsButtons();
      })
      .catch(function (e) {
        if (typeof console !== "undefined" && console.warn) console.warn(e);
        runAppStartup();
        refreshWorkHelperStorageHints();
        refreshBackupFsUi();
        wireBackupFsButtons();
      });
  });
})();
