import { LitElement, css, html } from "lit";

const TOKEN_KEY = "tanpit_token";
const LABELS = { fill: "注液", tanning: "鞣制中", drained: "已放液" };

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
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
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
    notice: { type: String },
    username: { type: String },
    password: { type: String },
    badges: { type: Array },
    pitFilter: { type: Number },
    statusFilter: { type: String },
    wizard: { type: Object },
    editingId: { type: Number },
    editNumber: { type: String },
  };

  static styles = css`
    :host { display: block; font-family: "KaiTi", serif; color: #2b2118; }
    .wrap { max-width: 1080px; margin: 0 auto; padding: 18px 16px 50px; }
    .topbar { display: flex; align-items: center; gap: 14px; padding: 10px 4px 14px; border-bottom: 2px solid #8a5a2b; margin-bottom: 16px; flex-wrap: wrap; }
    .brand { font-size: 1.25em; font-weight: bold; }
    .topbar nav { display: flex; gap: 8px; }
    .topbar nav button { border: 1px solid #8a5a2b; background: #fff; color: #8a5a2b; border-radius: 6px; cursor: pointer; }
    .topbar nav button.on { background: #8a5a2b; color: #fff; }
    .who { margin-left: auto; color: #6b5a48; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .pit { min-height: 110px; border-radius: 8px; color: #fff; cursor: pointer; border: 0; }
    .fill { background: #6d8f9e; }
    .tanning { background: #8a5a2b; }
    .drained { background: #5f6f4a; }
    .err { color: #9b1c1c; }
    .notice { color: #2f6b2f; }
    .hint { color: #6b5a48; font-size: 0.92em; }
    label { display: block; margin: 8px 0; }
    input, button, select { font: inherit; padding: 8px 10px; margin: 4px 6px 4px 0; }
    button { cursor: pointer; }
    button[disabled] { opacity: 0.5; cursor: not-allowed; }
    .badge-page { display: grid; grid-template-columns: 1fr 360px; gap: 16px; align-items: start; }
    .card { border: 1px solid #d8c9b4; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; background: #fffdf9; }
    .card h3 { margin: 4px 0 10px; }
    .pits { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
    .pits button { border: 1px solid #b09a7c; background: #fff; border-radius: 6px; }
    .pits button.on { background: #6d8f9e; border-color: #6d8f9e; color: #fff; }
    .pits .cur { color: #6b5a48; margin-left: 6px; font-size: 0.9em; }
    .pits button.on .cur { color: #eaf2f5; }
    .listhead { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border-bottom: 1px solid #e5dac6; padding: 6px 8px; text-align: left; font-size: 0.95em; }
    th { color: #6b5a48; }
    .tag { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 0.85em; }
    .tag.cur { background: #dce8dc; color: #2f6b2f; }
    .tag.off { background: #eee; color: #777; }
    .tabs { display: flex; gap: 8px; margin-bottom: 10px; }
    .tabs button { flex: 1; border: 1px solid #b09a7c; background: #fff; border-radius: 6px; }
    .tabs button.on { background: #8a5a2b; border-color: #8a5a2b; color: #fff; }
    .steps { color: #6b5a48; margin: 6px 0 10px; }
    .steps b { color: #8a5a2b; }
    .confirm { background: #f6efe3; border-radius: 6px; padding: 10px 12px; margin: 8px 0; }
    select { min-width: 180px; }
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
    this.notice = "";
    this.username = "admin";
    this.password = "123456";
    this.badges = [];
    this.pitFilter = 0;
    this.statusFilter = "all";
    this.wizard = { mode: "hang", step: 1, pitId: "", number: "", badgeId: "" };
    this.editingId = 0;
    this.editNumber = "";
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.ready) this.boot();
  }

  async boot() {
    try {
      this.user = await api("/api/auth/me");
      await this.refresh();
    } catch (e) {
      this.err = e.message;
      this.ready = false;
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  async refresh() {
    this.board = await api("/api/board");
    if (this.picked) {
      this.picked = this.board.pits.find((p) => p.id === this.picked.id) || this.board.pits[0];
    }
  }

  async loadBadges() {
    await this.refresh();
    const qs = [];
    if (this.pitFilter) qs.push(`pit_id=${this.pitFilter}`);
    if (this.statusFilter === "current") qs.push("current=true");
    if (this.statusFilter === "removed") qs.push("current=false");
    this.badges = await api(`/api/badges${qs.length ? "?" + qs.join("&") : ""}`);
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
    this.view = "map";
    this.board = null;
    this.picked = null;
    this.err = "";
    this.notice = "";
  }

  async switchView(view) {
    if (this.view === view) return;
    this.view = view;
    this.err = "";
    this.notice = "";
    try {
      if (view === "badges") await this.loadBadges();
      else await this.refresh();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  async writePh() {
    this.err = "";
    this.notice = "";
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
    this.notice = "";
    try {
      this.picked = await api(`/api/pits/${this.picked.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      await this.refresh();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  async setPitFilter(id) {
    this.pitFilter = id;
    this.err = "";
    try {
      await this.loadBadges();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  async setStatusFilter(e) {
    this.statusFilter = e.target.value;
    this.err = "";
    try {
      await this.loadBadges();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  wizSet(patch) {
    this.wizard = { ...this.wizard, ...patch };
  }

  wizMode(mode) {
    this.wizard = { mode, step: 1, pitId: "", number: "", badgeId: "" };
    this.err = "";
    this.notice = "";
  }

  newBadge() {
    this.wizMode("hang");
  }

  hangPits() {
    return this.board ? this.board.pits.filter((p) => !p.currentBadge) : [];
  }

  currentBadges() {
    if (!this.board) return [];
    return this.board.pits.map((p) => p.currentBadge).filter(Boolean);
  }

  removableBadges() {
    const me = this.user ? this.user.username : "";
    return this.currentBadges().filter((b) => this.user.role === "admin" || b.holderName === me);
  }

  wizValid() {
    const w = this.wizard;
    if (w.mode === "hang") return Boolean(w.pitId) && /^\d+$/.test(w.number) && Number(w.number) >= 1;
    return Boolean(w.badgeId);
  }

  wizNext() {
    if (this.wizValid()) this.wizSet({ step: 2 });
    this.err = "";
  }

  wizBack() {
    this.wizSet({ step: 1 });
    this.err = "";
  }

  async wizSubmit() {
    this.err = "";
    this.notice = "";
    const w = this.wizard;
    try {
      if (w.mode === "hang") {
        const b = await api("/api/badges", {
          method: "POST",
          body: JSON.stringify({ pit_id: Number(w.pitId), number: Number(w.number) }),
        });
        this.notice = `已把 #${b.number} 挂上 ${b.pitCode}，挂上人 ${b.holderName}`;
      } else {
        const b = await api(`/api/badges/${w.badgeId}/remove`, { method: "POST" });
        this.notice = `已摘下 ${b.pitCode} 的 #${b.number}`;
      }
      this.wizard = { mode: w.mode, step: 1, pitId: "", number: "", badgeId: "" };
      await this.loadBadges();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  startEdit(b) {
    this.editingId = b.id;
    this.editNumber = String(b.number);
    this.err = "";
  }

  cancelEdit() {
    this.editingId = 0;
  }

  async saveEdit() {
    this.err = "";
    try {
      await api(`/api/badges/${this.editingId}`, {
        method: "PATCH",
        body: JSON.stringify({ number: Number(this.editNumber) }),
      });
      this.editingId = 0;
      this.notice = "牌号已改";
      await this.loadBadges();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  canEdit(b) {
    return b.current && this.user && (this.user.role === "admin" || b.holderName === this.user.username);
  }

  renderLogin() {
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

  renderTopbar() {
    return html`<header class="topbar">
      <span class="brand">${this.board ? this.board.yard : "南冈鞣场"}</span>
      <nav>
        <button class=${this.view === "map" ? "on" : ""} @click=${() => this.switchView("map")}>坑位场地图</button>
        <button class=${this.view === "badges" ? "on" : ""} @click=${() => this.switchView("badges")}>工牌台</button>
      </nav>
      <span class="who">${this.user ? `${this.user.username}（${this.user.role === "admin" ? "管理员" : "操作工"}）` : ""}</span>
      <button @click=${this.logout}>退出</button>
    </header>`;
  }

  renderMap() {
    return html`
      <p>${this.board.village} · 点坑登记浸液酸碱度；放液须坑上挂有本人现行工牌，且最近读数 3.5～5.0</p>
      <div class="grid">
        ${this.board.pits.map(
          (p) => html`<button class="pit ${p.status}" @click=${() => (this.picked = p)}>
            <strong>${p.code}</strong><br />${LABELS[p.status]}<br />
            <small>${p.currentBadge ? `工牌 #${p.currentBadge.number} · ${p.currentBadge.holderName}` : "未挂工牌"}</small>
          </button>`
        )}
      </div>
      ${this.picked
        ? html`<section class="card">
            <h3>${this.picked.code} · ${LABELS[this.picked.status]}</h3>
            <p>最近酸碱度：${this.picked.latestPh ?? "无"} · ${this.picked.sampleCount} 次</p>
            <p>
              现行工牌：${this.picked.currentBadge
                ? html`#${this.picked.currentBadge.number} · ${this.picked.currentBadge.holderName} · ${fmtTime(this.picked.currentBadge.hungAt)} 挂上`
                : "未挂工牌"}
            </p>
            <input .value=${this.ph} @input=${(e) => (this.ph = e.target.value)} />
            <button @click=${this.writePh}>登记酸碱度</button>
            <div>
              <button @click=${() => this.setStatus("fill")}>注液</button>
              <button @click=${() => this.setStatus("tanning")}>鞣制中</button>
              <button @click=${() => this.setStatus("drained")}>已放液</button>
            </div>
          </section>`
        : ""}
    `;
  }

  renderBadgeRow(b) {
    if (this.editingId === b.id) {
      return html`<tr>
        <td>${b.pitCode}</td>
        <td><input type="number" min="1" step="1" .value=${this.editNumber} @input=${(e) => (this.editNumber = e.target.value)} /></td>
        <td>${b.holderName}</td>
        <td>${fmtTime(b.hungAt)}</td>
        <td>${fmtTime(b.removedAt)}</td>
        <td><span class="tag cur">现行</span></td>
        <td>
          <button @click=${this.saveEdit}>保存</button>
          <button @click=${this.cancelEdit}>取消</button>
        </td>
      </tr>`;
    }
    return html`<tr>
      <td>${b.pitCode}</td>
      <td>#${b.number}</td>
      <td>${b.holderName}</td>
      <td>${fmtTime(b.hungAt)}</td>
      <td>${fmtTime(b.removedAt)}</td>
      <td>${b.current ? html`<span class="tag cur">现行</span>` : html`<span class="tag off">已摘</span>`}</td>
      <td>${this.canEdit(b) ? html`<button @click=${() => this.startEdit(b)}>编辑</button>` : ""}</td>
    </tr>`;
  }

  renderWizard() {
    const w = this.wizard;
    const me = this.user ? this.user.username : "";
    const stepHead = html`<p class="steps">${w.step === 1 ? html`<b>① 选择</b> → ② 确认` : html`① 选择 → <b>② 确认</b>`}</p>`;
    if (w.mode === "hang") {
      const pits = this.hangPits();
      const pit = pits.find((p) => String(p.id) === String(w.pitId));
      return html`
        ${stepHead}
        ${w.step === 1
          ? html`
              <label>坑位（仅列未挂现行牌的坑）
                <select .value=${String(w.pitId)} @change=${(e) => this.wizSet({ pitId: e.target.value })}>
                  <option value="">请选择</option>
                  ${pits.map((p) => html`<option value=${p.id}>${p.code}（${LABELS[p.status]}）</option>`)}
                </select>
              </label>
              <label>牌号（正整数）
                <input type="number" min="1" step="1" .value=${w.number} @input=${(e) => this.wizSet({ number: e.target.value })} />
              </label>
              <p class="hint">挂上人：${me}（姓名只能写自己）</p>
              <button ?disabled=${!this.wizValid()} @click=${this.wizNext}>下一步</button>
            `
          : html`
              <div class="confirm">
                坑位：<b>${pit ? pit.code : ""}</b><br />
                牌号：<b>#${w.number}</b><br />
                挂上人：<b>${me}</b>
              </div>
              <button @click=${this.wizBack}>上一步</button>
              <button @click=${this.wizSubmit}>确认挂上</button>
            `}
      `;
    }
    const options = this.removableBadges();
    const sel = options.find((b) => String(b.id) === String(w.badgeId));
    return html`
      ${stepHead}
      ${w.step === 1
        ? html`
            <label>现行工牌（仅列可摘的）
              <select .value=${String(w.badgeId)} @change=${(e) => this.wizSet({ badgeId: e.target.value })}>
                <option value="">请选择</option>
                ${options.map((b) => html`<option value=${b.id}>${b.pitCode} · #${b.number} · ${b.holderName}</option>`)}
              </select>
            </label>
            <p class="hint">仅管理员或本人才可摘下</p>
            <button ?disabled=${!this.wizValid()} @click=${this.wizNext}>下一步</button>
          `
        : html`
            <div class="confirm">
              坑位：<b>${sel ? sel.pitCode : ""}</b><br />
              牌号：<b>#${sel ? sel.number : ""}</b><br />
              挂上人：<b>${sel ? sel.holderName : ""}</b> · ${sel ? fmtTime(sel.hungAt) : ""} 挂上
            </div>
            <button @click=${this.wizBack}>上一步</button>
            <button @click=${this.wizSubmit}>确认摘下</button>
          `}
    `;
  }

  renderBadges() {
    return html`
      <div class="badge-page">
        <div>
          <section class="card">
            <h3>按坑筛现行挂牌</h3>
            <ul class="pits">
              <li>
                <button class=${this.pitFilter === 0 ? "on" : ""} @click=${() => this.setPitFilter(0)}>
                  全部坑位<span class="cur">${this.currentBadges().length} 张现行</span>
                </button>
              </li>
              ${this.board.pits.map(
                (p) => html`<li>
                  <button class=${this.pitFilter === p.id ? "on" : ""} @click=${() => this.setPitFilter(p.id)}>
                    <span>${p.code}</span>
                    <span class="cur">${p.currentBadge ? `#${p.currentBadge.number} · ${p.currentBadge.holderName}` : "无牌"}</span>
                  </button>
                </li>`
              )}
            </ul>
          </section>
          <section class="card">
            <div class="listhead">
              <h3>工牌列表</h3>
              <span>
                <select .value=${this.statusFilter} @change=${this.setStatusFilter}>
                  <option value="all">全部</option>
                  <option value="current">现行</option>
                  <option value="removed">已摘</option>
                </select>
                <button @click=${this.newBadge}>新建挂牌</button>
              </span>
            </div>
            ${this.badges.length
              ? html`<table>
                  <thead>
                    <tr><th>坑码</th><th>牌号</th><th>姓名</th><th>挂上时刻</th><th>摘下时刻</th><th>状态</th><th>操作</th></tr>
                  </thead>
                  <tbody>
                    ${this.badges.map((b) => this.renderBadgeRow(b))}
                  </tbody>
                </table>`
              : html`<p class="hint">无记录</p>`}
          </section>
        </div>
        <section class="card">
          <div class="tabs">
            <button class=${this.wizard.mode === "hang" ? "on" : ""} @click=${() => this.wizMode("hang")}>挂上</button>
            <button class=${this.wizard.mode === "remove" ? "on" : ""} @click=${() => this.wizMode("remove")}>摘下</button>
          </div>
          ${this.renderWizard()}
        </section>
      </div>
    `;
  }

  render() {
    if (!this.ready) return this.renderLogin();
    if (!this.board) return html`<div class="wrap">${this.err || "装载坑位…"}</div>`;
    return html`<div class="wrap">
      ${this.renderTopbar()}
      ${this.view === "map" ? this.renderMap() : this.renderBadges()}
      ${this.err ? html`<p class="err">${this.err}</p>` : ""}
      ${this.notice ? html`<p class="notice">${this.notice}</p>` : ""}
    </div>`;
  }
}

customElements.define("tan-yard", TanYard);
