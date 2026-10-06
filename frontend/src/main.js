import { LitElement, css, html } from "lit";

const TOKEN_KEY = "tanpit_token";
const LABELS = { fill: "注液", tanning: "鞣制中", drained: "已放液" };
const ROLE_LABELS = { admin: "管理员", worker: "操作工" };

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  const t = localStorage.getItem(TOKEN_KEY);
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "请求失败");
  return data;
}

function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("zh-CN", { hour12: false });
}

class TanYard extends LitElement {
  static properties = {
    ready: { type: Boolean },
    user: { type: Object },
    view: { type: String },
    board: { type: Object },
    picked: { type: Object },
    ph: { type: String },
    err: { type: String },
    ok: { type: String },
    username: { type: String },
    password: { type: String },
    badges: { type: Array },
    filterPit: { type: String },
    filterStatus: { type: String },
    filterQ: { type: String },
    wiz: { type: Object },
    wizErr: { type: String },
    editing: { type: Object },
    editErr: { type: String },
    busy: { type: Boolean },
  };

  static styles = css`
    :host { display: block; font-family: "KaiTi", serif; color: #2b2118; }
    .topbar {
      display: flex; align-items: center; gap: 18px;
      background: #3a2c1e; color: #f3e9d7; padding: 10px 20px;
      position: sticky; top: 0; z-index: 5;
    }
    .brand { font-size: 1.15em; font-weight: bold; letter-spacing: 2px; }
    .topbar nav { display: flex; gap: 6px; }
    .topbar nav a {
      color: #d8c9ae; text-decoration: none; padding: 6px 14px; border-radius: 6px;
    }
    .topbar nav a.on { background: #8a5a2b; color: #fff; }
    .topbar .spacer { flex: 1; }
    .who { font-size: 0.92em; color: #d8c9ae; }
    .wrap { max-width: 1080px; margin: 0 auto; padding: 22px 16px 50px; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .pit { min-height: 110px; border-radius: 8px; color: #fff; cursor: pointer; border: 0; }
    .fill { background: #6d8f9e; }
    .tanning { background: #8a5a2b; }
    .drained { background: #5f6f4a; }
    .pit .badge-line { font-size: 0.85em; opacity: 0.92; }
    .err { color: #9b1c1c; }
    .ok { color: #2f6b2f; }
    .hint { color: #6b5a48; font-size: 0.92em; }
    label { display: block; margin: 8px 0; }
    input, select, button { font: inherit; padding: 8px 10px; margin: 4px 6px 4px 0; }
    button { cursor: pointer; border: 1px solid #b8a582; background: #f7f1e6; border-radius: 6px; }
    button.primary { background: #8a5a2b; color: #fff; border-color: #8a5a2b; }
    button.ghost { background: transparent; color: #f3e9d7; border-color: #8a7452; }
    button.danger { background: #9b1c1c; color: #fff; border-color: #9b1c1c; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .desk { display: flex; gap: 18px; align-items: flex-start; flex-wrap: wrap; }
    .left { flex: 1.5; min-width: 420px; }
    .right { flex: 1; min-width: 300px; }
    .card { background: #f7f1e6; border: 1px solid #d8cbb8; border-radius: 10px; padding: 14px 16px; }
    .filters { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.95em; background: #fffdf8; }
    th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid #e4d9c4; }
    th { background: #efe5d0; }
    tr:hover td { background: #faf4e6; }
    .tag { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 0.85em; }
    .tag.cur { background: #dfe9d2; color: #3c5a2a; }
    .tag.off { background: #e8ddd0; color: #7a6a55; }
    .tabs { display: flex; gap: 6px; margin-bottom: 12px; }
    .tabs button { flex: 1; }
    .tabs button.on { background: #8a5a2b; color: #fff; border-color: #8a5a2b; }
    .steps { color: #6b5a48; font-size: 0.9em; margin-bottom: 10px; }
    .steps b { color: #8a5a2b; }
    .confirm-box { background: #fffdf8; border: 1px dashed #b8a582; border-radius: 8px; padding: 10px 12px; margin: 8px 0; }
    .confirm-box p { margin: 4px 0; }
    h1 { margin: 4px 0 10px; }
    h2 { margin: 4px 0 12px; font-size: 1.25em; }
    h3 { margin-bottom: 6px; }
  `;

  constructor() {
    super();
    this.ready = Boolean(localStorage.getItem(TOKEN_KEY));
    this.user = null;
    this.view = "map";
    this.board = null;
    this.picked = null;
    this.ph = "4.2";
    this.err = "";
    this.ok = "";
    this.username = "admin";
    this.password = "123456";
    this.badges = [];
    this.filterPit = "";
    this.filterStatus = "current";
    this.filterQ = "";
    this.wiz = { mode: "hang", step: 1, pitId: "", number: "" };
    this.wizErr = "";
    this.editing = null;
    this.editErr = "";
    this.busy = false;
    this._onHash = () => {
      this.view = location.hash === "#/badges" ? "badges" : "map";
      this.err = "";
      this.ok = "";
      if (this.ready) this.refresh();
    };
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("hashchange", this._onHash);
    this._onHash();
    if (this.ready) this.bootstrap();
  }

  disconnectedCallback() {
    window.removeEventListener("hashchange", this._onHash);
    super.disconnectedCallback();
  }

  async bootstrap() {
    try {
      this.user = await api("/api/auth/me");
      await this.refresh();
    } catch (e) {
      this.logout();
    }
  }

  async refresh() {
    try {
      this.board = await api("/api/board");
      if (this.picked) {
        this.picked = this.board.pits.find((p) => p.id === this.picked.id) || this.board.pits[0];
      }
      if (this.view === "badges") await this.loadBadges();
    } catch (e) {
      this.err = e.message;
    }
  }

  async loadBadges() {
    const params = new URLSearchParams();
    if (this.filterPit) params.set("pit_id", this.filterPit);
    if (this.filterStatus) params.set("status", this.filterStatus);
    if (this.filterQ.trim()) params.set("q", this.filterQ.trim());
    this.badges = await api(`/api/badges?${params.toString()}`);
  }

  async login(e) {
    e.preventDefault();
    this.err = "";
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: this.username, password: this.password }),
      });
      localStorage.setItem(TOKEN_KEY, data.access_token);
      this.user = data.user;
      this.ready = true;
      await this.refresh();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    this.ready = false;
    this.user = null;
    this.board = null;
    this.picked = null;
  }

  async writePh() {
    this.err = "";
    this.ok = "";
    try {
      this.picked = await api(`/api/pits/${this.picked.id}/samples`, {
        method: "POST",
        body: JSON.stringify({ ph: Number(this.ph) }),
      });
      await this.refresh();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  async setStatus(status) {
    this.err = "";
    this.ok = "";
    try {
      this.picked = await api(`/api/pits/${this.picked.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      this.ok = status === "drained" ? "已放液" : "";
      await this.refresh();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  canTouch(badge) {
    return this.user && (this.user.role === "admin" || badge.workerName === this.user.username);
  }

  pitById(id) {
    return (this.board?.pits || []).find((p) => p.id === Number(id));
  }

  startHang() {
    this.editing = null;
    this.wizErr = "";
    this.wiz = { mode: "hang", step: 1, pitId: "", number: "" };
  }

  switchMode(mode) {
    this.editing = null;
    this.wizErr = "";
    this.wiz = { mode, step: 1, pitId: "", number: "" };
  }

  wizNext() {
    this.wizErr = "";
    if (!this.wiz.pitId) {
      this.wizErr = "请先选择坑位";
      return;
    }
    if (this.wiz.mode === "hang") {
      const n = Number(this.wiz.number);
      if (!Number.isInteger(n) || n < 1) {
        this.wizErr = "牌号须为正整数";
        return;
      }
      this.wiz = { ...this.wiz, number: String(n), step: 2 };
    } else {
      const pit = this.pitById(this.wiz.pitId);
      if (!pit || !pit.badge) {
        this.wizErr = "该坑没有现行工牌";
        return;
      }
      this.wiz = { ...this.wiz, step: 2 };
    }
  }

  wizBack() {
    this.wizErr = "";
    this.wiz = { ...this.wiz, step: 1 };
  }

  async confirmHang() {
    if (this.busy) return;
    this.busy = true;
    this.wizErr = "";
    this.err = "";
    this.ok = "";
    try {
      await api("/api/badges", {
        method: "POST",
        body: JSON.stringify({
          pit_id: Number(this.wiz.pitId),
          number: Number(this.wiz.number),
          worker_name: this.user.username,
        }),
      });
      this.ok = `牌号 ${this.wiz.number} 已挂上`;
      this.wiz = { mode: "hang", step: 1, pitId: "", number: "" };
      await this.refresh();
    } catch (ex) {
      this.wizErr = ex.message;
    } finally {
      this.busy = false;
    }
  }

  async confirmRemove() {
    if (this.busy) return;
    const pit = this.pitById(this.wiz.pitId);
    if (!pit || !pit.badge) {
      this.wizErr = "该坑没有现行工牌";
      return;
    }
    this.busy = true;
    this.wizErr = "";
    this.err = "";
    this.ok = "";
    try {
      await api(`/api/badges/${pit.badge.id}/remove`, { method: "POST" });
      this.ok = `${pit.code} 的牌号 ${pit.badge.number} 已摘下`;
      this.wiz = { mode: "remove", step: 1, pitId: "", number: "" };
      await this.refresh();
    } catch (ex) {
      this.wizErr = ex.message;
    } finally {
      this.busy = false;
    }
  }

  prefillRemove(badge) {
    this.editing = null;
    this.wizErr = "";
    this.wiz = { mode: "remove", step: 2, pitId: String(badge.pitId), number: "" };
  }

  startEdit(badge) {
    this.wizErr = "";
    this.editErr = "";
    this.editing = {
      id: badge.id,
      pitId: String(badge.pitId),
      number: String(badge.number),
      workerName: badge.workerName,
    };
  }

  cancelEdit() {
    this.editing = null;
    this.editErr = "";
  }

  async saveEdit() {
    if (this.busy || !this.editing) return;
    this.editErr = "";
    const n = Number(this.editing.number);
    if (!Number.isInteger(n) || n < 1) {
      this.editErr = "牌号须为正整数";
      return;
    }
    if (!this.editing.pitId) {
      this.editErr = "请选择坑位";
      return;
    }
    this.busy = true;
    this.err = "";
    this.ok = "";
    try {
      await api(`/api/badges/${this.editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          pit_id: Number(this.editing.pitId),
          number: n,
          worker_name: this.editing.workerName.trim(),
        }),
      });
      this.ok = `工牌 #${this.editing.id} 已保存`;
      this.editing = null;
      await this.refresh();
    } catch (ex) {
      this.editErr = ex.message;
    } finally {
      this.busy = false;
    }
  }

  topbar() {
    return html`<header class="topbar">
      <span class="brand">南冈鞣场</span>
      <nav>
        <a href="#/map" class=${this.view === "map" ? "on" : ""}>坑位场地图</a>
        <a href="#/badges" class=${this.view === "badges" ? "on" : ""}>工牌台</a>
      </nav>
      <span class="spacer"></span>
      ${this.user
        ? html`<span class="who">${this.user.username} · ${ROLE_LABELS[this.user.role] || this.user.role}</span>
            <button class="ghost" @click=${this.logout}>退出</button>`
        : ""}
    </header>`;
  }

  loginView() {
    return html`<div class="wrap">
      <h1>南冈鞣场</h1>
      <form @submit=${this.login} autocomplete="off">
        <label>用户名
          <input name="username" autocomplete="off" .value=${this.username} @input=${(e) => (this.username = e.target.value)} />
        </label>
        <label>密码
          <input name="password" type="password" autocomplete="off" .value=${this.password} @input=${(e) => (this.password = e.target.value)} />
        </label>
        <p class="hint">已预填 admin / 123456，另有 worker / 123456</p>
        <button>登录</button>
      </form>
      ${this.err ? html`<p class="err">${this.err}</p>` : ""}
    </div>`;
  }

  mapView() {
    if (!this.board) return html`<div class="wrap">${this.err || "装载坑位…"}</div>`;
    return html`<div class="wrap">
      <h1>${this.board.yard}</h1>
      <p>${this.board.village} · 点坑登记浸液酸碱度；放液须该坑挂有本人工牌，且最近读数 3.5～5.0</p>
      <div class="grid">
        ${this.board.pits.map(
          (p) => html`<button class="pit ${p.status}" @click=${() => (this.picked = p)}>
            <strong>${p.code}</strong><br />${LABELS[p.status]}<br />
            <span class="badge-line">${p.badge ? `牌#${p.badge.number} · ${p.badge.workerName}` : "未挂工牌"}</span>
          </button>`
        )}
      </div>
      ${this.picked
        ? html`<section>
            <h3>${this.picked.code} · ${LABELS[this.picked.status]}</h3>
            <p>最近酸碱度：${this.picked.latestPh ?? "无"} · ${this.picked.sampleCount} 次</p>
            <p>现行工牌：${this.picked.badge
              ? html`牌号 ${this.picked.badge.number} · ${this.picked.badge.workerName} · 挂于 ${fmtTime(this.picked.badge.hungAt)}`
              : "未挂"}</p>
            <input .value=${this.ph} @input=${(e) => (this.ph = e.target.value)} />
            <button @click=${this.writePh}>登记酸碱度</button>
            <div>
              <button @click=${() => this.setStatus("fill")}>注液</button>
              <button @click=${() => this.setStatus("tanning")}>鞣制中</button>
              <button @click=${() => this.setStatus("drained")}>已放液</button>
            </div>
          </section>`
        : ""}
      ${this.err ? html`<p class="err">${this.err}</p>` : ""}
      ${this.ok ? html`<p class="ok">${this.ok}</p>` : ""}
    </div>`;
  }

  badgeRow(b) {
    return html`<tr>
      <td>${b.number}</td>
      <td>${b.pitCode}</td>
      <td>${b.workerName}</td>
      <td>${fmtTime(b.hungAt)}</td>
      <td>${fmtTime(b.removedAt)}</td>
      <td>${b.current ? html`<span class="tag cur">现行</span>` : html`<span class="tag off">已摘下</span>`}</td>
      <td>
        ${this.canTouch(b) ? html`<button @click=${() => this.startEdit(b)}>编辑</button>` : ""}
        ${b.current && this.canTouch(b) ? html`<button @click=${() => this.prefillRemove(b)}>摘下</button>` : ""}
      </td>
    </tr>`;
  }

  wizard() {
    const w = this.wiz;
    const pit = this.pitById(w.pitId);
    const hangable = (this.board?.pits || []).filter((p) => !p.badge);
    const removable = (this.board?.pits || []).filter((p) => p.badge);
    return html`<div class="card">
      <div class="tabs">
        <button class=${w.mode === "hang" ? "on" : ""} @click=${() => this.switchMode("hang")}>挂上工牌</button>
        <button class=${w.mode === "remove" ? "on" : ""} @click=${() => this.switchMode("remove")}>摘下工牌</button>
      </div>
      <p class="steps">${w.step === 1 ? html`<b>第 1 步 · 选择</b> → 第 2 步 · 确认` : html`第 1 步 · 选择 → <b>第 2 步 · 确认</b>`}</p>
      ${w.mode === "hang" ? this.hangWizard(pit, hangable) : this.removeWizard(pit, removable)}
      ${this.wizErr ? html`<p class="err">${this.wizErr}</p>` : ""}
    </div>`;
  }

  hangWizard(pit, hangable) {
    const w = this.wiz;
    if (w.step === 1) {
      return html`
        <label>坑位
          <select @change=${(e) => (this.wiz = { ...this.wiz, pitId: e.target.value })}>
            <option value="">请选择坑位</option>
            ${(this.board?.pits || []).map(
              (p) => html`<option value=${p.id} ?selected=${String(p.id) === w.pitId} ?disabled=${Boolean(p.badge)}>
                ${p.code}${p.badge ? `（现行牌#${p.badge.number}）` : ""}
              </option>`
            )}
          </select>
        </label>
        <label>牌号（正整数）
          <input type="number" min="1" step="1" .value=${w.number} @input=${(e) => (this.wiz = { ...this.wiz, number: e.target.value })} />
        </label>
        <label>姓名
          <input .value=${this.user?.username || ""} disabled />
        </label>
        <p class="hint">工牌姓名只能写本人；一口坑现行只挂一张。</p>
        <button class="primary" @click=${this.wizNext} ?disabled=${!hangable.length && !w.pitId}>下一步</button>
      `;
    }
    return html`
      <div class="confirm-box">
        <p>坑位：<b>${pit?.code}</b></p>
        <p>牌号：<b>${w.number}</b></p>
        <p>姓名：<b>${this.user?.username}</b></p>
        <p>挂上时刻：现在</p>
      </div>
      <button @click=${this.wizBack}>上一步</button>
      <button class="primary" @click=${this.confirmHang} ?disabled=${this.busy}>确认挂上</button>
    `;
  }

  removeWizard(pit, removable) {
    const w = this.wiz;
    if (w.step === 1) {
      return html`
        <label>坑位（仅列有现行牌的坑）
          <select @change=${(e) => (this.wiz = { ...this.wiz, pitId: e.target.value })}>
            <option value="">请选择坑位</option>
            ${removable.map(
              (p) => html`<option value=${p.id} ?selected=${String(p.id) === w.pitId}>
                ${p.code}（牌#${p.badge.number} · ${p.badge.workerName}）
              </option>`
            )}
          </select>
        </label>
        ${pit?.badge
          ? html`<div class="confirm-box">
              <p>现行牌号：<b>${pit.badge.number}</b></p>
              <p>姓名：<b>${pit.badge.workerName}</b></p>
              <p>挂上时刻：${fmtTime(pit.badge.hungAt)}</p>
            </div>`
          : ""}
        <button class="primary" @click=${this.wizNext} ?disabled=${!removable.length}>下一步</button>
      `;
    }
    return html`
      <div class="confirm-box">
        <p>坑位：<b>${pit?.code}</b></p>
        <p>牌号：<b>${pit?.badge?.number}</b></p>
        <p>姓名：<b>${pit?.badge?.workerName}</b></p>
        <p>摘下时刻：现在</p>
      </div>
      <p class="hint">摘牌仅限管理员或本人。</p>
      <button @click=${this.wizBack}>上一步</button>
      <button class="danger" @click=${this.confirmRemove} ?disabled=${this.busy}>确认摘下</button>
    `;
  }

  editor() {
    const ed = this.editing;
    const isAdmin = this.user?.role === "admin";
    return html`<div class="card">
      <h3>编辑工牌 #${ed.id}</h3>
      <label>坑位
        <select @change=${(e) => (this.editing = { ...this.editing, pitId: e.target.value })}>
          ${(this.board?.pits || []).map(
            (p) => html`<option value=${p.id} ?selected=${String(p.id) === ed.pitId}>${p.code}</option>`
          )}
        </select>
      </label>
      <label>牌号（正整数）
        <input type="number" min="1" step="1" .value=${ed.number} @input=${(e) => (this.editing = { ...this.editing, number: e.target.value })} />
      </label>
      <label>姓名
        <input .value=${ed.workerName} ?disabled=${!isAdmin} @input=${(e) => (this.editing = { ...this.editing, workerName: e.target.value })} />
      </label>
      ${isAdmin ? "" : html`<p class="hint">姓名只能写本人，故不可改。</p>`}
      <button class="primary" @click=${this.saveEdit} ?disabled=${this.busy}>保存</button>
      <button @click=${this.cancelEdit}>取消</button>
      ${this.editErr ? html`<p class="err">${this.editErr}</p>` : ""}
    </div>`;
  }

  deskView() {
    if (!this.board) return html`<div class="wrap">${this.err || "装载坑位…"}</div>`;
    return html`<div class="wrap">
      <h1>工牌台</h1>
      <div class="desk">
        <section class="left">
          <div class="filters">
            <select @change=${(e) => { this.filterPit = e.target.value; this.loadBadges(); }}>
              <option value="">全部坑位</option>
              ${this.board.pits.map(
                (p) => html`<option value=${p.id} ?selected=${String(p.id) === this.filterPit}>${p.code}</option>`
              )}
            </select>
            <select @change=${(e) => { this.filterStatus = e.target.value; this.loadBadges(); }}>
              <option value="current" ?selected=${this.filterStatus === "current"}>现行挂牌</option>
              <option value="removed" ?selected=${this.filterStatus === "removed"}>已摘下</option>
              <option value="all" ?selected=${this.filterStatus === "all"}>全部</option>
            </select>
            <input placeholder="牌号 / 姓名 / 坑码" .value=${this.filterQ}
              @input=${(e) => { this.filterQ = e.target.value; this.loadBadges(); }} />
            <button class="primary" @click=${this.startHang}>＋新建挂牌</button>
          </div>
          <table>
            <thead>
              <tr><th>牌号</th><th>坑码</th><th>姓名</th><th>挂上时刻</th><th>摘下时刻</th><th>状态</th><th>操作</th></tr>
            </thead>
            <tbody>
              ${this.badges.length
                ? this.badges.map((b) => this.badgeRow(b))
                : html`<tr><td colspan="7" class="hint">没有符合条件的工牌</td></tr>`}
            </tbody>
          </table>
        </section>
        <section class="right">
          ${this.editing ? this.editor() : this.wizard()}
        </section>
      </div>
      ${this.err ? html`<p class="err">${this.err}</p>` : ""}
      ${this.ok ? html`<p class="ok">${this.ok}</p>` : ""}
    </div>`;
  }

  render() {
    if (!this.ready) return this.loginView();
    return html`${this.topbar()}${this.view === "badges" ? this.deskView() : this.mapView()}`;
  }
}

customElements.define("tan-yard", TanYard);
