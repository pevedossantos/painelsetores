import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm";

/* ===== Constantes ===== */
const SETORES = ["Sul", "Norte", "Centro", "Leste"];
const FUNCOES = ["1 CMD", "2 CMD"];
const CICLO = 7;
const DOMINIO_LOGIN = "solano-efetivo.com"; // mesmo login do rpcontrol

/* ===== Utilidades ===== */
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); }));
const iso = d => { d = new Date(d); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const today = () => iso(new Date());
const addDays = (s, n) => { const [y, m, d] = s.split("-").map(Number); return iso(new Date(y, m - 1, d + n)); };
const diffDays = (a, b) => { const p = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((p(b) - p(a)) / 864e5); };
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtD = s => { if (!s) return ""; const [y, m, d] = s.split("-"); return d + "/" + m + "/" + y; };
const fmtDs = s => { if (!s) return ""; const [y, m, d] = s.split("-"); return d + "/" + m; };
function slugUsuario(nome) {
  return String(nome || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
    .replace(/\s+/g, ".").replace(/[^a-z0-9._-]/g, "").replace(/\.{2,}/g, ".").replace(/^[.\-_]+|[.\-_]+$/g, "");
}
const emailDe = nome => slugUsuario(nome) + "@" + DOMINIO_LOGIN;

/* ===== Supabase ===== */
const CFG = window.TG_CONFIG || {};
const url = (String(CFG.SUPABASE_URL || "").trim().match(/^https?:\/\/[^\/\s]+/) || [""])[0];
const sb = url && CFG.SUPABASE_ANON_KEY ? createClient(url, String(CFG.SUPABASE_ANON_KEY).trim()) : null;

const fromCmd = r => ({ id: r.id, qra: r.qra, dc: r.dc || "", setor: r.setor, funcao: r.funcao });
const toCmd = c => ({ id: c.id, qra: c.qra, dc: c.dc || "", setor: c.setor, funcao: c.funcao });
const fromL = r => ({ id: r.id, data: r.data, cmdId: r.cmd_id, qra: r.qra, setor: r.setor, funcao: r.funcao, crit: r.crit, critNome: r.crit_nome, qtd: r.qtd, pontos: r.pontos, obs: r.obs || "" });
const toL = l => ({ id: l.id, data: l.data, cmd_id: l.cmdId || null, qra: l.qra || "", setor: l.setor, funcao: l.funcao || "", crit: l.crit, crit_nome: l.critNome || "", qtd: l.qtd || 1, pontos: Number(l.pontos) || 0, obs: l.obs || "" });
const fromP = r => ({ id: r.id, cmdId: r.cmd_id, qra: r.qra, setor: r.setor, funcao: r.funcao, premio: r.premio, pts: r.pts, inicio: r.inicio, fim: r.fim, obs: r.obs || "" });
const toP = p => ({ id: p.id, cmd_id: p.cmdId || null, qra: p.qra || "", setor: p.setor || "", funcao: p.funcao || "", premio: p.premio, pts: Number(p.pts) || 0, inicio: p.inicio, fim: p.fim, obs: p.obs || "" });

async function fetchAll(table, order) {
  const out = []; const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb.from(table).select("*").order(order).range(from, from + page - 1);
    if (error) throw error;
    out.push(...data); if (data.length < page) break;
  }
  return out;
}

let S = { criterios: [], comandos: [], lancamentos: [], premios: [], npm: [] };
let npmOk = true;
const RP = { carregado: false, carregando: false, erro: "", membros: [], setores: [] };
async function carregar() {
  const [cr, cm, la, pr] = await Promise.all([
    fetchAll("tg_criterios", "ordem"), fetchAll("tg_comandos", "criado_em"),
    fetchAll("tg_lancamentos", "data"), fetchAll("tg_premios", "fim")
  ]);
  S = { criterios: cr, comandos: cm.map(fromCmd), lancamentos: la.map(fromL), premios: pr.map(fromP), npm: S.npm || [] };
  await carregarNpm();
}
async function carregarNpm() {
  const { data, error } = await sb.from("npm_efetivos").select("*").order("atualizado_em").range(0, 4999);
  if (error) { npmOk = false; S.npm = []; return; }
  npmOk = true; S.npm = data;
}
async function carregarRp() {
  RP.carregando = true; RP.erro = "";
  try {
    const [st, mb] = await Promise.all([
      sb.from("setores").select("id,nome,ordem").order("ordem"),
      sb.from("membros").select("id,nome,discord,patente,setor_id,funcao").eq("status", "ativo").order("nome").range(0, 4999)
    ]);
    if (st.error) throw st.error; if (mb.error) throw mb.error;
    RP.setores = st.data; RP.membros = mb.data; RP.carregado = true;
  } catch (e) { RP.erro = e.message || String(e); }
  RP.carregando = false;
}

/* ===== Status / toast ===== */
function setStatus(t, c) { const el = document.getElementById("status"); if (el) { el.textContent = t; el.style.color = c || ""; } }
function toast(t) { const el = document.getElementById("toast"); el.textContent = t; el.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove("show"), 2000); }
async function run(promise) {
  setStatus("Salvando…");
  const { error } = await promise;
  if (error) {
    setStatus("Erro ao salvar", "#e06a5a"); toast("Erro: " + error.message);
    try { await carregar(); } catch (e) { }
    render(); return false;
  }
  setStatus("✓ Salvo no banco", "#5fbf7a"); return true;
}

/* ===== Cálculos ===== */
const critById = id => S.criterios.find(c => c.id === id);
const critsDe = e => S.criterios.filter(c => c.escopo === e);
const cmdById = id => S.comandos.find(c => c.id === id);
const SKEY = s => "S-" + s;
const cmdsDoSetor = s => S.comandos.filter(c => c.setor === s).sort((a, b) => FUNCOES.indexOf(a.funcao) - FUNCOES.indexOf(b.funcao) || a.qra.localeCompare(b.qra));
function range(p) {
  const t = today();
  if (p === "7d") return [addDays(t, -6), t];
  if (p === "mes") return [t.slice(0, 8) + "01", t];
  return [ui.de || addDays(t, -6), ui.ate || t];
}
function ranking(de, ate, setor) {
  const map = {};
  S.comandos.filter(c => !setor || c.setor === setor).forEach(c => map[c.id] = { id: c.id, qra: c.qra, setor: c.setor, funcao: c.funcao, pts: 0, pos: 0, neg: 0 });
  S.lancamentos.filter(l => l.cmdId && l.data >= de && l.data <= ate && (!setor || l.setor === setor)).forEach(l => {
    if (!map[l.cmdId]) map[l.cmdId] = { id: l.cmdId, qra: l.qra, setor: l.setor, funcao: l.funcao, pts: 0, pos: 0, neg: 0 };
    const v = Number(l.pontos); map[l.cmdId].pts += v; v >= 0 ? map[l.cmdId].pos += v : map[l.cmdId].neg += v;
  });
  return Object.values(map).sort((a, b) => b.pts - a.pts || a.qra.localeCompare(b.qra));
}
function rankSetores(de, ate) {
  const m = {}; SETORES.forEach(s => m[s] = 0);
  S.lancamentos.filter(l => l.data >= de && l.data <= ate && m[l.setor] != null).forEach(l => m[l.setor] += Number(l.pontos));
  return SETORES.map(s => ({ setor: s, pts: m[s] })).sort((a, b) => b.pts - a.pts);
}
function ciclo() {
  const t = today(); const fins = S.premios.map(p => p.fim).sort();
  let ini;
  if (fins.length) ini = addDays(fins[fins.length - 1], 1);
  else { const ds = S.lancamentos.map(l => l.data).sort(); ini = ds[0] || t; }
  if (ini > t) ini = t;
  const dias = diffDays(ini, t);
  return { ini, fim: t, dias, pronto: dias >= CICLO };
}

/* ===== Estado de tela ===== */
const TABS = [["ranking", "Ranking"], ["lancar", "Lançar"], ["setorizacao", "Setorização"], ["ajustes", "Ajustes"]];
const PAT_SIGLA = ["REC", "SLD", "SGT", "1 SGT", "SGT MOR", "TEN", "CAP", "MAJ", "CEL", "MAJ GEN", "TEN GEN", "CEL GEN", "GEN ADJ", "FEDERAL"];
const FUN_SIGLA = { "1CMD": "1 CMD", "2CMD": "2 CMD", "1AUX": "1 AUX", "2AUX": "2 AUX" };
const SUBS = [["ranking", "Ranking"], ["premios", "Prêmios"], ["historico", "Histórico"]];
const ICON = {
  ranking: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>',
  lancar: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  premios: '<circle cx="12" cy="9" r="6"/><path d="M8.5 14 7 22l5-3 5 3-1.5-8"/>',
  historico: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  setorizacao: '<circle cx="9" cy="7" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0M15 12h7M19 9l3 3-3 3"/>',
  ajustes: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'
};
let tab = (location.hash || "").slice(1); let sub0 = "ranking";
if (tab === "premios" || tab === "historico") { sub0 = tab; tab = "ranking"; }
if (!TABS.some(t => t[0] === tab)) tab = "ranking";
const ui = { setSub: "setorizar", envio: {}, busca: "", rpSetor: "", abertos: {}, sub: sub0, fase: "carregando", periodo: "7d", de: "", ate: "", setorF: "", setorL: SETORES[0], data: today(), obs: "", form: {}, histSetor: "", ganhador: null, erroLogin: "" };
function go(t) { if (t === tab) { window.scrollTo({ top: 0, behavior: "smooth" }); return; } tab = t; try { history.replaceState(null, "", "#" + t); } catch (e) { } render(); window.scrollTo(0, 0); }
window.addEventListener("hashchange", () => { let t = location.hash.slice(1); if (t === "premios" || t === "historico") { ui.sub = t; t = "ranking"; } if (TABS.some(x => x[0] === t)) { tab = t; render(); } });

function chips(list, cur, attr, cls) { return `<div class="chips ${cls || ""}">${list.map(([v, n]) => `<button class="chip ${v === cur ? "on" : ""}" data-${attr}="${esc(v)}">${esc(n)}</button>`).join("")}</div>`; }
const SETCH = [["", "Todos"], ...SETORES.map(s => [s, s])];
const semCmd = `<div class="card"><div class="empty-msg">Nenhum comando cadastrado ainda.<br>Toque em <b>+ Comando</b> no topo.</div></div>`;

/* ===== Telas ===== */
function header() {
  return `<header><div class="top"><div class="avatar"></div>
  <div style="min-width:0"><h1>SR ZEZO</h1><div class="rank-t">TEN-GEN / SETORES</div><div class="unit">Exército de Solano</div><div id="status"></div></div>
  <button class="hbtn" data-cadastro aria-label="Cadastrar comando"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button></div></header>
  <nav id="nav">${TABS.map(([k, n]) => `<button class="${k === tab ? "on" : ""}" data-tab="${k}"><svg viewBox="0 0 24 24">${ICON[k]}</svg>${n}</button>`).join("")}</nav>`;
}
function vLogin() {
  return `<div class="login"><div class="avatar"></div><h1>SR ZEZO</h1><div class="rank-t">TEN-GEN / SETORES</div><div class="unit">Exército de Solano</div>
  <form class="card" id="loginForm" style="margin-top:20px"><label>Nome no jogo</label><input id="lNome" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="next" required>
  <label>Senha</label><input id="lSenha" type="password" autocomplete="current-password" enterkeyhint="go" required>
  <button class="btn" type="submit">Entrar</button><div class="err" id="lErr">${esc(ui.erroLogin)}</div>
  <div class="sub">Use o mesmo nome e senha do painel de efetivo (rpcontrol).</div></form></div>`;
}
function vNegado() {
  return `<div class="login"><div class="avatar"></div><div class="card" style="margin-top:20px"><h2>Acesso restrito</h2><p>Este painel é pessoal do TEN-GEN / SETORES. Esta conta não tem acesso.</p><button class="btn sec" data-sair>Sair</button></div></div>`;
}
function vConfig() { return `<div class="login"><div class="card"><h2>Configuração</h2><p>Preencha o <b>config.js</b> com a URL e a chave publishable do Supabase.</p></div></div>`; }
function vErro() { return `<div class="login"><div class="card"><h2>Erro ao carregar</h2><p class="sub">${esc(ui.erro)}</p><p class="sub">Confira se o script <b>supabase/schema.sql</b> foi rodado no Supabase.</p><button class="btn" data-recarregar>Tentar de novo</button><button class="btn sec" data-sair>Sair</button></div></div>`; }

function rankRow(x, i, max) {
  return `<div class="rank"><div class="pos ${i < 3 && x.pts > 0 ? "p" + (i + 1) : ""}">${i + 1}</div><div class="who"><b>${esc(x.qra)}</b><span>${esc(x.setor)} · ${esc(x.funcao)}${x.pos ? ` · <span class="posv">+${x.pos}</span>` : ""}${x.neg ? ` <span class="neg">${x.neg}</span>` : ""}</span><div class="bar"><i style="width:${Math.max(0, x.pts) / max * 100}%"></i></div></div><div class="pts ${x.pts < 0 ? "neg" : ""}">${x.pts}<small>pts</small></div></div>`;
}
function vRankingLista() {
  if (!S.comandos.length && !S.lancamentos.length) return semCmd;
  const [de, ate] = range(ui.periodo); const r = ranking(de, ate, ui.setorF), max = Math.max(1, ...r.map(x => x.pts));
  const rs = rankSetores(de, ate), maxS = Math.max(1, ...rs.map(x => x.pts));
  let h = `<div class="card"><h2>Período</h2>${chips([["7d", "Últimos 7 dias"], ["mes", "Mês"], ["custom", "Escolher datas"]], ui.periodo, "per")}`;
  if (ui.periodo === "custom") h += `<div class="grid2"><div><label>De</label><input type="date" id="rDe" value="${de}"></div><div><label>Até</label><input type="date" id="rAte" value="${ate}"></div></div>`;
  else h += `<div class="sub" style="margin-top:8px">${fmtD(de)} a ${fmtD(ate)}</div>`;
  h += `<h2 style="margin-top:14px">Setor</h2>${chips(SETCH, ui.setorF, "setf")}</div><div class="card"><h2>Ranking dos comandos</h2>`;
  if (!r.length) h += `<div class="empty-msg">Nenhum comando neste setor.</div>`;
  r.forEach((x, i) => h += rankRow(x, i, max));
  h += `</div>`;
  if (!ui.setorF) {
    h += `<div class="card"><h2>Setores</h2>`;
    rs.forEach((x, i) => { h += `<div class="rank"><div class="pos ${i < 3 && x.pts > 0 ? "p" + (i + 1) : ""}">${i + 1}</div><div class="who"><b>Setor ${esc(x.setor)}</b><div class="bar"><i style="width:${Math.max(0, x.pts) / maxS * 100}%"></i></div></div><div class="pts ${x.pts < 0 ? "neg" : ""}">${x.pts}<small>pts</small></div></div>`; });
    h += `</div>`;
  }
  return h;
}

function fval(k, c) { return (ui.form[k] && ui.form[k][c]) || 0; }
function total(k, e) { return critsDe(e).reduce((t, c) => { const v = fval(k, c.id); if (c.tipo === "efetivos") return t + (v > 3 ? v * c.pontos : 0); return t + v * c.pontos; }, 0); }
function critRows(key, list) {
  let h = ""; list.forEach(cr => {
    const v = fval(key, cr.id), pt = (cr.pontos > 0 ? "+" : "") + cr.pontos;
    h += `<div class="crow"><div class="cn">${esc(cr.nome)}<small>${cr.tipo === "efetivos" ? pt + " por efetivo (só acima de 3)" : cr.tipo === "count" ? pt + " cada" : pt}</small></div>`;
    if (cr.tipo === "check") h += `<button class="tog ${v ? "on" : ""}" data-tog="${key}|${cr.id}">${v ? "✓ Sim" : "Não"}</button>`;
    else if (cr.tipo === "efetivos") h += `<input class="efin" type="number" min="0" inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" placeholder="nº" data-efet="${key}|${cr.id}" value="${v || ""}">`;
    else h += `<div class="step"><button data-st="${key}|${cr.id}|-1">−</button><span>${v}</span><button data-st="${key}|${cr.id}|1">+</button></div>`;
    h += `</div>`;
  }); return h;
}
function vLancar() {
  const s = ui.setorL, sk = SKEY(s);
  let h = `<div class="card"><h2>Setor</h2>${chips(SETORES.map(x => [x, x]), s, "setl", "big")}
  <label>Data</label><input type="date" id="fData" class="data-full" value="${ui.data}"></div>`;
  const sc = critsDe("setor");
  if (sc.length) { const t = total(sk, "setor"); h += `<div class="card"><h2>Pontos do setor ${esc(s)}</h2><div class="cmdcard" style="margin-top:0"><div class="cmdhead"><div><b>Setor ${esc(s)}</b></div><div class="tot ${t < 0 ? "neg" : ""}" id="tot-${sk}">${t > 0 ? "+" : ""}${t}</div></div>${critRows(sk, sc)}</div></div>`; }
  const cs = cmdsDoSetor(s);
  h += `<div class="card"><h2>Comandos do setor ${esc(s)}</h2>`;
  if (!cs.length) h += `<div class="empty-msg">Nenhum comando cadastrado no setor ${esc(s)}.</div><button class="btn sec" data-cadastro>+ Cadastrar comando</button>`;
  cs.forEach(c => { const t = total(c.id, "cmd"); h += `<div class="cmdcard"><div class="cmdhead"><div><b>${esc(c.qra)}</b> <span class="sub">· ${esc(c.funcao)}</span></div><div class="tot ${t < 0 ? "neg" : ""}" id="tot-${c.id}">${t > 0 ? "+" : ""}${t}</div></div>${critRows(c.id, critsDe("cmd"))}</div>`; });
  const tg = totalGeral();
  return h + `</div><div class="acao"><div class="info"><small>Setor ${esc(s)} · total a lançar</small><b id="totGeral">${tg > 0 ? "+" : ""}${tg} pts</b></div><button class="btn" data-lancar>Lançar</button></div>`;
}
function totalGeral() { const s = ui.setorL; return total(SKEY(s), "setor") + cmdsDoSetor(s).reduce((t, c) => t + total(c.id, "cmd"), 0); }

function vRanking() {
  const seg = `<div class="seg">${SUBS.map(([k, n]) => `<button class="${k === ui.sub ? "on" : ""}" data-sub="${k}">${n}</button>`).join("")}</div>`;
  return seg + ({ ranking: vRankingLista, premios: vPremios, historico: vHistorico }[ui.sub] || vRankingLista)();
}
function vPremios() {
  const c = ciclo(); const r = ranking(c.ini, c.fim, ""); const falta = Math.max(0, CICLO - c.dias);
  let h = `<div class="card"><h2>Ciclo atual</h2><div class="sub">De ${fmtD(c.ini)} até hoje · ${c.dias} de ${CICLO} dias</div><div class="progress"><i style="width:${Math.min(100, c.dias / CICLO * 100)}%"></i></div>`;
  const top = r.length ? r[0].pts : 0; const emp = r.filter(x => x.pts === top && top > 0);
  if (!r.length || top <= 0) h += `<div class="empty-msg">Ainda sem pontos neste ciclo.</div>`;
  else if (!c.pronto) h += `<div class="winner"><div class="sub">Liderando agora</div><div class="big-n">${esc(r[0].qra)}</div><div class="sub">${esc(r[0].setor)} · ${esc(r[0].funcao)} · ${top} pts</div></div><div class="empty-msg" style="padding:6px">Faltam <b>${falta} dia(s)</b> para liberar a premiação.</div>`;
  else {
    if (!ui.ganhador || !emp.some(x => x.id === ui.ganhador)) ui.ganhador = emp[0].id;
    const g = r.find(x => x.id === ui.ganhador);
    h += `<div class="winner"><div class="crown">🏆</div><div class="sub">Melhor comando do ciclo</div><div class="big-n">${esc(g.qra)}</div><div class="sub">${esc(g.setor)} · ${esc(g.funcao)} · ${g.pts} pts</div></div>`;
    if (emp.length > 1) h += `<label>Empate em ${top} pts, escolha quem premiar:</label>${chips(emp.map(x => [x.id, x.qra]), ui.ganhador, "gan")}`;
    h += `<label>Prêmio</label><input id="pPremio" placeholder="Ex.: Destaque da semana"><label>Observação</label><input id="pObs"><button class="btn" data-premiar>🏅 Registrar prêmio</button>`;
  }
  h += `</div>`;
  if (r.length && top > 0) { h += `<div class="card"><h2>Pontuação do ciclo</h2>`; r.slice(0, 8).forEach((x, i) => h += rankRow(x, i, Math.max(1, top))); h += `</div>`; }
  h += `<div class="card"><h2>Prêmios concedidos</h2>`;
  const list = S.premios.slice().sort((a, b) => b.fim.localeCompare(a.fim));
  if (!list.length) h += `<div class="empty-msg">Nenhum prêmio registrado.</div>`;
  list.forEach(p => { h += `<div class="hist"><div class="who"><b>🏅 ${esc(p.qra)} <span class="sub">· ${esc(p.setor)} ${esc(p.funcao)}</span></b><span>${esc(p.premio)} · ${p.pts} pts</span><span>Ciclo ${fmtDs(p.inicio)} a ${fmtDs(p.fim)}${p.obs ? " · " + esc(p.obs) : ""}</span></div><button class="x" data-delp="${esc(p.id)}">×</button></div>`; });
  return h + `</div>`;
}

function vHistorico() {
  const list = S.lancamentos.filter(l => !ui.histSetor || l.setor === ui.histSetor).slice().sort((a, b) => (b.data + b.id).localeCompare(a.data + a.id));
  let h = `<div class="card">${chips(SETCH, ui.histSetor, "hset")}</div><div class="card"><h2>Lançamentos (${list.length})</h2>`;
  if (!list.length) h += `<div class="empty-msg">Nada lançado ainda.</div>`;
  list.slice(0, 300).forEach(l => { h += `<div class="hist"><div class="who"><b>${esc(l.qra)} <span class="sub">· ${l.cmdId ? esc(l.setor) + " " + esc(l.funcao) : "pontos do setor"}</span></b><span>${esc(l.critNome)}${l.qtd > 1 ? " ×" + l.qtd : ""} · ${fmtD(l.data)}</span>${l.obs ? `<span>${esc(l.obs)}</span>` : ""}</div><div class="pts ${l.pontos < 0 ? "neg" : ""}" style="font-size:15px">${l.pontos > 0 ? "+" : ""}${l.pontos}</div><button class="x" data-dell="${esc(l.id)}">×</button></div>`; });
  return h + `</div>`;
}

/* ===== Setorização ===== */
const fmtDH = s => { if (!s) return ""; const d = new Date(s); return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); };
function vSetorizacao() {
  const pend = S.npm.filter(x => x.nivel === "setorizar" && !x.setor_destino);
  const seg = `<div class="seg"><button class="${ui.setSub === "setorizar" ? "on" : ""}" data-ssub="setorizar">Setorizar${pend.length ? ` <span class="cnt">${pend.length}</span>` : ""}</button><button class="${ui.setSub === "efetivos" ? "on" : ""}" data-ssub="efetivos">Efetivos por setor</button></div>`;
  return seg + (ui.setSub === "efetivos" ? vEfetivos() : vSetorizar(pend));
}
function vSetorizar(pend) {
  if (!npmOk) return `<div class="card"><div class="empty-msg">A ligação com o NPM ainda não foi criada no banco.<br>Rode de novo o <b>supabase/schema.sql</b> no Supabase.</div></div>`;
  let h = `<div class="card"><h2>Aguardando setorização (${pend.length})</h2>`;
  if (!pend.length) h += `<div class="empty-msg">Nenhum efetivo aguardando.<br><span class="sub">Quando o NPM marcar alguém como <b>Setorizar</b>, ele aparece aqui.</span></div>`;
  pend.slice().sort((a, b) => String(a.atualizado_em).localeCompare(String(b.atualizado_em))).forEach(x => {
    const sel = ui.envio[x.id] || "";
    h += `<div class="npmcard"><div class="cmdhead"><div style="min-width:0"><b>${esc(x.qra)}</b><div class="sub">${[x.dc ? "DC: " + esc(x.dc) : "", x.data_entrada ? "Entrada " + fmtD(String(x.data_entrada).slice(0, 10)) : "", x.recrutado_por ? "Recrutado por " + esc(x.recrutado_por) : ""].filter(Boolean).join(" · ")}</div></div><span class="tag">NPM · ${fmtDH(x.atualizado_em)}</span></div>
    ${x.obs ? `<div class="sub" style="margin-bottom:8px">${esc(x.obs)}</div>` : ""}
    <label>Enviar para o setor</label>${chips(SETORES.map(s => [x.id + "|" + s, s]), sel ? x.id + "|" + sel : "", "envset", "big")}
    <button class="btn" data-enviar="${x.id}" ${sel ? "" : "disabled"}>${sel ? "Enviar para o Setor " + esc(sel) : "Escolha o setor"}</button></div>`;
  });
  h += `</div>`;
  const env = S.npm.filter(x => x.setor_destino).sort((a, b) => String(b.setorizado_em).localeCompare(String(a.setorizado_em)));
  h += `<div class="card"><h2>Enviados (${env.length})</h2>`;
  if (!env.length) h += `<div class="empty-msg">Ninguém enviado ainda.</div>`;
  env.slice(0, 50).forEach(x => { h += `<div class="hist"><div class="who"><b>${esc(x.qra)}</b><span>→ Setor ${esc(x.setor_destino)} · ${fmtDH(x.setorizado_em)}</span></div><button class="btn sm sec" data-desfazer="${x.id}">Desfazer</button></div>`; });
  return h + `</div>`;
}
function vEfetivos() {
  if (!RP.carregado) {
    if (!RP.carregando && !RP.erro) carregarRp().then(render);
    if (RP.erro) return `<div class="card"><div class="empty-msg">Não consegui ler os efetivos do rpcontrol.<br><span class="sub">${esc(RP.erro)}</span></div><button class="btn sec" data-rprecarregar>Tentar de novo</button></div>`;
    return `<div class="card"><div class="empty-msg">Carregando efetivos do rpcontrol…</div></div>`;
  }
  // Só os setores avaliados (Sul, Norte, Centro, Leste); Especiais, NPM e sem setor ficam de fora.
  const grupos = RP.setores.filter(s => SETORES.some(n => n.toLowerCase() === String(s.nome).trim().toLowerCase())).map(s => ({ id: s.id, nome: "Setor " + s.nome, lista: [] }));
  const porId = {}; grupos.forEach(g => porId[g.id] = g);
  const q = slugUsuario(ui.busca).replace(/\./g, " ");
  RP.membros.forEach(m => { if (q && !slugUsuario(m.nome).replace(/\./g, " ").includes(q) && !String(m.discord || "").toLowerCase().includes(q)) return; const g = porId[m.setor_id]; if (g) g.lista.push(m); });
  const ordemF = { "1CMD": 0, "2CMD": 1, "1AUX": 2, "2AUX": 3 };
  const total = grupos.reduce((t, g) => t + g.lista.length, 0);
  let h = `<div class="card"><input id="rpBusca" type="search" placeholder="Buscar efetivo por nome ou DC" value="${esc(ui.busca)}" enterkeyhint="search" autocapitalize="none" autocorrect="off">
  <div class="resumo">${grupos.map(g => `<button class="rs ${ui.rpSetor === g.id ? "on" : ""}" data-rpset="${g.id}"><b>${g.lista.length}</b><span>${esc(g.nome.replace("Setor ", ""))}</span></button>`).join("")}</div>
  <div class="sub" style="text-align:center;margin-top:8px">${total} efetivo(s) ativos${q ? " encontrados" : ""} · dados do rpcontrol <button class="lnk" data-rprecarregar>atualizar</button></div></div>`;
  grupos.filter(g => !ui.rpSetor || g.id === ui.rpSetor).forEach(g => {
    if (q && !g.lista.length) return;
    const aberto = ui.abertos[g.id] || !!q || !!ui.rpSetor;
    g.lista.sort((a, b) => (ordemF[a.funcao] ?? 9) - (ordemF[b.funcao] ?? 9) || b.patente - a.patente || a.nome.localeCompare(b.nome));
    h += `<div class="card"><button class="grp" data-grp="${g.id}"><span>${esc(g.nome)}</span><span class="grp-n">${g.lista.length}<i class="chev ${aberto ? "up" : ""}"></i></span></button>`;
    if (aberto) {
      if (!g.lista.length) h += `<div class="empty-msg">Nenhum efetivo.</div>`;
      g.lista.forEach(m => { h += `<div class="ef"><span class="pat">${PAT_SIGLA[m.patente] || ""}</span><div class="who"><b>${esc(m.nome)}</b>${m.discord ? `<span>${esc(m.discord)}</span>` : ""}</div>${m.funcao ? `<span class="fun">${FUN_SIGLA[m.funcao]}</span>` : ""}</div>`; });
    }
    h += `</div>`;
  });
  return h;
}

function vAjustes() {
  let h = `<div class="card"><h2>Pontos por critério</h2>`;
  S.criterios.forEach(c => { h += `<div class="crit"><div>${esc(c.nome)}${c.tipo === "efetivos" ? ' <span class="sub">(por efetivo)</span>' : ""} <span class="sub">· ${c.escopo === "setor" ? "setor" : "comando"}</span></div><input type="number" inputmode="numeric" data-cpts="${esc(c.id)}" value="${c.pontos}"></div>`; });
  h += `<div class="sub" style="margin-top:8px">Vale para os próximos lançamentos; os já feitos mantêm o valor.</div></div>
  <div class="card"><h2>Backup</h2><button class="btn sec" data-export>Copiar backup</button><label>Importar backup (cole aqui o backup do painel antigo ou deste)</label><textarea id="impTxt"></textarea><button class="btn sec" data-import>Importar backup</button></div>
  <div class="card"><div class="sub" style="text-align:center">Versão do painel: ${VERSAO}</div><button class="btn sec" data-sair>Sair da conta</button><button class="btn danger" data-reset>Apagar lançamentos e prêmios</button></div>`;
  return h;
}

/* ===== Render ===== */
function render() {
  const root = document.getElementById("root");
  if (ui.fase === "config") { root.innerHTML = vConfig(); return; }
  if (ui.fase === "login") { root.innerHTML = vLogin(); return; }
  if (ui.fase === "negado") { root.innerHTML = vNegado(); return; }
  if (ui.fase === "erro") { root.innerHTML = vErro(); return; }
  if (ui.fase !== "pronto") { root.innerHTML = `<div class="loading">Carregando…</div>`; return; }
  const st = document.getElementById("status"); const stTxt = st ? st.textContent : "✓ Conectado", stCor = st ? st.style.color : "#5fbf7a";
  const y = window.scrollY;
  root.innerHTML = header() + `<main id="app" class="${tab === "lancar" ? "com-barra" : ""}">${{ ranking: vRanking, lancar: vLancar, setorizacao: vSetorizacao, ajustes: vAjustes }[tab]()}</main>`;
  if (render.mesmaAba === tab) window.scrollTo(0, y); render.mesmaAba = tab;
  setStatus(stTxt, stCor);
}

/* ===== Modais ===== */
function openModal(html) { document.getElementById("modalBody").innerHTML = html; document.getElementById("modal").classList.add("show"); }
function closeModal() { document.getElementById("modal").classList.remove("show"); }
document.getElementById("modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });
let confirmOk = null;
function confirmBox(msg, ok) { confirmOk = ok; openModal(`<h2>Confirmar</h2><p>${msg}</p><div class="grid2"><button class="btn sec" data-mclose>Cancelar</button><button class="btn" data-mok>Confirmar</button></div>`); }
const cad = { id: null, setor: SETORES[0], funcao: FUNCOES[0] };
function cadastroModal(id) {
  cad.id = id || null; const c = id ? cmdById(id) : { qra: "", dc: "", setor: ui.setorL || SETORES[0], funcao: FUNCOES[0] };
  cad.setor = c.setor; cad.funcao = c.funcao;
  let h = `<div class="mhead"><h2>${id ? "Editar comando" : "Cadastrar comando"}</h2><button class="mx" data-mclose aria-label="Fechar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div><label>QRA</label><input id="cQra" value="${esc(c.qra)}" placeholder="Nome no jogo"><label>DC</label><input id="cDc" value="${esc(c.dc)}" placeholder="Discord">
  <label>Setor</label>${chips(SETORES.map(s => [s, s]), c.setor, "cset", "big")}<label>Função</label>${chips(FUNCOES.map(f => [f, f]), c.funcao, "cfun", "big")}
  <button class="btn" data-csave>${id ? "Salvar alterações" : "Cadastrar"}</button>`;
  if (S.comandos.length) {
    h += `<h2 style="margin-top:20px">Cadastrados (${S.comandos.length})</h2>`;
    SETORES.forEach(s => cmdsDoSetor(s).forEach(x => { h += `<div class="hist"><div class="who"><b>${esc(x.qra)}</b><span>${esc(x.setor)} · ${esc(x.funcao)}${x.dc ? " · DC: " + esc(x.dc) : ""}</span></div><button class="btn sm sec" data-cedit="${x.id}">Editar</button><button class="x" data-cdel="${x.id}">×</button></div>`; }));
  }
  openModal(h);
}

/* ===== Ações ===== */
function readForm() {
  const g = id => document.getElementById(id);
  if (g("fData")) ui.data = g("fData").value || today(); if (g("fObs")) ui.obs = g("fObs").value;
  if (g("rDe")) ui.de = g("rDe").value; if (g("rAte")) ui.ate = g("rAte").value;
}
function setF(k, c, v) { (ui.form[k] = ui.form[k] || {})[c] = v; }
function updTot(k) { const el = document.getElementById("tot-" + k); if (el) { const t = total(k, k.startsWith("S-") ? "setor" : "cmd"); el.textContent = (t > 0 ? "+" : "") + t; el.classList.toggle("neg", t < 0); } const g = document.getElementById("totGeral"); if (g) { const t = totalGeral(); g.textContent = (t > 0 ? "+" : "") + t + " pts"; } }

async function lancar() {
  readForm(); const s = ui.setorL, sk = SKEY(s), cs = cmdsDoSetor(s), novos = [];
  const push = (key, cr, o) => {
    const v = fval(key, cr.id); if (!v) return; if (cr.tipo === "efetivos" && v <= 3) return;
    novos.push(Object.assign({ id: uuid(), data: ui.data, crit: cr.id, critNome: cr.tipo === "efetivos" ? `Efetivos ativos (${v})` : cr.nome, qtd: cr.tipo === "efetivos" ? 1 : v, pontos: cr.pontos * v, obs: ui.obs }, o));
  };
  critsDe("setor").forEach(cr => push(sk, cr, { cmdId: null, qra: "Setor " + s, setor: s, funcao: "Setor" }));
  cs.forEach(c => critsDe("cmd").forEach(cr => push(c.id, cr, { cmdId: c.id, qra: c.qra, setor: c.setor, funcao: c.funcao })));
  if (!novos.length) return toast("Nada marcado para lançar");
  S.lancamentos.push(...novos); delete ui.form[sk]; cs.forEach(c => delete ui.form[c.id]); render();
  if (await run(sb.from("tg_lancamentos").insert(novos.map(toL)))) toast(`✓ Setor ${s} lançado`);
}
async function premiar() {
  const c = ciclo(), r = ranking(c.ini, c.fim, ""), g = r.find(x => x.id === ui.ganhador);
  const premio = document.getElementById("pPremio").value.trim();
  if (!g) return; if (!premio) return toast("Escreva qual é o prêmio");
  const p = { id: uuid(), cmdId: g.id, qra: g.qra, setor: g.setor, funcao: g.funcao, premio, pts: g.pts, inicio: c.ini, fim: c.fim, obs: document.getElementById("pObs").value.trim() };
  S.premios.push(p); ui.ganhador = null; render();
  if (await run(sb.from("tg_premios").insert(toP(p)))) toast("🏅 Prêmio registrado — novo ciclo iniciado");
}
async function salvarCmd() {
  const qra = document.getElementById("cQra").value.trim(), dc = document.getElementById("cDc").value.trim();
  if (!qra) return toast("Informe o QRA");
  const editando = !!cad.id;
  if (editando) {
    const c = cmdById(cad.id); Object.assign(c, { qra, dc, setor: cad.setor, funcao: cad.funcao });
    render(); cadastroModal();
    if (await run(sb.from("tg_comandos").update({ qra, dc, setor: cad.setor, funcao: cad.funcao }).eq("id", c.id))) toast("✓ Comando atualizado");
  } else {
    const c = { id: uuid(), qra, dc, setor: cad.setor, funcao: cad.funcao };
    S.comandos.push(c); render(); cadastroModal();
    if (await run(sb.from("tg_comandos").insert(toCmd(c)))) toast("✓ Comando cadastrado");
  }
}
async function importar(o) {
  // Aceita o backup do painel antigo (ids curtos) e deste (uuid): gera ids novos e refaz as ligações.
  const mapa = {}; const novoId = id => id ? (mapa[id] = mapa[id] || uuid()) : null;
  const cmds = o.comandos.map(c => ({ ...c, id: novoId(c.id) }));
  const lans = o.lancamentos.map(l => ({ ...l, id: uuid(), cmdId: l.cmdId ? novoId(l.cmdId) : null }));
  const prs = (o.premios || []).map(p => ({ ...p, id: uuid(), cmdId: p.cmdId ? novoId(p.cmdId) : null }));
  setStatus("Importando…");
  const zero = "00000000-0000-0000-0000-000000000000";
  for (const t of ["tg_lancamentos", "tg_premios", "tg_comandos"]) { const { error } = await sb.from(t).delete().neq("id", zero); if (error) return toast("Erro: " + error.message); }
  const steps = [];
  if (cmds.length) steps.push(sb.from("tg_comandos").insert(cmds.map(toCmd)));
  for (let i = 0; i < lans.length; i += 500) steps.push(sb.from("tg_lancamentos").insert(lans.slice(i, i + 500).map(toL)));
  if (prs.length) steps.push(sb.from("tg_premios").insert(prs.map(toP)));
  for (const c of o.criterios || []) if (critById(c.id)) steps.push(sb.from("tg_criterios").update({ pontos: Number(c.pontos) || 0 }).eq("id", c.id));
  for (const p of steps) { const { error } = await p; if (error) { toast("Erro: " + error.message); break; } }
  await carregar(); render(); setStatus("✓ Salvo no banco", "#5fbf7a"); toast("Backup importado");
}

document.addEventListener("click", async e => {
  const t = e.target.closest("button"); if (!t) return; const d = t.dataset;
  if (d.tab) { if (d.tab === "ranking" && tab === "ranking" && ui.sub !== "ranking") { ui.sub = "ranking"; render(); window.scrollTo(0, 0); return; } return go(d.tab); }
  if (d.sub) { ui.sub = d.sub; try { history.replaceState(null, "", "#" + (d.sub === "ranking" ? "ranking" : d.sub)); } catch (e) { } render(); window.scrollTo(0, 0); return; }
  if (d.cadastro !== undefined) return cadastroModal();
  if (d.sair !== undefined) { await sb.auth.signOut(); location.reload(); return; }
  if (d.recarregar !== undefined) return entrar();
  if (d.per !== undefined) { readForm(); ui.periodo = d.per; return render(); }
  if (d.setf !== undefined) { readForm(); ui.setorF = d.setf; return render(); }
  if (d.hset !== undefined) { ui.histSetor = d.hset; return render(); }
  if (d.setl !== undefined) { readForm(); ui.setorL = d.setl; return render(); }
  if (d.tog) { readForm(); const [k, c] = d.tog.split("|"); setF(k, c, fval(k, c) ? 0 : 1); return render(); }
  if (d.st) { readForm(); const [k, c, n] = d.st.split("|"); setF(k, c, Math.max(0, fval(k, c) + Number(n))); return render(); }
  if (d.lancar !== undefined) return lancar();
  if (d.ssub) { ui.setSub = d.ssub; render(); window.scrollTo(0, 0); return; }
  if (d.envset) { const [id, s] = d.envset.split("|"); ui.envio[id] = ui.envio[id] === s ? "" : s; return render(); }
  if (d.enviar) {
    const id = d.enviar, s = ui.envio[id], x = S.npm.find(n => n.id === id); if (!s || !x) return;
    return confirmBox(`Enviar <b>${esc(x.qra)}</b> para o <b>Setor ${esc(s)}</b>?`, async () => {
      x.setor_destino = s; x.setorizado_em = new Date().toISOString(); delete ui.envio[id]; render();
      if (await run(sb.rpc("tg_setorizar", { p_id: id, p_setor: s }))) toast(`✓ ${x.qra} enviado para o Setor ${s}`);
    });
  }
  if (d.desfazer) {
    const x = S.npm.find(n => n.id === d.desfazer); if (!x) return;
    return confirmBox(`Desfazer o envio de <b>${esc(x.qra)}</b>? Ele volta para a lista de aguardando.`, async () => {
      x.setor_destino = null; x.setorizado_em = null; render(); await run(sb.rpc("tg_setorizar", { p_id: x.id, p_setor: null }));
    });
  }
  if (d.rpset !== undefined) { ui.rpSetor = ui.rpSetor === d.rpset ? "" : d.rpset; return render(); }
  if (d.grp) { ui.abertos[d.grp] = !ui.abertos[d.grp]; return render(); }
  if (d.rprecarregar !== undefined) { RP.carregado = false; RP.erro = ""; render(); await carregarRp(); return render(); }
  if (d.gan) { ui.ganhador = d.gan; return render(); }
  if (d.premiar !== undefined) return premiar();
  if (d.dell) return confirmBox("Apagar este lançamento?", async () => { S.lancamentos = S.lancamentos.filter(l => l.id !== d.dell); render(); await run(sb.from("tg_lancamentos").delete().eq("id", d.dell)); });
  if (d.delp) return confirmBox("Apagar este prêmio? O ciclo volta para a data anterior.", async () => { S.premios = S.premios.filter(p => p.id !== d.delp); render(); await run(sb.from("tg_premios").delete().eq("id", d.delp)); });
  if (d.cset) { cad.setor = d.cset; t.parentNode.querySelectorAll(".chip").forEach(b => b.classList.toggle("on", b === t)); return; }
  if (d.cfun) { cad.funcao = d.cfun; t.parentNode.querySelectorAll(".chip").forEach(b => b.classList.toggle("on", b === t)); return; }
  if (d.csave !== undefined) return salvarCmd();
  if (d.cedit) return cadastroModal(d.cedit);
  if (d.cdel) { const c = cmdById(d.cdel); return confirmBox(`Remover ${esc(c.qra)}? Os pontos já lançados ficam no histórico.`, async () => { S.comandos = S.comandos.filter(x => x.id !== d.cdel); render(); cadastroModal(); await run(sb.from("tg_comandos").delete().eq("id", d.cdel)); }); }
  if (d.mclose !== undefined) return closeModal();
  if (d.mok !== undefined) { closeModal(); const f = confirmOk; confirmOk = null; if (f) f(); return; }
  if (d.export !== undefined) {
    const txt = JSON.stringify({ v: 2, savedAt: Date.now(), ...S });
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast("Backup copiado"), () => openModal(`<h2>Backup</h2><p class="sub">Selecione e copie:</p><textarea readonly>${esc(txt)}</textarea><button class="btn sec" data-mclose>Fechar</button>`));
    return;
  }
  if (d.import !== undefined) {
    let o; try { o = JSON.parse(document.getElementById("impTxt").value); } catch (err) { return toast("Backup inválido"); }
    if (!o || !Array.isArray(o.comandos) || !Array.isArray(o.lancamentos)) return toast("Backup inválido");
    return confirmBox("Substituir comandos, lançamentos e prêmios pelos do backup?", () => importar(o));
  }
  if (d.reset !== undefined) return confirmBox("Apagar TODOS os lançamentos e prêmios? Comandos ficam.", async () => {
    S.lancamentos = []; S.premios = []; render(); const zero = "00000000-0000-0000-0000-000000000000";
    if (await run(sb.from("tg_lancamentos").delete().neq("id", zero))) await run(sb.from("tg_premios").delete().neq("id", zero));
  });
});
const ptsTimers = {};
document.addEventListener("input", e => {
  const d = e.target.dataset;
  if (e.target.id === "rpBusca") { ui.busca = e.target.value; clearTimeout(ui._bt); ui._bt = setTimeout(() => { const pos = e.target.selectionStart; render(); const el = document.getElementById("rpBusca"); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (er) { } } }, 250); return; }
  if (d.efet) { const [k, c] = d.efet.split("|"); setF(k, c, Math.max(0, parseInt(e.target.value) || 0)); updTot(k); }
  if (d.cpts) {
    const c = critById(d.cpts); if (!c) return; c.pontos = Number(e.target.value) || 0;
    clearTimeout(ptsTimers[c.id]); ptsTimers[c.id] = setTimeout(() => run(sb.from("tg_criterios").update({ pontos: c.pontos }).eq("id", c.id)), 700);
  }
});
document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches && e.target.matches(".efin,#fObs")) e.target.blur(); });
document.addEventListener("change", e => {
  if (e.target.id === "rDe" || e.target.id === "rAte") { readForm(); render(); }
  if (e.target.id === "fData" || e.target.id === "fObs") readForm();
});
document.addEventListener("submit", async e => {
  if (e.target.id !== "loginForm") return; e.preventDefault();
  const nome = document.getElementById("lNome").value, senha = document.getElementById("lSenha").value;
  const err = document.getElementById("lErr"); err.textContent = "Entrando…";
  const { error } = await sb.auth.signInWithPassword({ email: emailDe(nome), password: senha });
  if (error) { err.textContent = /invalid login/i.test(error.message) ? "Nome ou senha incorretos." : error.message; return; }
  entrar();
});

/* ===== Início ===== */
async function entrar() {
  ui.fase = "carregando"; render();
  try {
    const { data, error } = await sb.rpc("tg_acesso");
    if (error) throw error;
    if (data !== "dono") { ui.fase = "negado"; return render(); }
    await carregar(); ui.fase = "pronto"; render(); setStatus("✓ Conectado", "#5fbf7a");
  } catch (e) { ui.fase = "erro"; ui.erro = e.message || String(e); render(); }
}
async function boot() {
  if (!sb) { ui.fase = "config"; return render(); }
  const { data: { session } } = await sb.auth.getSession();
  if (session) entrar(); else { ui.fase = "login"; render(); }
}
let saiuEm = 0;
document.addEventListener("visibilitychange", async () => {
  if (document.hidden) { saiuEm = Date.now(); return; }
  if (ui.fase !== "pronto" || Date.now() - saiuEm < 30000) return;
  const aviso = document.createElement("div"); aviso.className = "carregando-dados"; aviso.textContent = "Atualizando…"; document.body.appendChild(aviso);
  try { await carregar(); render(); } catch (e) { } aviso.remove();
});
const VERSAO = "11";
if ("serviceWorker" in navigator) {
  // Quando uma versão nova do painel é instalada, recarrega uma vez sozinho.
  let recarregou = false; const tinhaControle = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (tinhaControle && !recarregou) { recarregou = true; location.reload(); } });
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(r => r.update()).catch(() => { }));
}
boot();
