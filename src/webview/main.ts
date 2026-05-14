declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

const vscode = acquireVsCodeApi();
const app = document.getElementById("app")!;
let state: WebviewState | undefined;
let stateReceivedAt = Date.now();
let appClickBound = false;

interface WebviewState {
  page: "review" | "stats" | "settings";
  selectedMode: ReviewMode;
  current?: CurrentReviewDto;
  queueCount: number;
  totalCount: number;
  stats: StatsProblemDto[];
  settings: Record<string, unknown>;
  message?: string;
}

type ReviewMode = "normal" | "quick";
type ReviewRatingName = "Again" | "Hard" | "Good" | "Easy";
type ReviewOutcome = "again" | "hard" | "easy";

interface ReviewProblemDto {
  id: string;
  title: string;
  url: string;
  platform?: string;
  tags: string[];
  mdPath: string;
  cppPath?: string;
  due: string;
  state: number;
  reps: number;
  normalReviews: number;
  quickReviews: number;
}

interface CurrentReviewDto extends ReviewProblemDto {
  mode: ReviewMode;
  activeDurationMs: number;
  isPaused: boolean;
}

interface StatsProblemDto extends ReviewProblemDto {
  totalDurationMs: number;
  lastDurationMs?: number;
  lastReviewedAt?: string;
}

app.innerHTML = `<div class="loading">正在加载 CPI...</div>`;

window.addEventListener("message", (event) => {
  if (event.data?.type === "state") {
    state = event.data.state;
    stateReceivedAt = Date.now();
    render();
  }
});

send({ type: "ready" });

function send(message: Record<string, unknown>): void {
  vscode.postMessage(message);
}

function render(): void {
  if (!state) {
    return;
  }
  app.innerHTML = `
    <header class="top">
      <div>
        <h1>CPI Review</h1>
        <p>${state.queueCount} due · ${state.totalCount} total</p>
      </div>
      <button data-action="undo" class="btn btn-black">撤销</button>
    </header>
    ${state.message ? `<div class="notice">${escapeHtml(state.message)}</div>` : ""}
    <nav class="tabs">
      ${tab("review", "复习")}
      ${tab("stats", "统计")}
      ${tab("settings", "设置")}
    </nav>
    <section>${renderPage()}</section>
  `;
  bind();
  updateTimer();
}

function tab(page: string, label: string): string {
  return `<button data-page="${page}" class="tab ${state?.page === page ? "active" : ""}">${label}</button>`;
}

function renderPage(): string {
  if (!state) {
    return "";
  }
  if (state.page === "stats") {
    return renderStats(state.stats);
  }
  if (state.page === "settings") {
    return renderSettings(state.settings);
  }
  return renderReview(state.current);
}

function renderReview(problem?: CurrentReviewDto): string {
  if (!state) {
    return "";
  }
  if (!problem) {
    return renderStart();
  }

  return `
    <article class="problem">
      <div class="meta">${escapeHtml(problem.platform || "problem")} · reps ${problem.reps}</div>
      <h2>${escapeHtml(problem.title)}</h2>
      <div class="tags">${problem.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
      <dl>
        <div><dt>Due</dt><dd>${formatDate(problem.due)}</dd></div>
        <div><dt>常规</dt><dd>${problem.normalReviews}</dd></div>
        <div><dt>快速</dt><dd>${problem.quickReviews}</dd></div>
      </dl>
    </article>
    <div class="timer-row">
      <span>本题计时</span>
      <strong data-timer>${formatDuration(problem.activeDurationMs)}</strong>
      <small>${problem.isPaused ? "已暂停" : "进行中"}</small>
    </div>
    ${renderOpenButtons(problem)}
    ${renderModeSwitch(state.selectedMode)}
    <div class="feedback">
      ${renderFeedbackButtons(state.selectedMode)}
    </div>
    <div class="actions">
      <button data-action="togglePause" class="btn btn-orange">${problem.isPaused ? "继续" : "暂停"}</button>
      <button data-action="exitReview" class="btn btn-black">退出</button>
    </div>
  `;
}

function renderStart(): string {
  if (!state) {
    return "";
  }
  const hasDue = state.queueCount > 0;
  return `
    <div class="start-panel">
      <h2>${hasDue ? "准备复习" : "今天没有到期题目"}</h2>
      <p>${hasDue ? "选择复习方式后开始第一道题。" : "题库会根据 FSRS 到期时间自动进入队列。"}</p>
      ${renderModeSwitch(state.selectedMode)}
      <button data-action="startNext" data-primary-start class="btn btn-green btn-block" ${hasDue ? "" : "disabled"}>开始复习</button>
    </div>
  `;
}

function renderModeSwitch(mode: ReviewMode): string {
  const checked = mode === "quick" ? "checked" : "";
  const modeText = mode === "quick" ? "快速复习模式" : "常规复习模式";
  return `
    <label class="mode-toggle">
      <input data-mode-toggle type="checkbox" ${checked}>
      <span class="toggle-track" aria-hidden="true"></span>
      <span class="mode-text">${modeText}</span>
    </label>
  `;
}

function renderFeedbackButtons(mode: ReviewMode): string {
  const buttons: Array<{ outcome: ReviewOutcome; label: string; className: string }> = [
    { outcome: "again", label: "失败", className: "btn-red" },
    { outcome: "hard", label: "困难", className: "btn-orange" },
    { outcome: "easy", label: "轻松", className: "btn-green" }
  ];
  return buttons.map((button) => `
    <button data-outcome="${button.outcome}" data-rate="${ratingForOutcome(button.outcome, mode)}" class="btn ${button.className}" type="button">
      ${button.label}
    </button>
  `).join("");
}

function ratingForOutcome(outcome: ReviewOutcome, mode: ReviewMode): ReviewRatingName {
  if (outcome === "again") {
    return "Again";
  }
  if (outcome === "hard") {
    return "Hard";
  }
  return mode === "quick" ? "Good" : "Easy";
}

function renderOpenButtons(problem: ReviewProblemDto): string {
  return `
    <div class="open-row">
      ${problem.cppPath ? `<button data-action="openCpp" data-path="${escapeAttr(problem.cppPath)}" class="btn">打开 cpp</button>` : ""}
      <button data-action="openMarkdown" data-path="${escapeAttr(problem.mdPath)}" class="btn">打开题面</button>
      <button data-action="openUrl" data-url="${escapeAttr(problem.url)}" class="btn">打开链接</button>
    </div>
  `;
}

function renderStats(items: StatsProblemDto[]): string {
  const totalMs = items.reduce((sum, item) => sum + item.totalDurationMs, 0);
  const due = items.filter((item) => Date.parse(item.due) <= Date.now()).length;
  return `
    <div class="summary">
      <div><strong>${items.length}</strong><span>题目</span></div>
      <div><strong>${due}</strong><span>到期</span></div>
      <div><strong>${formatDuration(totalMs)}</strong><span>总耗时</span></div>
    </div>
    <table>
      <thead><tr><th>题目</th><th>Due</th><th>次数</th><th>耗时</th></tr></thead>
      <tbody>
        ${items.map((item) => `
          <tr>
            <td>${escapeHtml(item.title)}<small>${escapeHtml(item.platform || "")}</small></td>
            <td>${formatDate(item.due)}</td>
            <td>${item.normalReviews}/${item.quickReviews}</td>
            <td>${formatDuration(item.totalDurationMs)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderSettings(settings: Record<string, unknown>): string {
  return `
    <div class="settings">
      ${textSetting("problemsetPath", "problemset 路径", settings.problemsetPath)}
      ${toggle("autoOpenCpp", "自动打开 cpp", settings.autoOpenCpp)}
      ${toggle("openMarkdownPreviewToSide", "右侧打开渲染题面", settings.openMarkdownPreviewToSide)}
      ${textSetting("templateCppPath", "template.cpp 路径", settings.templateCppPath)}
      ${toggle("openOriginalUrl", "自动打开原题链接", settings.openOriginalUrl)}
      ${toggle("autoAdvanceAfterRating", "反馈后自动下一题", settings.autoAdvanceAfterRating)}
      ${toggle("strictTwoEditorTabs", "严格双窗口控制", settings.strictTwoEditorTabs)}
      ${toggle("reopenPreviousEditorsOnUndo", "撤销后恢复上一题窗口", settings.reopenPreviousEditorsOnUndo)}
    </div>
  `;
}

function toggle(key: string, label: string, value: unknown): string {
  return `<label class="setting"><span>${label}</span><input data-setting="${key}" type="checkbox" ${value ? "checked" : ""}></label>`;
}

function textSetting(key: string, label: string, value: unknown): string {
  return `<label class="setting vertical"><span>${label}</span><input data-setting="${key}" type="text" value="${escapeAttr(String(value ?? ""))}"></label>`;
}

function bind(): void {
  if (!appClickBound) {
    app.addEventListener("click", handleClick);
    appClickBound = true;
  }
  app.querySelector<HTMLInputElement>("[data-mode-toggle]")?.addEventListener("change", handleModeToggle);
  app.querySelectorAll<HTMLInputElement>("[data-setting]").forEach((input) => {
    input.addEventListener("change", () => {
      send({ type: "updateSetting", key: input.dataset.setting, value: input.type === "checkbox" ? input.checked : input.value });
    });
  });
  if (!state?.current) {
    app.querySelector<HTMLButtonElement>("[data-primary-start]:not(:disabled)")?.focus();
  }
}

function handleClick(event: MouseEvent): void {
  const target = event.target instanceof Element ? event.target : undefined;
  const button = target?.closest<HTMLElement>("[data-page], [data-action], [data-rate]");
  if (!button) {
    return;
  }
  const page = button.dataset.page;
  if (page) {
    send({ type: "switchPage", page });
    return;
  }
  const action = button.dataset.action;
  if (action) {
    if (action === "startNext") send({ type: "startNext", mode: state?.selectedMode ?? "normal" });
    if (action === "togglePause") send({ type: "togglePause" });
    if (action === "exitReview") send({ type: "exitReview" });
    if (action === "undo") send({ type: "undo" });
    if (action === "openCpp") send({ type: "openCpp", path: button.dataset.path });
    if (action === "openMarkdown") send({ type: "openMarkdown", path: button.dataset.path });
    if (action === "openUrl") send({ type: "openUrl", url: button.dataset.url });
    return;
  }
  const rating = button.dataset.rate;
  if (rating) {
    send({ type: "rate", rating, mode: state?.selectedMode ?? "normal" });
  }
}

function handleModeToggle(event: Event): void {
  const input = event.target as HTMLInputElement;
  const mode: ReviewMode = input.checked ? "quick" : "normal";
  setLocalMode(mode);
  send({ type: "setMode", mode });
}

function setLocalMode(mode: ReviewMode): void {
  if (!state) {
    return;
  }
  state.selectedMode = mode;
  render();
}

function updateTimer(): void {
  const timer = app.querySelector<HTMLElement>("[data-timer]");
  if (!timer || !state?.current) {
    return;
  }
  const extraMs = state.current.isPaused ? 0 : Date.now() - stateReceivedAt;
  timer.textContent = formatDuration(state.current.activeDurationMs + extraMs);
}

window.setInterval(updateTimer, 1000);

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function formatDuration(ms: number): string {
  const safeMs = Math.max(0, ms);
  const hours = Math.floor(safeMs / 3600000);
  const minutes = Math.floor((safeMs % 3600000) / 60000);
  const seconds = Math.floor((safeMs % 60000) / 1000);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]!));
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}
