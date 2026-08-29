/* 新媒学园 · 主逻辑 */
(function () {
  "use strict";
  const M = window.MEDIA;
  const $ = (s) => document.querySelector(s);
  const KEY = "newmedia_state_v1";
  const ENTRANCE_YEAR = 2025; // 入学年份：如果你是 2024/2026 级，改这个数字即可重新定位学期

  const todayStr = () => {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  };
  const dayOffset = (n) => {
    const d = new Date(); d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  };

  let S;
  function load() {
    try { S = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { S = {}; }
    S.checkins = S.checkins || {};
    S.labDone = S.labDone || {};     // labIdx -> stars(1-5)
    S.log = S.log || {};             // date -> {lab:n, formula:n, clinic:n}
    S.folios = S.folios || [];
    S.labArchive = S.labArchive || [];  // 标题成长档案
    S.topicsDone = S.topicsDone || {};  // 选题库已做标记
    S.theme = S.theme || "light";
    S.lastLab = S.lastLab == null ? -1 : S.lastLab;
    S.ai = S.ai || { provider: "zhipu", key: "" };
  }
  const save = () => localStorage.setItem(KEY, JSON.stringify(S));
  const todayLog = () => (S.log[todayStr()] = S.log[todayStr()] || { lab: 0, formula: 0, clinic: 0 });

  let toastTimer;
  function toast(msg) {
    let t = $(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }
  function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }
  function streak() { let n = 0; while (S.checkins[dayOffset(-n)]) n++; return n; }

  /* ---------- AI 批改教练 ---------- */
  const AI_CFG = {
    zhipu: { url: "https://open.bigmodel.cn/api/paas/v4/chat/completions", model: "glm-4-flash", help: "获取：打开 bigmodel.cn → 注册登录 → 控制台「API Keys」→ 新建并复制粘贴到上面。GLM-4-Flash 免费。" },
    siliconflow: { url: "https://api.siliconflow.cn/v1/chat/completions", model: "Qwen/Qwen2.5-7B-Instruct", help: "获取：打开 siliconflow.cn → 注册 → 「API 密钥」新建复制。该模型免费。" },
    deepseek: { url: "https://api.deepseek.com/chat/completions", model: "deepseek-chat", help: "获取：打开 platform.deepseek.com → API Keys 新建。需充值少量余额（很便宜）。" },
  };
  const aiReady = () => !!(S.ai.key && AI_CFG[S.ai.provider]);
  async function aiChat(system, user) {
    const cfg = AI_CFG[S.ai.provider];
    const resp = await fetch(cfg.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + S.ai.key },
      body: JSON.stringify({ model: cfg.model, temperature: 0.4, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    });
    if (!resp.ok) throw new Error("接口返回 " + resp.status + "（" + (resp.status === 401 ? "Key 无效" : resp.status === 429 ? "请求过快/额度不足" : "网络或服务异常") + "）");
    const j = await resp.json();
    return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || "").trim();
  }
  function renderAICard() {
    const sel = $("#aiProvider"), keyIn = $("#aiKey");
    sel.value = S.ai.provider; keyIn.value = S.ai.key;
    const showHelp = () => $("#aiHelp").textContent = AI_CFG[sel.value].help;
    showHelp();
    sel.onchange = showHelp;
    $("#aiStatus").textContent = aiReady() ? "· 已连接 " + sel.options[sel.selectedIndex].text.split("（")[0] : "· 未配置";
    $("#aiClear").style.display = aiReady() ? "" : "none";
    $("#aiSave").onclick = () => {
      const k = keyIn.value.trim();
      if (!k) { toast("先把 Key 粘贴进来"); return; }
      S.ai.provider = sel.value; S.ai.key = k; save();
      renderAICard(); toast("Key 已保存到本机，AI 教练上线！");
    };
    $("#aiClear").onclick = () => { S.ai.key = ""; save(); keyIn.value = ""; renderAICard(); toast("已清除 Key"); };
  }
  async function aiJudge(myTitle, material, refs, resultBox, btn) {
    if (!aiReady()) { toast("先到「今日」页最下方配置 AI Key（免费）"); return; }
    btn.disabled = true; btn.textContent = "AI 思考中……";
    try {
      const txt = await aiChat(
        "你是严格又亲切的新媒体文案老师。学生根据素材写了一个标题。请从具体性、情绪钩子、传播力三方面各用一句话点评，再给 1-10 分和一条最有价值的改法。全部中文，总数不超过 140 字，不要客套。",
        "素材：" + material + "\n学生标题：" + myTitle + "\n参考标题：" + refs.map((r) => r.title).join(" / ")
      );
      resultBox.innerHTML = '<b>🤖 AI 老师点评</b><br>' + txt.replace(/\n/g, "<br>");
      resultBox.hidden = false;
    } catch (e) {
      resultBox.innerHTML = "AI 调用失败：" + e.message + "。若提示跨域，请用本地服务器或部署后访问。";
      resultBox.hidden = false;
    }
    btn.disabled = false; btn.textContent = "让 AI 点评我的标题";
  }

  /* ---------- 路由 ---------- */
  function initTabs() {
    document.querySelectorAll("#tabbar .tab").forEach((b) => {
      b.addEventListener("click", () => {
        document.querySelectorAll("#tabbar .tab").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        document.querySelectorAll(".page").forEach((p) => (p.hidden = p.id !== b.dataset.page));
        window.scrollTo(0, 0);
        if (b.dataset.page === "page-home") renderHome();
      });
    });
    document.querySelectorAll(".qn-grid button").forEach((b) => b.onclick = () => document.querySelector('#tabbar .tab[data-page="' + b.dataset.go + '"]').click());
  }

  /* ---------- 今日页 ---------- */
  function renderHome() {
    const q = M.quotes[new Date().getDate() % M.quotes.length];
    $("#quoteEn").textContent = "\u201C" + q.en + "\u201D";
    $("#quoteCn").textContent = q.cn;
    const n = streak();
    $("#streakDays").textContent = n; $("#homeStreak").textContent = n;
    const ck = $("#checkinBtn"), t = todayStr();
    if (S.checkins[t]) { ck.textContent = "已打卡 ✓"; ck.disabled = true; ck.classList.add("btn-checked"); }
    else { ck.textContent = "手动打卡"; ck.disabled = false; ck.classList.remove("btn-checked"); }
    ck.onclick = () => { S.checkins[t] = true; save(); renderHome(); toast("打卡成功！"); };
    const lg = todayLog();
    const tasks = [
      { ico: "✍", title: "练一组标题", desc: lg.lab ? "已完成 " + lg.lab + " 组，手感正热" : "去标题实验室写 1 条", done: lg.lab > 0, go: "page-train" },
      { ico: "💡", title: "学 1 个爆款公式", desc: lg.formula ? "今天已研究 " + lg.formula + " 个" : "公式库里挑一个拆解", done: lg.formula > 0, go: "page-train" },
    ];
    const doneN = tasks.filter((x) => x.done).length;
    $("#taskProgress").textContent = "(" + doneN + "/" + tasks.length + ")";
    const list = $("#taskList"); list.innerHTML = "";
    tasks.forEach((tk) => {
      const el = document.createElement("div");
      el.className = "task" + (tk.done ? " done" : "");
      el.innerHTML = '<div class="t-ico">' + tk.ico + '</div><div><div class="t-title">' + tk.title + '</div><div class="t-desc">' + tk.desc + '</div></div><div class="t-check">' + (tk.done ? "✓" : "") + "</div>";
      el.onclick = () => document.querySelector('#tabbar .tab[data-page="' + tk.go + '"]').click();
      list.appendChild(el);
    });
    if (doneN === tasks.length && !S.checkins[t]) { S.checkins[t] = true; save(); renderHome(); toast("今日任务全部完成，自动打卡！"); }
    renderDailyConcept();
    renderStats();
    $("#dataInfo").textContent = "内容库版本 " + M.version + " · 路线 " + M.roadmap.length + " 学期 · 课程速通 " + M.courses.length + " 门 · 标题训练 " + M.titleLabs.length + " 组 · 资源 " + M.resources.length + " 项。想加内容：把 js/data.js 发给任意 AI 说明需求即可。";
  }
  /* 每日概念：按日期固定，换一个随机 */
  let conceptPool = null, conceptIdx = 0;
  function renderDailyConcept(random) {
    if (!conceptPool) {
      conceptPool = [];
      M.courses.forEach((c) => c.concepts.forEach((k) => conceptPool.push({ t: k.t, d: k.d, course: c.name, icon: c.icon })));
      let h = 0; const ds = todayStr();
      for (let i = 0; i < ds.length; i++) h = (h * 31 + ds.charCodeAt(i)) >>> 0;
      conceptIdx = h % conceptPool.length;
    }
    if (random) conceptIdx = (conceptIdx + 1 + Math.floor(Math.random() * (conceptPool.length - 1))) % conceptPool.length;
    const k = conceptPool[conceptIdx];
    $("#dcTerm").textContent = k.t;
    $("#dcDef").textContent = k.d;
    $("#dcCourse").textContent = "· " + k.course;
    $("#dcShuffle").onclick = () => renderDailyConcept(true);
    $("#dcGo").onclick = () => document.querySelector('#tabbar .tab[data-page="page-course"]').click();
  }
  /* 学习数据：统计 + 热力图 */
  function renderStats() {
    const total = Object.keys(S.checkins).length;
    const items = [
      [streak(), "连续天数"],
      [total, "累计打卡"],
      [Object.keys(S.labDone).length, "标题已练"],
      [S.folios.length, "作品数"],
    ];
    $("#statRow").innerHTML = items.map((x) => '<div class="stat-item"><b>' + x[0] + "</b><span>" + x[1] + "</span></div>").join("");
    renderBars14();
    renderHeatmap();
  }
  function renderHeatmap() {
    const box = $("#heatmap");
    if (!box) return;
    box.innerHTML = "";
    const today = new Date();
    const dow = (today.getDay() + 6) % 7;
    const start = new Date(today); start.setDate(start.getDate() - dow - 77);
    const t = todayStr();
    for (let i = 0; i < 84; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      const cell = document.createElement("div");
      cell.className = "heat-cell" + (S.checkins[key] ? " l2" : "") + (key === t ? " today" : "");
      cell.title = key + (S.checkins[key] ? " 已打卡" : "");
      box.appendChild(cell);
    }
  }

  /* ---------- 路线图 ---------- */
  function currentTermIndex() {
    const d = new Date();
    let y = d.getFullYear(), m = d.getMonth() + 1;
    if (m === 8) { m = 9; } // 暑假末尾按新学期算
    const ac = y - ENTRANCE_YEAR + (m >= 9 || m <= 1 ? 0 : -1);
    const idx = ac * 2 + (m >= 9 || m <= 1 ? 0 : 1) - 2; // 相对大二上
    return Math.max(0, Math.min(M.roadmap.length - 1, idx));
  }
  function renderRoad() {
    // 专业认知卡
    $("#majorLiner").textContent = M.majorIntro.oneLiner;
    $("#evoLine").innerHTML = M.majorIntro.evolution.map((e) => '<div class="evo-item"><span class="evo-era">' + e.era + "</span><span>" + e.text + "</span></div>").join("");
    $("#majorInsights").innerHTML = '<div class="road-sub">三条关键认知</div>' + M.majorIntro.insights.map((x) => '<div class="skill-item"><p class="how">◆ ' + x + "</p></div>").join("");
    // 学期路线
    const cur = currentTermIndex(), box = $("#roadList");
    box.innerHTML = "";
    M.roadmap.forEach((r, i) => {
      const el = document.createElement("div");
      el.className = "road-item" + (i === cur ? " now open" : "");
      el.innerHTML =
        '<div class="road-head"><span class="term">' + r.term + '</span>' +
        (i === cur ? '<span class="now-tag">你在这里</span>' : "") +
        '<span class="arrow">▾</span></div>' +
        '<div class="road-body">' +
        '<div class="road-sub">学校大概会开</div><div class="course-chips">' + r.courses.map((c) => "<span>" + c + "</span>").join("") + "</div>" +
        '<div class="road-sub">课下要练的</div>' +
        r.skills.map((s) => '<div class="skill-item"><b>' + s.name + '</b><div class="why">为什么：' + s.why + '</div><div class="how">怎么练：' + s.how + "</div></div>").join("") +
        '<div class="milestone-box">🎯 学期末小目标：' + r.milestone + "</div>" +
        '<div class="pitfall-box">⚠️ 避坑：' + r.pitfall + "</div>" +
        "</div>";
      el.querySelector(".road-head").onclick = () => el.classList.toggle("open");
      box.appendChild(el);
    });
    // 就业方向
    $("#careerList").innerHTML = M.careers.map((c) =>
      '<div class="skill-item"><b>' + c.name + '</b><div class="how" style="margin-top:4px">' + c.what + '</div><div class="why">薪资参考：' + c.salary + '</div><div class="how">要练：' + c.need + "</div></div>"
    ).join("");
  }

  /* ---------- 训练场 ---------- */
  let curTrain = "lab";
  function initTrainTabs() {
    document.querySelectorAll("#trainTabs .subtab").forEach((b) => {
      b.onclick = () => {
        document.querySelectorAll("#trainTabs .subtab").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        curTrain = b.dataset.t;
        renderTrain();
      };
    });
  }
  function renderTrain() {
    const area = $("#trainArea");
    if (curTrain === "lab") renderLab(area);
    else if (curTrain === "formula") renderFormula(area);
    else if (curTrain === "open") area.innerHTML = M.openings.map((o) => '<div class="open-card"><span class="ot">' + o.type + '</span><div class="theme">练习主题：' + o.theme + '</div><div class="demo">' + o.demo + '</div><div class="why">技巧：' + o.why + "</div></div>").join("");
    else if (curTrain === "script") renderScript(area);
    else if (curTrain === "poster") renderPoster(area);
    else if (curTrain === "prompt") renderPrompt(area);
    else if (curTrain === "adlab") renderAdLab(area);
    else if (curTrain === "growth") renderGrowth(area);
    else if (curTrain === "topics") renderTopics(area);
    else renderClinic(area);
  }
  /* 短视频脚本训练 */
  function renderScript(area) {
    const ex = M.scriptKit.example;
    area.innerHTML =
      M.scriptKit.rules.map((r) => '<div class="open-card"><span class="ot">' + r.name + '</span><div class="why" style="margin-top:6px">' + r.detail + "</div></div>").join("") +
      '<div class="card"><p class="card-title">' + ex.title + '</p>' +
      '<div class="storyboard">' +
      '<div class="sb-row sb-head">' + ["镜号", "景别", "画面内容", "台词/声音", "时长", "目的"].map((h) => "<span>" + h + "</span>").join("") + "</div>" +
      ex.rows.map((r) => '<div class="sb-row">' + r.map((cell) => "<span>" + cell + "</span>").join("") + "</div>").join("") +
      "</div>" +
      '<div class="tip-box">💡 ' + ex.note + "</div></div>" +
      '<div class="card"><p class="card-title">练习主题（拿纸笔或备忘录写分镜表）</p>' +
      M.scriptKit.drills.map((d) => '<div class="starter-item"><div class="starter-num">✎</div><div><b>' + d.theme + "</b><p>" + d.hint + "</p></div></div>").join("") +
      "</div>";
  }
  /* 标题成长档案 */
  function renderArchive(area) {
    const list = S.labArchive;
    if (!list.length) return "";
    return '<div class="card"><p class="card-title">我的标题档案（' + list.length + ' 条）</p>' +
      list.slice(0, 10).map((a) =>
        '<div class="arch-item"><span class="arch-star">' + "★".repeat(a.stars) + "☆".repeat(5 - a.stars) + '</span><div><div class="arch-title">' + a.title + '</div><div class="arch-meta">' + a.date + " · 素材：" + a.material.slice(0, 18) + "…" + (a.ai ? " · AI 已点评" : "") + "</div></div></div>"
      ).join("") +
      '<p class="muted small" style="margin-top:8px">只显示最近 10 条。每写一条并保存，就会自动进档案——三个月后回看，进步会吓你一跳。</p></div>';
  }
  function renderLab(area) {
    let idx = Math.floor(Math.random() * M.titleLabs.length);
    if (M.titleLabs.length > 1 && idx === S.lastLab) idx = (idx + 1) % M.titleLabs.length;
    const lab = M.titleLabs[idx];
    const doneN = Object.keys(S.labDone).length;
    area.innerHTML =
      '<div class="lab-card">' +
      '<div class="lab-label">训练素材 <span style="float:right">已练 ' + doneN + "/" + M.titleLabs.length + " 组</span></div>" +
      '<div class="lab-material">' + lab.material + "</div>" +
      '<div class="lab-label">第一步：给这个素材起 1 个标题，写在下面</div>' +
      '<textarea class="lab-input" id="labMine" rows="2" placeholder="你的标题……（别想太久，先写出来）"></textarea>' +
      '<div class="lab-actions"><button class="btn btn-primary" id="labReveal">写好了，看参考</button></div>' +
      '<div class="refs" id="labRefs">' +
      lab.refs.map((r) => '<div class="ref-item"><span class="style">' + r.style + '</span><span class="title">' + r.title + "</span></div>").join("") +
      '<div class="tip-box">💡 ' + lab.tip + "</div>" +
      '<div class="lab-actions" style="margin-top:10px"><button class="btn btn-ghost" id="aiRate" style="flex:1;visibility:hidden">🤖 让 AI 点评我的标题</button></div>' +
      '<div class="ai-result" id="aiResult" hidden></div>' +
      '<div class="lab-label">第二步：给自己的标题打分（诚实一点，5 星 = 不比参考差）</div>' +
      '<div class="stars" id="labStars">' + [1, 2, 3, 4, 5].map((n) => '<button data-s="' + n + '">★</button>').join("") + '<span class="star-label" id="starLabel"></span></div>' +
      '<div class="lab-actions"><button class="btn btn-ghost" id="labNext">保存，来下一组</button></div>' +
      "</div>" + renderTrend() + "</div>";
    const reveal = $("#labReveal");
    reveal.onclick = () => {
      if (!$("#labMine").value.trim()) { toast("先写一个你自己的标题，写烂也比不写强"); return; }
      $("#labRefs").classList.add("show");
      reveal.textContent = "参考已放出"; reveal.disabled = true;
      $("#aiRate").style.visibility = "visible";
    };
    $("#aiRate").onclick = () => {
      const my = $("#labMine").value.trim();
      if (!my) { toast("先写下你的标题，AI 才有得评"); return; }
      aiJudge(my, lab.material, lab.refs, $("#aiResult"), $("#aiRate"));
    };
    let star = 0;
    document.querySelectorAll("#labStars button").forEach((b) => {
      b.onclick = () => { star = +b.dataset.s; document.querySelectorAll("#labStars button").forEach((x) => x.classList.toggle("on", +x.dataset.s <= star)); $("#starLabel").textContent = star + " 星"; };
    });
    $("#labNext").onclick = () => {
      if (!star) { toast("先给自己打个星"); return; }
      const my = $("#labMine").value.trim();
      if (!my) { toast("标题还没写呢"); return; }
      S.labDone[idx] = star; S.lastLab = idx;
      S.labArchive.unshift({ title: my, material: lab.material, stars: star, date: todayStr(), ai: !$("#aiResult").hidden ? $("#aiResult").textContent.slice(0, 200) : "" });
      S.labArchive = S.labArchive.slice(0, 100);
      const lg = todayLog(); lg.lab++;
      save(); renderHome(); renderTrain();
      toast("已记录！练习 +1");
    };
    area.insertAdjacentHTML("beforeend", renderArchive(area));
  }
  function renderFormula(area) {
    area.innerHTML = M.formulas.map((f, i) =>
      '<div class="formula-item" data-i="' + i + '"><div class="formula-head"><span class="fn">' + f.name + '</span><span class="arrow">▾</span></div>' +
      '<div class="formula-body"><div class="pattern">公式：' + f.pattern + "</div>" +
      f.examples.map((e) => '<div class="ex">例：' + e + "</div>").join("") +
      '<div class="scene">适用：' + f.scene + "</div></div></div>"
    ).join("");
    document.querySelectorAll(".formula-item .formula-head").forEach((h) => {
      h.onclick = () => {
        const it = h.parentElement;
        const opening = !it.classList.contains("open");
        document.querySelectorAll(".formula-item").forEach((x) => x.classList.remove("open"));
        if (opening) { it.classList.add("open"); const lg = todayLog(); if (!lg.formula) { lg.formula = 1; save(); renderHome(); } }
      };
    });
  }
  function renderClinic(area) {
    area.innerHTML = M.clinics.map((c, i) =>
      '<div class="formula-item" data-i="' + i + '"><div class="formula-head"><span class="fn">门诊 #' + (i + 1) + '</span><span class="arrow">▾</span></div>' +
      '<div class="formula-body clinic">' +
      '<div class="before"><span class="tag b">改前</span>' + c.before + "</div>" +
      '<div class="after"><span class="tag a">改后</span>' + c.after + "</div>" +
      '<div class="diag">' + c.diagnosis + "</div></div></div>"
    ).join("");
    document.querySelectorAll("#trainArea .formula-item").forEach((it) => {
      if (!it.querySelector(".clinic")) return;
      const h = it.querySelector(".formula-head");
      h.onclick = () => {
        it.classList.toggle("open");
        if (it.classList.contains("open")) { const lg = todayLog(); lg.clinic++; save(); }
      };
    });
  }
  function renderStarter() {
    $("#starterList").innerHTML = M.starterGuide.map((s) =>
      '<div class="starter-item"><div class="starter-num">' + s.step + "</div><div><b>" + s.name + "</b><p>" + s.detail + "</p></div></div>"
    ).join("");
  }

  /* ---------- 资源库 ---------- */
  let resCat = "全部";
  function renderRes() {
    const cats = ["全部", ...new Set(M.resources.map((r) => r.cat))];
    const chips = $("#catChips");
    chips.innerHTML = "";
    cats.forEach((c) => {
      const b = document.createElement("button");
      b.textContent = c; b.className = c === resCat ? "active" : "";
      b.onclick = () => { resCat = c; renderRes(); };
      chips.appendChild(b);
    });
    const kw = ($("#resSearch").value || "").trim().toLowerCase();
    const filtered = M.resources.filter((r) =>
      (resCat === "全部" || r.cat === resCat) &&
      (!kw || r.name.toLowerCase().includes(kw) || r.note.toLowerCase().includes(kw) || r.cat.includes(kw))
    );
    const box = $("#resList"); box.innerHTML = "";
    if (!filtered.length) { box.innerHTML = '<div class="card muted">没有匹配的资源，换个关键词试试。</div>'; return; }
    const byCat = {};
    filtered.forEach((r) => (byCat[r.cat] = byCat[r.cat] || []).push(r));
    Object.keys(byCat).forEach((cat) => {
      const g = document.createElement("div");
      g.className = "res-group";
      g.innerHTML = '<div class="rg-name">' + cat + "</div>" +
        byCat[cat].map((r) => '<div class="res-item"><b>' + r.name + "</b><span>" + r.note + "</span></div>").join("");
      box.appendChild(g);
    });
  }

  /* ---------- 作品集 ---------- */
  function renderFolio() {
    const list = $("#folioList");
    $("#folioCount").textContent = "共 " + S.folios.length + " 件";
    list.innerHTML = "";
    if (!S.folios.length) {
      list.innerHTML = '<div class="card folio-empty">' +
        '<svg viewBox="0 0 240 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="fg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c4b5fd"/><stop offset="1" stop-color="#f9a8d4"/></linearGradient></defs>' +
        '<rect x="28" y="18" width="118" height="96" rx="8" fill="#ffffff" stroke="#c4b5fd" stroke-width="2.5" transform="rotate(-5 87 66)"/>' +
        '<rect x="44" y="28" width="118" height="96" rx="8" fill="#ffffff" stroke="#a78bfa" stroke-width="2.5" transform="rotate(4 103 76)"/>' +
        '<path d="M96 62 l7 15 16 3.5 -11.5 12 2.5 16.5 -14 -7.5 -14 7.5 2.5 -16.5 -11.5 -12 16 -3.5 Z" fill="url(#fg1)"/>' +
        '<circle cx="200" cy="30" r="7" fill="#fde68a"/>' +
        '<circle cx="26" cy="120" r="5" fill="#c4b5fd"/>' +
        '<path d="M182 108 l4 9 9 4 -9 4 -4 9 -4 -9 -9 -4 9 -4 Z" fill="#a78bfa" opacity=".8"/></svg>' +
        '<p class="muted" style="margin-top:12px">还没有作品。从今天的标题练习开始——写完的标题截图，就是你的第一件作品。</p></div>';
      return;
    }
    S.folios.forEach((f, i) => {
      const el = document.createElement("div");
      el.className = "task folio-item";
      el.innerHTML = '<div class="t-ico">📁</div><div><div class="t-title"><span class="folio-tag">' + f.type + "</span>" + f.name + '</div><div class="t-desc">' + (f.note || "") + (f.link ? " · " + f.link : "") + " · " + f.date + '</div></div><button class="del" data-i="' + i + '">删除</button>';
      el.querySelector(".del").onclick = (e) => {
        e.stopPropagation();
        if (confirm("确定删除「" + f.name + "」吗？")) { S.folios.splice(i, 1); save(); renderFolio(); }
      };
      list.appendChild(el);
    });
  }
  function initFolioForm() {
    $("#folioAdd").onclick = () => {
      const name = $("#folioName").value.trim();
      if (!name) { toast("先给作品起个名字"); return; }
      S.folios.unshift({ name, type: $("#folioType").value, link: $("#folioLink").value.trim(), note: $("#folioNote").value.trim(), date: todayStr() });
      save(); renderFolio();
      $("#folioName").value = ""; $("#folioLink").value = ""; $("#folioNote").value = "";
      toast("已加入作品集");
    };
  }

  /* ---------- 课业速通 ---------- */
  function renderCourses() {
    const box = $("#courseList");
    box.innerHTML = "";
    M.courses.forEach((c, ci) => {
      const el = document.createElement("div");
      el.className = "road-item course-item" + (ci === 0 ? " open" : "");
      el.innerHTML =
        '<div class="road-head"><span class="c-ico">' + c.icon + '</span><span class="term">' + c.name + '</span><span class="arrow">▾</span></div>' +
        '<div class="road-body">' +
        '<div class="road-sub">概念速览 · 考前扫一遍</div>' +
        '<div class="concept-grid">' + c.concepts.map((k) => '<div class="concept"><b>' + k.t + '</b><p>' + k.d + "</p></div>").join("") + "</div>" +
        '<div class="road-sub">重点理论 · 人话 + 考试 + 应用</div>' +
        c.theories.map((t) => '<div class="theory-card"><b>' + t.name + '</b><div class="t-row"><span class="t-tag s">人话</span>' + t.say + '</div><div class="t-row"><span class="t-tag e">考试</span>' + t.exam + '</div><div class="t-row"><span class="t-tag u">应用</span>' + t.use + "</div></div>").join("") +
        '<div class="road-sub">自测 · 写下你的回答，AI 判卷；或直接对照参考</div>' +
        c.quiz.map((q, qi) =>
          '<div class="quiz-flip" data-c="' + ci + '" data-q="' + qi + '">' +
          '<div class="q-side">' + q.q + "</div>" +
          '<textarea class="my-ans" rows="2" placeholder="用一句话写下你的回答（写完让 AI 判卷，效果最好）"></textarea>' +
          '<div class="quiz-btns"><button class="mini-btn ai-go">🤖 AI 判卷</button><button class="mini-btn ref-go">看参考答案</button></div>' +
          '<div class="ai-result" hidden></div>' +
          '<div class="a-side" hidden>' + q.a + "</div>" +
          "</div>"
        ).join("") +
        "</div>";
      el.querySelector(".road-head").onclick = () => el.classList.toggle("open");
      box.appendChild(el);
    });
    box.querySelectorAll(".quiz-flip").forEach((f) => {
      const aSide = f.querySelector(".a-side");
      f.querySelector(".ref-go").onclick = () => {
        aSide.hidden = !aSide.hidden;
        f.querySelector(".ref-go").textContent = aSide.hidden ? "看参考答案" : "收起参考答案";
      };
      const aiBtn = f.querySelector(".ai-go");
      aiBtn.onclick = async () => {
        if (!aiReady()) { toast("先到「今日」页最下方配置 AI Key（免费）"); return; }
        const my = f.querySelector(".my-ans").value.trim();
        if (!my) { toast("先写下你的回答，AI 才能判卷"); return; }
        const ci = +f.dataset.c, qi = +f.dataset.q;
        const course = M.courses[ci], q = course.quiz[qi];
        aiBtn.disabled = true; aiBtn.textContent = "AI 阅卷中……";
        const box = f.querySelector(".ai-result");
        try {
          const txt = await aiChat(
            "你是「" + course.name + "」课程的阅卷老师。学生回答了一道题，请对照参考答案：①指出答对了什么、漏了什么；②给百分制分数；③一句改进建议。全部中文，不超过 130 字，直接给结论不客套。",
            "题目：" + q.q + "\n参考答案：" + q.a + "\n学生回答：" + my
          );
          box.innerHTML = "<b>🤖 AI 阅卷</b><br>" + txt.replace(/\n/g, "<br>");
          box.hidden = false;
        } catch (e) {
          box.innerHTML = "AI 调用失败：" + e.message;
          box.hidden = false;
        }
        aiBtn.disabled = false; aiBtn.textContent = "🤖 AI 判卷";
      };
    });
  }

  /* 海报实验室（五步工作台） */
  let posterStep = "purpose";
  function renderPoster(area) {
    const P = M.posterKit, C = M.colorDeep;
    const bar = '<div class="step-bar">' + M.posterSteps.map((s) => '<button class="step-btn' + (posterStep === s.id ? " active" : "") + '" data-s="' + s.id + '">' + s.name + "</button>").join("") + "</div>";
    let body = "";
    if (posterStep === "purpose") {
      body = '<div class="card"><p class="card-title">第一步：先写一张 5 分钟简报</p>' +
        '<p class="muted small" style="line-height:1.9">' + M.posterPurpose.brief + "</p>" +
        '<div class="tip-box" style="margin-top:10px">⚠ ' + M.posterPurpose.wrong + "</div>" +
        '<div class="starter-item" style="margin-top:8px"><div class="starter-num">✎</div><div><b>' + P.rules[0].name + "</b><p>" + P.rules[0].detail + "</p></div></div></div>";
    } else if (posterStep === "layout") {
      body = '<div class="card"><p class="card-title">第二步：6 种经典版式骨架</p>' +
        '<p class="muted small">示意图画的是「骨架」不是成品：色块代表信息区。选一个骨架，往里填内容——和写作先列提纲是一个道理。</p>' +
        '<div class="layout-grid">' + P.layouts.map((l) => '<div class="layout-item">' + l.svg + "<b>" + l.name + "</b><p>" + l.desc + "</p></div>").join("") + "</div>" +
        '<div class="starter-item" style="margin-top:10px"><div class="starter-num">✎</div><div><b>' + P.rules[2].name + "</b><p>" + P.rules[2].detail + "</p></div></div></div>";
    } else if (posterStep === "color") {
      body = '<div class="card"><p class="card-title">先懂三个旋钮</p><p class="muted small" style="line-height:1.9">' + C.basics + "</p></div>" +
        '<div class="card"><p class="card-title">配色六法（附色卡）</p><div class="scheme-list">' +
        C.schemes.map((s) => '<div class="scheme-item">' + s.svg + '<div class="scheme-txt"><b>' + s.name + "</b><p>" + s.desc + '</p><p class="sch-work">适用：' + s.scene + "</p></div></div>").join("") + "</div></div>" +
        '<div class="card"><p class="card-title">三套实战色板</p>' +
        C.palettes.map((p) => '<div class="pal-item"><b>' + p.theme + '</b><div class="pal-colors">' + p.colors.map((c) => '<div class="pal-sw" style="background:' + c[0] + '"><span>' + c[0] + "</span></div>").join("") + '</div><p class="muted small">' + p.note + "</p></div>").join("") + "</div>" +
        '<div class="card"><p class="card-title">色彩心理</p><div class="color-list">' +
        P.colorPsych.map((c) => '<div class="color-item"><span class="color-dot" style="background:' + c.c + '"></span><b>' + c.name + "</b><span>" + c.use + "</span></div>").join("") + "</div>" +
        '<div class="road-sub" style="margin-top:12px">配色工具（搜索名字即达）</div>' +
        C.tools.map((t) => '<div class="starter-item"><div class="starter-num">🧰</div><div><b>' + t.name + "</b><p>" + t.note + "</p></div></div>").join("") + "</div>";
    } else if (posterStep === "type") {
      const T = M.posterType;
      body = '<div class="card"><p class="card-title">排版四门功课</p>' +
        '<div class="starter-item"><div class="starter-num">1</div><div><b>信息层级</b><p>' + T.hierarchy + "</p></div></div>" +
        '<div class="starter-item"><div class="starter-num">2</div><div><b>字体</b><p>' + T.font + "</p></div></div>" +
        '<div class="starter-item"><div class="starter-num">3</div><div><b>对齐</b><p>' + T.align + "</p></div></div>" +
        '<div class="starter-item"><div class="starter-num">4</div><div><b>亲密性</b><p>' + T.spacing + "</p></div></div></div>";
    } else {
      body = '<div class="card"><p class="card-title">发布前自查清单</p>' +
        P.checklist.map((c, i) => '<div class="starter-item"><div class="starter-num">' + (i + 1) + '</div><div><p>' + c + "</p></div></div>").join("") + "</div>" +
        '<div class="card"><p class="card-title">用 AI 提效</p>' +
        P.aiWorkflow.steps.map((s) => '<div class="starter-item"><div class="starter-num">▸</div><div><p>' + s + "</p></div></div>").join("") +
        '<div class="tip-box" style="margin-top:10px">💡 ' + P.aiWorkflow.promptTips + "</div></div>";
    }
    area.innerHTML = bar + body;
    area.querySelectorAll(".step-btn").forEach((b) => { b.onclick = () => { posterStep = b.dataset.s; renderPoster(area); }; });
  }

  /* 提示词学院 */
  function renderPrompt(area) {
    const P = M.promptLab;
    const copy = (text) => {
      const done = () => toast("已复制！去粘贴给 AI 吧");
      if (navigator.clipboard && location.protocol.indexOf("http") === 0) navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
      else fallbackCopy(text, done);
    };
    const fallbackCopy = (text, done) => {
      const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) { toast("复制失败，请长按手动选择"); }
      ta.remove();
    };
    area.innerHTML =
      '<div class="card"><p class="card-title">工作 AI：五条心法</p>' +
      P.core.map((c) => '<div class="starter-item"><div class="starter-num">✦</div><div><b>' + c.name + "</b><p>" + c.detail + "</p></div></div>").join("") + "</div>" +
      '<div class="card"><p class="card-title">工作 AI 模板库（点「复制」直接用）</p>' +
      P.workTemplates.map((t, i) => '<div class="pt-item"><div class="pt-head"><b>' + t.name + '</b><button class="mini-btn cp-btn" data-i="' + i + '">复制</button></div><p class="muted small" style="margin:4px 0 6px">场景：' + t.scene + '</p><div class="pt-prompt">' + esc(t.prompt) + '</div><p class="ad-why">为什么这样写：' + t.why + "</p></div>").join("") + "</div>" +
      '<div class="card"><p class="card-title">图像 AI：六要素公式</p>' +
      '<p class="muted small">一个提示词 = 主体 + 场景 + 风格 + 构图 + 光线 + 色调。不是每项都必须，但缺的项 AI 就自己脑补。</p>' +
      P.imageFormula.map((f) => '<div class="starter-item"><div class="starter-num">' + f.k.slice(0, 1) + '</div><div><b>' + f.k + "</b><p>" + f.v + "</p></div></div>").join("") + "</div>" +
      '<div class="card"><p class="card-title">图像提示词实例（可直接抄改）</p>' +
      P.imageExamples.map((e, i) => '<div class="pt-item"><div class="pt-head"><b>' + e.use + '</b><button class="mini-btn cp-img" data-i="' + i + '">复制</button></div><div class="pt-prompt">' + esc(e.prompt) + "</div></div>").join("") + "</div>" +
      '<div class="card"><p class="card-title">避坑四条</p>' +
      P.imageTips.map((t) => '<div class="starter-item"><div class="starter-num">⚠</div><div><p>' + t + "</p></div></div>").join("") + "</div>" +
      '<div class="card"><p class="card-title">继续学（真实存在的资源）</p>' +
      P.learnMore.map((l) => '<div class="starter-item"><div class="starter-num">📚</div><div><b>' + l.name + "</b><p>" + l.desc + '</p><p class="sch-work">怎么找：' + l.how + "</p></div></div>").join("") + "</div>";
    area.querySelectorAll(".cp-btn").forEach((b) => { b.onclick = () => copy(P.workTemplates[+b.dataset.i].prompt); });
    area.querySelectorAll(".cp-img").forEach((b) => { b.onclick = () => copy(P.imageExamples[+b.dataset.i].prompt); });
  }

  /* 全站内容目录 */
  function renderCatalog() {
    const trainItems = [
      "标题实验室 · " + M.titleLabs.length + " 组素材（AI 点评）", "爆款公式 · " + M.formulas.length + " 个", "开头训练营 · " + M.openings.length + " 种",
      "坏文案门诊 · " + M.clinics.length + " 组", "短视频脚本 · " + M.scriptKit.rules.length + " 条规则 + " + M.scriptKit.drills.length + " 个练习",
      "海报实验室 · 5 步工作台 + " + M.posterKit.layouts.length + " 种版式 + 配色六法", "提示词学院 · " + M.promptLab.workTemplates.length + " 个工作模板 + 图像公式",
      "广告创意坊 · " + M.adLab.classics.length + " 案例 + slogan 五法 + 策划案七步", "选题库 · " + M.topics.length + " 条（可标记已做）",
      "增长运营 · 冷启动/节奏/粉丝/变现/红线",
    ];
    const secs = [
      ["今日", "page-home", ["每日概念（" + M.courses.reduce((n, c) => n + c.concepts.length, 0) + " 个概念轮换）", "打卡 + 热力图 + 学习图表", "网站体检 · 数据备份 · AI 教练设置"]],
      ["课业速通", "page-course", M.courses.map((c) => c.icon + " " + c.name + "（" + c.concepts.length + " 概念 · " + c.theories.length + " 理论 · " + c.quiz.length + " 自测）").concat(["必考学者速查 × " + M.scholars.length])],
      ["路线图", "page-road", M.roadmap.map((r) => r.term + "：" + r.skills.map((s) => s.name).join("/")).concat(["专业认知 · 五大就业方向"])],
      ["训练场", "page-train", trainItems],
      ["资源库", "page-res", [...new Set(M.resources.map((r) => r.cat))].map((c) => c + "（" + M.resources.filter((r) => r.cat === c).length + " 项）")],
      ["作品集", "page-folio", ["作品条目管理（名称/类型/链接/亮点）"]],
    ];
    $("#catalogBody").innerHTML = secs.map((s) =>
      '<div class="cat-sec" data-page="' + s[1] + '"><div class="cat-title">' + s[0] + "</div>" + s[2].map((i) => '<p class="cat-item">· ' + i + "</p>").join("") + '<p class="cat-go">点击进入 →</p></div>'
    ).join("");
    document.querySelectorAll("#catalogBody .cat-sec").forEach((el) => {
      el.onclick = () => { $("#catalogOverlay").hidden = true; document.querySelector('#tabbar .tab[data-page="' + el.dataset.page + '"]').click(); };
    });
  }

  /* 广告创意坊 */
  function renderAdLab(area) {
    const A = M.adLab;
    area.innerHTML =
      '<div class="card"><p class="card-title">经典广告案例拆解</p>' +
      A.classics.map((c) => '<div class="ad-item"><div class="ad-brand">' + c.brand + '</div><div class="ad-slogan">「' + c.slogan + '」</div><p class="ad-why">' + c.analysis + "</p></div>").join("") +
      "</div>" +
      '<div class="card"><p class="card-title">Slogan 写作五法</p>' +
      A.sloganMethods.map((m) => '<div class="starter-item"><div class="starter-num">✎</div><div><b>' + m.name + '</b><p>' + m.pattern + '</p><p class="ad-ex">例：' + m.example + '　·　' + m.tip + "</p></div></div>").join("") +
      "</div>" +
      '<div class="card"><p class="card-title">广告策划案七步结构</p>' +
      '<p class="muted small">课程的期末作业、比赛提案、求职笔试，用的都是这套骨架。</p>' +
      A.planStructure.map((s) => '<div class="starter-item"><div class="starter-num">' + s.step.split(" · ")[0] + '</div><div><b>' + s.step.split(" · ")[1] + "</b><p>" + s.detail + "</p></div></div>").join("") +
      "</div>" +
      '<div class="card"><p class="card-title">练习主题</p>' +
      A.drills.map((d) => '<div class="starter-item"><div class="starter-num">▸</div><div><b>' + d.theme + "</b><p>" + d.hint + "</p></div></div>").join("") +
      "</div>";
  }

  /* ---------- 全局搜索 ---------- */
  let searchIndex = null;
  function esc(s) { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function buildIndex() {
    if (searchIndex) return searchIndex;
    const idx = [];
    const add = (cat, title, sub, page) => idx.push({ cat, title, sub, page, hay: (title + " " + sub).toLowerCase() });
    M.courses.forEach((c) => {
      c.concepts.forEach((k) => add("概念 · " + c.name, k.t, k.d, "page-course"));
      c.theories.forEach((t) => add("理论 · " + c.name, t.name, t.say, "page-course"));
    });
    M.formulas.forEach((f) => add("爆款公式", f.name, f.pattern + " " + f.examples.join(" "), "page-train"));
    M.titleLabs.forEach((l) => add("标题训练", l.material, l.tip, "page-train"));
    M.openings.forEach((o) => add("开头方法", o.type, o.theme + " " + o.demo, "page-train"));
    M.scriptKit.rules.forEach((r) => add("脚本规则", r.name, r.detail, "page-train"));
    M.posterKit.rules.forEach((r) => add("海报原则", r.name, r.detail, "page-train"));
    M.posterKit.layouts.forEach((l) => add("海报版式", l.name, l.desc, "page-train"));
    M.adLab.classics.forEach((c) => add("广告案例", c.brand, c.slogan + " " + c.analysis, "page-train"));
    M.adLab.sloganMethods.forEach((m) => add("Slogan 方法", m.name, m.pattern + " " + m.example, "page-train"));
    M.resources.forEach((r) => add("资源 · " + r.cat, r.name, r.note, "page-res"));
    M.topics.forEach((t) => add("选题 · " + t.cat, t.t, "", "page-train"));
    M.scholars.forEach((s) => add("学者", s.name, s.tag + " " + s.one, "page-course"));
    M.careers.forEach((c) => add("就业方向", c.name, c.what, "page-road"));
    searchIndex = idx;
    return idx;
  }
  function openSearch() {
    const ov = $("#searchOverlay");
    ov.hidden = false;
    $("#searchInput").value = "";
    renderSearch("");
    setTimeout(() => $("#searchInput").focus(), 60);
  }
  function closeSearch() { $("#searchOverlay").hidden = true; }
  function renderSearch(q) {
    const query = q.trim().toLowerCase();
    const box = $("#searchResults");
    if (!query) { box.innerHTML = '<div class="sr-hint">输入关键词试试：议程设置 / 剪映 / 海报版式 / slogan / 避风港</div>'; return; }
    const hits = buildIndex().filter((x) => x.hay.includes(query)).slice(0, 24);
    box.innerHTML = hits.length
      ? hits.map((h) => '<div class="sr-item" data-page="' + h.page + '"><span class="sr-cat">' + h.cat + '</span><div><b>' + esc(h.title) + "</b><p>" + esc(h.sub).slice(0, 90) + "</p></div></div>").join("")
      : '<div class="sr-hint">没找到「' + esc(q) + '」，换个词试试</div>';
    box.querySelectorAll(".sr-item").forEach((el) => {
      el.onclick = () => { closeSearch(); document.querySelector('#tabbar .tab[data-page="' + el.dataset.page + '"]').click(); };
    });
  }
  function initSearch() {
    $("#searchEntry").onclick = openSearch;
    $("#searchOverlay").addEventListener("click", (e) => { if (e.target === e.currentTarget) closeSearch(); });
    $("#searchInput").addEventListener("input", (e) => renderSearch(e.target.value));
    document.addEventListener("keydown", (e) => {
      const typing = /input|textarea|select/i.test(document.activeElement.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $("#searchOverlay").hidden ? openSearch() : closeSearch(); }
      else if (e.key === "Escape") closeSearch();
      else if (e.key === "/" && !typing && $("#searchOverlay").hidden) { e.preventDefault(); openSearch(); }
    });
  }

  /* ---------- 学习图表 ---------- */
  function renderBars14() {
    const box = $("#bars14");
    const cells = [];
    for (let i = 13; i >= 0; i--) {
      const d = dayOffset(-i);
      const hit = !!S.checkins[d];
      cells.push('<div class="b14" title="' + d + (hit ? " 已打卡" : "") + '"><div class="b14-bar' + (hit ? " on" : "") + '"></div><span>' + (i === 0 ? "今" : d.slice(8)) + "</span></div>");
    }
    box.innerHTML = '<div class="bars14">' + cells.join("") + "</div>";
  }
  function renderTrend() {
    const list = S.labArchive.slice(0, 12).reverse();
    if (list.length < 2) return "";
    const w = 320, h = 84, pad = 10;
    const pts = list.map((a, i) => [pad + i * ((w - pad * 2) / (list.length - 1)), h - pad - (a.stars - 1) * ((h - pad * 2) / 4)]);
    const line = pts.map((p) => p.join(",")).join(" ");
    const dots = pts.map((p) => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3.5" fill="#7c3aed" stroke="#fff" stroke-width="1.5"/>').join("");
    return '<svg viewBox="0 0 ' + w + " " + h + '" class="trend-svg"><polyline points="' + line + '" fill="none" stroke="#8b5cf6" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' + dots + "</svg>" +
      '<p class="muted small">1 星在下、5 星在上。折线往上走，说明你的标题眼光在进化。</p>';
  }

  /* ---------- PWA 安装 ---------- */
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); deferredPrompt = e;
    const c = $("#installCard"); if (c) c.hidden = false;
  });

  /* 必考学者速查 */
  function renderScholars() {
    $("#scholarList").innerHTML = M.scholars.map((s) =>
      '<div class="scholar-item"><div class="sch-head"><b>' + s.name + '</b><span class="sch-years">' + s.years + '</span><span class="sch-tag">' + s.tag + '</span></div><p class="sch-one">' + s.one + '</p><p class="sch-work">代表作：' + s.work + "</p></div>"
    ).join("");
  }

  /* ---------- 安全保障：错误黑匣子 ---------- */
  function logError(msg) {
    try {
      const logs = JSON.parse(localStorage.getItem(KEY + "_errors") || "[]");
      logs.unshift({ t: new Date().toISOString().slice(0, 19).replace("T", " "), msg: String(msg).slice(0, 300) });
      localStorage.setItem(KEY + "_errors", JSON.stringify(logs.slice(0, 20)));
    } catch (e) {}
  }
  window.addEventListener("error", (e) => logError("运行时: " + e.message + (e.filename ? " @" + (e.filename.split("/").pop()) + ":" + e.lineno : "")));
  window.addEventListener("unhandledrejection", (e) => logError("Promise: " + ((e.reason && e.reason.message) || e.reason)));
  function showSafeBanner(err) {
    try {
      logError("启动失败: " + (err && err.message));
      const b = document.createElement("div");
      b.style.cssText = "position:relative;z-index:200;background:#7f1d1d;color:#fff;padding:14px 16px;font-size:13px;line-height:1.8";
      b.innerHTML = "<b>⚠ 网站启动遇到问题，部分功能不可用</b><br>错误信息：" + esc(err && err.message || "未知") +
        '<br><button onclick="location.reload()" style="margin:8px 8px 0 0;padding:7px 14px;border:none;border-radius:8px;font-weight:700;cursor:pointer">重新加载</button>' +
        '<button id="safeReset" style="padding:7px 14px;border:1px solid rgba(255,255,255,.5);background:transparent;color:#fff;border-radius:8px;font-weight:700;cursor:pointer">安全模式（清空本机数据重建）</button>' +
        '<p style="opacity:.85;margin-top:6px">自救三步：① 强制刷新（Ctrl+Shift+R）② 用备份文件恢复（若之前导出过）③ 把 js/data.js 发给 AI 检查格式。若反复出问题：先点「数据备份」导出现有记录再重置。</p>';
      document.body.insertBefore(b, document.body.firstChild);
      b.querySelector("#safeReset").onclick = () => {
        if (confirm("将清空本机学习数据并重建页面。\n如果你之前导出过备份文件，之后可以用「导入恢复」找回。\n继续吗？")) {
          localStorage.removeItem(KEY);
          location.reload();
        }
      };
    } catch (e) { document.title = "⚠ 启动异常：" + (err && err.message); }
  }

  /* ---------- 网站体检 ---------- */
  function runDiagnostics() {
    const items = [];
    const add = (name, pass, note) => items.push({ name, pass: !!pass, note });
    try { localStorage.setItem("__t", "1"); localStorage.removeItem("__t"); add("本地存储", true, "读写正常，学习数据可保存"); }
    catch (e) { add("本地存储", false, "不可用（无痕模式？）——打卡与档案无法保存"); }
    try { JSON.parse(localStorage.getItem(KEY) || "{}"); add("学习数据", true, "可正常解析"); }
    catch (e) { add("学习数据", false, "已损坏——请导入备份，或用安全模式重置"); }
    add("内容库", !!window.MEDIA, window.MEDIA ? "v" + window.MEDIA.version + " · " + window.MEDIA.courses.length + " 门课 · " + window.MEDIA.resources.length + " 项资源" : "未加载——检查 js/data.js 是否被改动");
    const missing = ["searchEntry", "themeBtn", "taskList", "heatmap", "bars14", "roadList", "courseList", "scholarList", "trainArea", "resList", "folioList", "aiCard", "searchOverlay"].filter((id) => !document.getElementById(id));
    add("页面结构", missing.length === 0, missing.length ? "缺失元素：" + missing.join("、") + "（HTML 可能被改动）" : "13 个关键元素齐全");
    const swOk = "serviceWorker" in navigator && location.protocol.indexOf("http") === 0;
    add("离线缓存", swOk || location.protocol === "file:", swOk ? "已就绪（线上/服务器环境）" : "file:// 本地模式无离线缓存（正常现象）");
    let errs = [];
    try { errs = JSON.parse(localStorage.getItem(KEY + "_errors") || "[]"); } catch (e) {}
    add("错误日志", errs.length === 0, errs.length ? "有 " + errs.length + " 条记录，最新：" + errs[0].msg : "运行无错误记录");
    const lastBk = localStorage.getItem(KEY + "_backupAt");
    if (lastBk) {
      const days = Math.round((new Date() - new Date(lastBk)) / 86400000);
      add("备份新鲜度", days <= 7, "上次备份：" + lastBk + (days > 7 ? "（已超过 7 天，建议导出）" : ""));
    } else {
      add("备份新鲜度", false, "从未导出过备份——建议现在去「数据备份」导出一次");
    }
    return items;
  }
  function renderDiag() {
    const items = runDiagnostics();
    const bad = items.filter((x) => !x.pass).length;
    $("#diagResult").innerHTML =
      '<div class="diag-sum">' + (bad === 0 ? "✅ 全部通过，网站很健康" : "⚠ 发现 " + bad + " 项需要关注") + "</div>" +
      items.map((x) => '<div class="diag-item"><span class="diag-ico">' + (x.pass ? "✅" : "❌") + '</span><div><b>' + x.name + "</b><p>" + x.note + "</p></div></div>").join("") +
      '<div class="diag-item"><span class="diag-ico">🛟</span><div><p>出问题时的自救顺序：强制刷新（Ctrl+Shift+R）→ 数据备份导入恢复 → 把本页红叉内容截图发给任意 AI。错误黑匣子会自动记录最近 20 条运行错误，体检时会一起展示。</p></div></div>';
  }

  /* ---------- 增长运营手册 ---------- */
  function renderGrowth(area) {
    const G = M.growthKit;
    const sec = (title, arr, ico) =>
      '<div class="card"><p class="card-title">' + title + "</p>" +
      arr.map((x, i) => '<div class="starter-item"><div class="starter-num">' + (ico || i + 1) + '</div><div><b>' + x.name + "</b><p>" + x.detail + "</p></div></div>").join("") + "</div>";
    area.innerHTML =
      sec("冷启动三板斧（0→500 粉）", G.coldStart) +
      sec("运营节奏（把随机变日常）", G.rhythm) +
      sec("粉丝运营：从围观到铁粉", G.fans) +
      sec("变现路径（按门槛从低到高）", G.monetize) +
      sec("封号红线（先活着，再谈增长）", G.redlines, "⚠");
  }

  /* ---------- 番茄钟 ---------- */
  const POMO_TOTAL = 25 * 60;
  let pomoLeft = POMO_TOTAL, pomoTimer = null;
  function pomoRender() {
    const m = Math.floor(pomoLeft / 60), s = pomoLeft % 60;
    $("#pomoTime").textContent = String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    $("#pomoArc").style.strokeDashoffset = 326.7 * (1 - pomoLeft / POMO_TOTAL);
  }
  function initPomo() {
    const cnt = S.pomoCount || {};
    $("#pomoCount").textContent = "今日已完成 " + (cnt[todayStr()] || 0) + " 个番茄";
    pomoRender();
    $("#pomoBtn").onclick = () => {
      if (pomoTimer) { clearInterval(pomoTimer); pomoTimer = null; $("#pomoBtn").textContent = "继续"; return; }
      $("#pomoBtn").textContent = "暂停";
      pomoTimer = setInterval(() => {
        pomoLeft--;
        if (pomoLeft <= 0) {
          clearInterval(pomoTimer); pomoTimer = null;
          pomoLeft = POMO_TOTAL;
          cnt[todayStr()] = (cnt[todayStr()] || 0) + 1;
          S.pomoCount = cnt; save();
          $("#pomoBtn").textContent = "开始专注";
          toast("🍅 完成一个番茄！起来走走，休息 5 分钟");
        }
        pomoRender();
        const c2 = S.pomoCount || {};
        $("#pomoCount").textContent = "今日已完成 " + (c2[todayStr()] || 0) + " 个番茄";
      }, 1000);
    };
    $("#pomoReset").onclick = () => {
      if (pomoTimer) { clearInterval(pomoTimer); pomoTimer = null; }
      pomoLeft = POMO_TOTAL; $("#pomoBtn").textContent = "开始专注"; pomoRender();
    };
  }

  /* ---------- 关于 / 日志 / 快捷键 ---------- */
  const CHANGELOG = [
    { v: "v1.2", d: "2026-08-29", items: ["海报实验室升级五步工作台，新增配色六法与三套实战色板", "新增「AI 提示词学院」：工作 AI 模板库 + 图像 AI 六要素公式", "新增全站内容目录，一屏看清网站有什么", "手绘 SVG 插画与 hover 微交互，去除模板感"] },
    { v: "v1.1", d: "2026-08-29", items: ["安全保障体系上线：启动保护、错误黑匣子、一键体检、安全模式", "新增《传播学研究方法》《媒介伦理与法规》《广告学概论》等课业速通", "新增增长运营手册：冷启动、运营节奏、粉丝分层、变现路径、封号红线", "新传必考学者速查 8 位"] },
    { v: "v1.0", d: "2026-08-29", items: ["网站正式部署上线：zhouhe1234.github.io/newmedia-academy", "全局搜索（Ctrl+K）、学习数据图表、PWA 一键安装", "深色模式、数据备份恢复、课程速通扩充至 8 门"] },
    { v: "v0.9", d: "2026-08-28", items: ["新媒学园诞生：路线图、课业速通、训练场、资源库、作品集五大板块", "AI 批改教练接入（智谱 GLM-4-Flash）", "按本校实际调整路线图：理论课前置、广告学基因纳入"] },
  ];
  function initAbout() {
    $("#fVersion").textContent = "v" + M.version.split(".").slice(0, 2).join(".") + " · 内容库 " + M.version;
    $("#fAbout").onclick = () => {
      $("#aboutBody").innerHTML =
        '<div class="about-p">「新媒学园」是为网络与新媒体专业学生做的个人学习站：把四年该学什么、每天练什么、毕业后去哪，装进一个离线也能用的网页里。</div>' +
        '<div class="about-p">它由 ZCode（AI 编程智能体）与它的主人——武汉设计工程学院网络与新媒体专业的一名学生——在 2026 年 8 月的两个夜晚协作完成，之后由主人长期使用与维护。</div>' +
        '<div class="about-p">技术上它是纯静态网站：零依赖、数据只存本机、可部署到任何托管平台。内容与代码分离（js/data.js），随时可以让 AI 帮忙更新。</div>' +
        '<div class="about-p">——愿它陪你从大二上到大四下。</div>';
      $("#aboutOverlay").hidden = false;
    };
    $("#fChangelog").onclick = () => {
      $("#changelogBody").innerHTML = CHANGELOG.map((c) =>
        '<div class="cl-item"><div class="cl-head"><b>' + c.v + '</b><span class="cl-date">' + c.d + "</span></div>" + c.items.map((i) => '<p class="cat-item">· ' + i + "</p>").join("") + "</div>"
      ).join("");
      $("#logOverlay").hidden = false;
    };
    $("#fKeys").onclick = () => {
      $("#keysBody").innerHTML = [
        ["Ctrl + K（Mac ⌘K）", "打开全局搜索"], ["/", "快速打开全局搜索"], ["Esc", "关闭搜索 / 目录 / 弹层"],
        ["点左上角月亮", "切换深色 / 浅色模式"], ["点击目录任意分区", "直接跳转到对应板块"],
      ].map((k) => '<div class="sr-item" style="cursor:default"><span class="sr-cat">' + k[0] + '</span><div><b>' + k[1] + "</b></div></div>").join("");
      $("#keysOverlay").hidden = false;
    };
    [$("#aboutOverlay"), $("#logOverlay"), $("#keysOverlay")].forEach((ov) => {
      ov.addEventListener("click", (e) => { if (e.target === e.currentTarget) ov.hidden = true; });
    });
  }

  /* ---------- 外观与备份 ---------- */
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", S.theme);
    $("#themeBtn").textContent = S.theme === "dark" ? "☀️" : "🌙";
  }
  function initMisc() {
    applyTheme();
    $("#themeBtn").onclick = () => { S.theme = S.theme === "dark" ? "light" : "dark"; save(); applyTheme(); };
    $("#installBtn").onclick = async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const r = await deferredPrompt.userChoice;
      if (r.outcome === "accepted") toast("安装成功！桌面见 👋");
      deferredPrompt = null;
      $("#installCard").hidden = true;
    };
    $("#backupBtn").onclick = () => {
      const blob = new Blob([JSON.stringify(S, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "新媒学园备份-" + todayStr() + ".json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      try { localStorage.setItem(KEY + "_backupAt", todayStr()); } catch (e) {}
      toast("备份已下载，妥善保存！");
    };
    $("#restoreBtn").onclick = () => $("#restoreFile").click();
    $("#catalogEntry").onclick = () => { $("#catalogOverlay").hidden = false; renderCatalog(); };
    $("#catalogOverlay").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.hidden = true; });
    $("#restoreFile").onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (!data || typeof data !== "object" || !("checkins" in data)) throw new Error("不是本站的备份文件");
          localStorage.setItem(KEY, JSON.stringify(data));
          location.reload();
        } catch (err) { toast("恢复失败：" + err.message); }
      };
      reader.readAsText(file);
      e.target.value = "";
    };
  }
  /* ---------- 选题灵感库 ---------- */
  function renderTopics(area) {
    const doneN = Object.keys(S.topicsDone).filter((k) => S.topicsDone[k]).length;
    const cats = [...new Set(M.topics.map((t) => t.cat))];
    let html = '<div class="card"><p class="card-title">选题灵感库 · 共 ' + M.topics.length + ' 条，已做 ' + doneN + ' 条</p>' +
      '<p class="muted small">开号前先囤弹药：点条目标记「已做」，做一条勾一条。全部做完你就是选题库最厚的仔。</p></div>';
    cats.forEach((cat) => {
      const items = M.topics.map((t, i) => ({ t, i })).filter((x) => x.t.cat === cat);
      html += '<div class="res-group"><div class="rg-name">' + cat + " · " + items.length + " 条</div>" +
        items.map((x) => {
          const done = !!S.topicsDone[x.i];
          return '<div class="res-item topic-item' + (done ? " done" : "") + '" data-i="' + x.i + '"><b>' + (done ? "✓" : "○") + "</b><span" + (done ? ' style="text-decoration:line-through"' : "") + ">" + x.t.t + "</span></div>";
        }).join("") + "</div>";
    });
    area.innerHTML = html;
    area.querySelectorAll(".topic-item").forEach((el) => {
      el.onclick = () => { const i = el.dataset.i; S.topicsDone[i] = !S.topicsDone[i]; save(); renderTopics(area); };
    });
  }

  /* ---------- 启动（带安全保护） ---------- */
  function boot() {
    load();
    initTabs(); initTrainTabs(); initFolioForm(); initMisc(); initSearch(); initPomo(); initAbout();
    $("#resSearch").addEventListener("input", renderRes);
    $("#diagBtn").onclick = renderDiag;
    renderHome(); renderRoad(); renderCourses(); renderScholars(); renderTrain(); renderStarter(); renderRes(); renderFolio(); renderAICard();
    if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }
  try { boot(); } catch (err) {
    console.error(err);
    showSafeBanner(err);
  }
})();
