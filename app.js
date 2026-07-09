/* ============================================================
   RADAR CX — app.js  (v4 — links visuais + fixes)
   ============================================================ */

const PUB =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQHbec7Efe-4IeQKC1fJbz95l2gORC2WOVdjuD4eIF1nvjOUAAwsDBGpd5IqJTER8cqgCg2dSdfxqmH/pub";

const SHEETS = {
  indicadores:     { gid: "1072320521" },
  historico_metas: { gid: "247832140" },
  projetos:        { gid: "1444248565" },
  organograma:     { gid: "2020578318" },
};

function csvUrl(tab) {
  const t = SHEETS[tab] || {};
  return t.url || `${PUB}?gid=${t.gid}&single=true&output=csv`;
}
function isConfigured(tab) {
  const t = SHEETS[tab] || {};
  return Boolean(t.url || (t.gid && !String(t.gid).startsWith("COLE_")));
}

const _cache = {};
const CACHE_TTL = 60000;

async function fetchCsv(tab, force = false) {
  const hit = _cache[tab];
  if (!force && hit && Date.now() - hit.ts < CACHE_TTL) return hit.rows;
  const base = csvUrl(tab);
  const url = base + (base.includes("?") ? "&" : "?") + "_t=" + Date.now();
  const res = await fetch(url, { mode: "cors", redirect: "follow" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const rows = parseCsv(await res.text());
  _cache[tab] = { rows, ts: Date.now() };
  return rows;
}
function refreshTab(tab, fn) { delete _cache[tab]; fn(); }

const ROUTES = [
  { hash: "#/indicadores", label: "Indicadores", icon: "monitoring",   render: showIndicadores },
  { hash: "#/projetos",    label: "Projetos",    icon: "lightbulb",    render: renderProjetos },
  { hash: "#/organograma", label: "Organograma", icon: "account_tree", render: renderOrganograma },
  { hash: "#/links",       label: "Links",       icon: "link",         render: renderLinks },
];
const view = () => document.getElementById("view");

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", i = 0, inQuotes = false;
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ""));
}

function normKey(k) {
  return String(k).trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}
function toObjects(rows) {
  if (!rows.length) return [];
  const header = rows[0].map(normKey);
  return rows.slice(1).map(r => {
    const o = {};
    header.forEach((h, idx) => { o[h] = (r[idx] ?? "").trim(); });
    return o;
  });
}
function pick(obj, aliases) {
  for (const a of aliases) if (obj[a] != null && obj[a] !== "") return obj[a];
  return null;
}
function splitList(v) {
  if (!v) return [];
  return String(v).split(/[;,{}]/).map(s => s.trim()).filter(Boolean);
}

function num(v) {
  if (v == null || v === "") return null;
  let s = String(v).replace(/[R$\s%]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
function fmt(v, unidade) {
  if (v == null || v === "") return "—";
  const n = Number(v); const u = normKey(unidade || "");
  if (u === "" && typeof v === "string" && isNaN(n)) return v;
  if (u.startsWith("perc") || unidade === "%") return (Math.round(n * 10) / 10).toLocaleString("pt-BR") + "%";
  if (u === "r" || unidade === "R$" || u === "reais") return "R$ " + n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  if (u === "segundos" || u === "s" || u === "seg") return n.toLocaleString("pt-BR") + "s";
  if (u === "minutos" || u === "min") return n.toLocaleString("pt-BR") + "min";
  if (u === "nota") return (Math.round(n * 10) / 10).toLocaleString("pt-BR");
  if (u === "qtd" || u === "quantidade") return n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  return n.toLocaleString("pt-BR");
}
function inferDir(nome, unidade, explicit) {
  if (explicit) {
    const e = normKey(explicit);
    if (["lower", "menor", "descendente", "min"].includes(e)) return "lower";
    if (["higher", "maior", "ascendente", "max"].includes(e)) return "higher";
  }
  const u = normKey(unidade || ""), n = normKey(nome || "");
  if (["segundos", "minutos", "s", "seg", "min"].includes(u)) return "lower";
  if (/fila|tempo|reembolso|reenvio|contact_rate|churn|abandono|negativ|custo/.test(n)) return "lower";
  return "higher";
}
function normStatus(s) {
  if (!s) return null;
  const x = normKey(s);
  if (["on_track", "no_alvo", "ok", "verde", "atingido", "dentro"].includes(x)) return "on_track";
  if (["at_risk", "em_risco", "atencao", "amarelo", "risco", "alerta"].includes(x)) return "at_risk";
  if (["off_track", "fora_da_meta", "critico", "vermelho", "nao_atingido", "fora"].includes(x)) return "off_track";
  if (["sem_dado", "na", "n_a", "sem"].includes(x)) return "sem_dado";
  return null;
}
function computeStatus(valor, meta, dir) {
  if (valor == null || meta == null) return "sem_dado";
  const higher = dir !== "lower";
  if (higher) return valor >= meta ? "on_track" : (valor >= meta * 0.9 ? "at_risk" : "off_track");
  return valor <= meta ? "on_track" : (valor <= meta * 1.1 ? "at_risk" : "off_track");
}
const STATUS_LABEL = { on_track: "No alvo", at_risk: "Atenção", off_track: "Fora da meta", sem_dado: "Sem dado" };

const FAROL_COR = { on_track: "#1b873f", at_risk: "#c9920a", off_track: "#c0392b", sem_dado: "#8a8d93" };
const FAROL_TXT = { on_track: "No alvo", at_risk: "Atenção", off_track: "Fora da meta", sem_dado: "Sem dado" };
function farolLosango(status) {
  const c = FAROL_COR[status] || FAROL_COR.sem_dado;
  const t = FAROL_TXT[status] || "Sem dado";
  const semDado = status === "sem_dado";
  const fillOp = semDado ? "0.12" : (status === "at_risk" ? "0.20" : "0.18");
  const strokeOp = semDado ? "0.45" : "0.6";
  const lineOp = semDado ? "0.25" : "0.35";
  const facet = semDado ? "" : `<polygon points="12,2 22,12 12,12 2,12" fill="${c}" fill-opacity="0.14"/>`;
  return `<svg class="farol-losango" width="24" height="24" viewBox="0 0 24 24" role="img" aria-label="${t}"><title>${t}</title>`
    + `<polygon points="12,2 22,12 12,22 2,12" fill="${c}" fill-opacity="${fillOp}" stroke="${c}" stroke-opacity="${strokeOp}" stroke-width="1.2"/>`
    + facet
    + `<line x1="2" y1="12" x2="22" y2="12" stroke="${c}" stroke-opacity="${lineOp}" stroke-width="0.8"/>`
    + `</svg>`;
}

function esc(s) {
  return (s == null ? "" : String(s)).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function normTxt(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function loading() {
  view().innerHTML = `<div class="state"><span class="ms spin">progress_activity</span>Carregando…</div>`;
}
function errorState(tab, msg) {
  view().innerHTML = `<div class="state state--error"><span class="ms">error</span>Não consegui carregar <b>${esc(tab)}</b>.<br />${esc(msg)}</div>`;
}
function notConfigured(tab) {
  view().innerHTML = `<div class="empty">A aba <b>${esc(tab)}</b> ainda não está configurada.</div>`;
}
function pageHead(title, sub, withRefresh) {
  return `<div class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<p class="sub">${esc(sub)}</p>` : ""}</div><div class="head-actions">${withRefresh ? `<button class="btn-refresh" id="refresh"><span class="ms">refresh</span> Atualizar</button>` : ""}</div></div>`;
}
function bindRefresh(fn) {
  const b = document.getElementById("refresh");
  if (b) b.onclick = fn;
}

/* ============================================================
   DEDUPLICAÇÃO DE INDICADORES
   ============================================================ */
function deduplicarIndicadores(objs) {
  const grupos = {};
  for (const o of objs) {
    const id = pick(o, ["id_indicador", "id"]) || pick(o, ["nome_exibicao", "nome"]) || "";
    if (!grupos[id]) grupos[id] = [];
    grupos[id].push(o);
  }

  const ativos = [];
  const historicoPorId = {};

  for (const [id, versoes] of Object.entries(grupos)) {
    versoes.sort((a, b) => {
      const da = pick(a, ["ultima_validacao_data", "ultima_validacao"]) || "";
      const db = pick(b, ["ultima_validacao_data", "ultima_validacao"]) || "";
      return db.localeCompare(da);
    });

    ativos.push(versoes[0]);

    if (versoes.length > 1) {
      const hist = [];
      for (let i = 1; i < versoes.length; i++) {
        const v = versoes[i];
        const proximaInicio = pick(versoes[i - 1], ["meta_vigencia_inicio", "meta_vigencia", "vigencia"]) || "";
        const fimCalculado = proximaInicio ? subtrairUmDia(proximaInicio) : "";
        hist.push({ ...v, _vigencia_fim_calculada: fimCalculado });
      }
      historicoPorId[id] = hist;
    }
  }

  return { ativos, historicoPorId };
}

function subtrairUmDia(dataIso) {
  if (!dataIso || !/^\d{4}-\d{2}-\d{2}/.test(dataIso)) return "";
  const d = new Date(dataIso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function fmtDataCurta(iso) {
  if (!iso) return "";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const aa = m[1].slice(2);
  return m[3] + "/" + m[2] + "/" + aa;
}

/* ============================================================
   SUPABASE — indicadores operacionais
   ============================================================ */

const SUPABASE_MAP = {
  gc_volume_atendimentos: { grupo: "Gocase",   campo: "atendimentos"    },
  gc_contact_rate:        { grupo: "Gocase",   campo: "contact_rate"    },
  gc_csat:                { grupo: "Gocase",   campo: "csat"            },
  gc_fila:                { grupo: "Gocase",   campo: "fila"            },
  gc_bot_retencao:        { grupo: "Gocase",   campo: "bot_retencao"    },
  gc_bot_csat:            { grupo: "Gocase",   campo: "bot_csat"        },
  gc_reenvio_rs:          { grupo: "Gocase",   campo: "reenvio_valor"   },
  gc_reembolso_rs:        { grupo: "Gocase",   campo: "reembolso_valor" },
  gc_review:              { grupo: "Gocase",   campo: "review"          },
  gc_nps:                 { grupo: "Gocase",   campo: "nps"             },
  gc_reenvio_taxa:        { grupo: "Gocase",   campo: "reenvio_taxa"    },
  gc_reembolso_taxa:      { grupo: "Gocase",   campo: "reembolso_taxa"  },
  gc_ra_nota_mensal:      { grupo: "Gocase",   campo: "ra_nota_mensal"  },
  gc_ra_ultimos_6m:       { grupo: "Gocase",   campo: "ra_ultimos_6m"   },
  gb_volume_atendimentos: { grupo: "Gobeaute", campo: "atendimentos"    },
  gb_contact_rate:        { grupo: "Gobeaute", campo: "contact_rate"    },
  gb_csat:                { grupo: "Gobeaute", campo: "csat"            },
  gb_fila:                { grupo: "Gobeaute", campo: "fila"            },
  gb_bot_retencao:        { grupo: "Gobeaute", campo: "bot_retencao"    },
  gb_bot_csat:            { grupo: "Gobeaute", campo: "bot_csat"        },
  gb_reenvio_rs:          { grupo: "Gobeaute", campo: "reenvio_valor"   },
  gb_reembolso_rs:        { grupo: "Gobeaute", campo: "reembolso_valor" },
  gb_nps:                 { grupo: "Gobeaute", campo: "nps"             },
  gb_review:              { grupo: "Gobeaute", campo: "review"          },
  gb_reenvio_taxa:        { grupo: "Gobeaute", campo: "reenvio_taxa"    },
  gb_reembolso_taxa:      { grupo: "Gobeaute", campo: "reembolso_taxa"  },
  gb_qtd_social_neg:      { grupo: "Gobeaute", campo: "social_neg_qtd"  },
  gb_pct_social_neg:      { grupo: "Gobeaute", campo: "social_neg_pct"  },
};

let _supCache = null;
let _supCacheTs = 0;
const SUP_TTL = 5 * 60 * 1000;

async function fetchIndicadoresOperacionais(force = false) {
  if (!force && _supCache && Date.now() - _supCacheTs < SUP_TTL) return _supCache;
  try {
    const res = await fetch("/api/indicadores-operacionais");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    _supCache = data;
    _supCacheTs = Date.now();
    return data;
  } catch (e) {
    console.warn("[supabase] indicadores operacionais indisponíveis:", e.message);
    return null;
  }
}

function enriquecerComSupabase(indicadores, supData) {
  if (!supData || !supData.grupos) return indicadores;
  const grupos = supData.grupos;
  return indicadores.map(ind => {
    const mapa = SUPABASE_MAP[ind.id];
    if (!mapa) return ind;
    const grupo = grupos[mapa.grupo];
    if (!grupo) return ind;
    const valorSup = grupo[mapa.campo];
    if (valorSup == null) return ind;
    const valorFinal = typeof valorSup === "string" ? valorSup : Number(valorSup);
    return { ...ind, valor: valorFinal, _fonte: "supabase", _periodo: supData.periodo };
  });
}

let indState = { empresa: null, area: "TODOS", items: null, header: "" };

function mapIndicador(o) {
  const nome = pick(o, ["nome_exibicao", "nome", "indicador", "titulo"]);
  const unidade = pick(o, ["unidade", "unit"]);
  const meta = num(pick(o, ["meta_atual", "meta", "target", "objetivo"]));
  const valor = num(pick(o, ["valor_atual", "valor", "realizado", "atual", "current", "resultado"]));
  const dir = inferDir(nome, unidade, pick(o, ["direcao", "direction", "sentido"]));
  const explicit = normStatus(pick(o, ["status_farol", "farol"]));
  return {
    id: pick(o, ["id_indicador", "id"]) || nome,
    nome, unidade, meta, valor, dir,
    empresa: pick(o, ["empresa", "company"]) || "",
    area: pick(o, ["area_responsavel", "area"]) || "",
    owner: pick(o, ["owner_nome", "owner", "responsavel"]) || "",
    status: explicit || computeStatus(valor, meta, dir),
  };
}

async function showIndicadores(force) {
  loading();
  try {
    const [rows, supData] = await Promise.allSettled([
      fetchCsv("indicadores", force === true),
      fetchIndicadoresOperacionais(force === true),
    ]);
    if (rows.status === "rejected") throw rows.reason;
    indState.header = (rows.value[0] || []).join(", ");
    const todos = toObjects(rows.value);
    const { ativos } = deduplicarIndicadores(todos);
    const mapped = ativos.map(mapIndicador);
    const supResult = supData.status === "fulfilled" ? supData.value : null;
    indState.items = enriquecerComSupabase(mapped, supResult);
    indState._supPeriodo = supResult?.periodo || null;
    if (indState.empresa == null) {
      const empresas = [...new Set(indState.items.map(i => i.empresa).filter(Boolean))];
      indState.empresa = empresas.includes("GC") ? "GC" : (empresas[0] || "");
    }
    paintIndicadores();
  } catch (e) { errorState("indicadores", e.message); }
}

function progressoMeta(i) {
  if (i.valor == null || i.meta == null || i.status === "sem_dado") return "";
  const valor = Number(i.valor), meta = Number(i.meta);
  if (!isFinite(valor) || !isFinite(meta) || meta === 0) return "";
  let pct;
  if (i.dir === "lower") pct = valor === 0 ? 100 : (meta / valor) * 100;
  else pct = (valor / meta) * 100;
  if (!isFinite(pct)) return "";
  pct = Math.max(4, Math.min(100, pct));
  const c = FAROL_COR[i.status] || FAROL_COR.sem_dado;
  return `<div class="meta-bar" title="${Math.round(pct)}% da meta"><div class="meta-bar__fill" style="width:${pct.toFixed(0)}%;background:${c}"></div></div>`;
}

function paintIndicadores() {
  const items = indState.items || [];
  const empresas = [...new Set(items.map(i => i.empresa).filter(Boolean))];
  const areas = [...new Set(items.map(i => i.area).filter(Boolean))];
  let list = items;
  if (empresas.length && indState.empresa) list = list.filter(i => i.empresa === indState.empresa);
  if (indState.area !== "TODOS") list = list.filter(i => i.area === indState.area);
  const segment = empresas.length > 1
    ? `<div class="segment">${empresas.map(e => `<button data-emp="${esc(e)}" class="${indState.empresa === e ? "active" : ""}">${esc(e)}</button>`).join("")}</div>`
    : "";
  const chips = areas.length
    ? `<div class="chips">${["TODOS", ...areas].map(a => `<button class="chip ${indState.area === a ? "active" : ""}" data-area="${esc(a)}">${a === "TODOS" ? "Todos" : esc(a)}</button>`).join("")}</div>`
    : "";
  const periodoInfo = indState._supPeriodo
    ? `<span style="font-size:12px;color:var(--on-variant);margin-left:8px">⚡ Últimos 7 dias: ${fmtDataCurta(indState._supPeriodo.inicio)} → ${fmtDataCurta(indState._supPeriodo.fim)}</span>`
    : "";
  const cards = list.map(i => {
    const badgeClass = ["OP", "JORNADA", "MC"].includes(i.area) ? `badge--${i.area}` : "badge--default";
    const fonteIcon = i._fonte === "supabase"
      ? `<span title="Valor via Supabase" style="font-size:11px;color:var(--on-variant);opacity:.7">⚡</span>`
      : "";
    return `<a class="card" href="#/indicadores/${encodeURIComponent(i.id)}">
      <div class="ind-card__top">
        ${i.area ? `<span class="badge ${badgeClass}">${esc(i.area)}</span>` : "<span></span>"}
        ${farolLosango(i.status)}
      </div>
      <div class="ind-card__name">${esc(i.nome || "—")} ${fonteIcon}</div>
      <div class="ind-card__value">${fmt(i.valor, i.unidade)}</div>
      ${progressoMeta(i)}
      <div class="ind-card__foot"><span>Meta: ${i.meta == null ? "—" : fmt(i.meta, i.unidade)}</span></div>
    </a>`;
  }).join("");
  view().innerHTML = `<div>
    <div class="page-head">
      <div><h1>Indicadores</h1><p class="sub">Valores operacionais via Supabase · metas via Google Sheets. Clique num card para ver o detalhe.</p></div>
      <div class="head-actions">${segment}${periodoInfo}<button class="btn-refresh" id="refresh"><span class="ms">refresh</span></button></div>
    </div>
    ${chips}
    ${list.length ? `<div class="grid">${cards}</div>` : `<div class="empty">Nenhum indicador para este filtro.<br /><small>Recebi ${items.length} linha(s). Colunas: ${esc(indState.header) || "(vazio)"}</small></div>`}
  </div>`;
  view().querySelectorAll("[data-emp]").forEach(b => b.onclick = () => { indState.empresa = b.dataset.emp; paintIndicadores(); });
  view().querySelectorAll("[data-area]").forEach(b => b.onclick = () => { indState.area = b.dataset.area; paintIndicadores(); buildNav(); });
  bindRefresh(() => showIndicadores(true));
}

function mapIndicadorFull(o) {
  const nome = pick(o, ["nome_exibicao", "nome", "indicador", "titulo"]);
  const unidade = pick(o, ["unidade", "unit"]);
  const meta = num(pick(o, ["meta_atual", "meta", "target", "objetivo"]));
  const valor = num(pick(o, ["valor_atual", "valor", "realizado", "atual", "current", "resultado"]));
  const dir = inferDir(nome, unidade, pick(o, ["direcao", "direction", "sentido"]));
  const farol = normStatus(pick(o, ["status_farol", "farol"])) || computeStatus(valor, meta, dir);
  return {
    id: pick(o, ["id_indicador", "id"]) || nome,
    nome, unidade, meta, valor, dir, farol,
    empresa: pick(o, ["empresa", "company"]) || "",
    area: pick(o, ["area_responsavel", "area"]) || "",
    owner: pick(o, ["owner_nome", "owner", "responsavel"]) || "",
    ownerEmail: pick(o, ["owner_email", "email"]) || "",
    descricao: pick(o, ["descricao_negocio", "descricao", "description"]) || "",
    memorial: pick(o, ["memorial_calculo", "memorial"]) || "",
    formula: pick(o, ["formula_tecnica", "formula"]) || "",
    granularidade: pick(o, ["granularidade", "granularity"]) || "",
    metaVigencia: pick(o, ["meta_vigencia_inicio", "meta_vigencia", "vigencia"]) || "",
    fonte: pick(o, ["fonte_sistema", "fonte", "source"]) || "",
    fonteUrl: pick(o, ["fonte_url", "url_fonte"]) || "",
    dashboardUrl: pick(o, ["dashboard_url", "dashboard", "bi_url"]) || "",
    tipoAtual: pick(o, ["tipo_atualizacao", "tipo"]) || "",
    frequencia: pick(o, ["frequencia_atualizacao", "frequencia"]) || "",
    sla: pick(o, ["sla_atualizacao", "sla"]) || "",
    statusInd: pick(o, ["status"]) || "",
    ultValData: pick(o, ["ultima_validacao_data", "ultima_validacao"]) || "",
    ultValPor: pick(o, ["ultima_validacao_por"]) || "",
    obs: pick(o, ["observacoes", "obs"]) || "",
    restricoes: splitList(pick(o, ["restricoes_filtro", "restricoes", "filtros_aplicados", "filtros"])),
  };
}

function mapVersaoHistorica(o, vigFim) {
  return {
    meta: num(pick(o, ["meta_atual", "meta", "target", "objetivo"])),
    metaVigencia: pick(o, ["meta_vigencia_inicio", "meta_vigencia", "vigencia"]) || "",
    vigFim: vigFim || "",
    ultValData: pick(o, ["ultima_validacao_data", "ultima_validacao"]) || "",
    ultValPor: pick(o, ["ultima_validacao_por"]) || "",
    obs: pick(o, ["observacoes", "obs"]) || "",
  };
}

function mapMeta(o) {
  return {
    valor: num(pick(o, ["meta_valor", "valor", "meta"])),
    inicio: pick(o, ["vigencia_inicio", "inicio", "de"]) || "",
    fim: pick(o, ["vigencia_fim", "fim", "ate"]) || "",
    por: pick(o, ["definida_por", "autor", "responsavel"]) || "",
    motivo: pick(o, ["motivo_mudanca", "motivo", "razao"]) || "",
  };
}
function kv(label, value, mono) {
  if (value == null || value === "") return "";
  return `<div class="kv"><span class="kv__k">${esc(label)}</span><span class="kv__v${mono ? " mono" : ""}">${esc(value)}</span></div>`;
}
function linkRow(label, url) {
  if (!url) return "";
  const safe = /^https?:\/\//i.test(url) ? url : "";
  return `<div class="kv"><span class="kv__k">${esc(label)}</span>${safe ? `<a class="kv__v link" href="${esc(safe)}" target="_blank" rel="noopener">${esc(url)} <span class="ms" style="font-size:14px">open_in_new</span></a>` : `<span class="kv__v">${esc(url)}</span>`}</div>`;
}

async function renderIndicadorDetalhe(id) {
  loading();
  try {
    const rows = await fetchCsv("indicadores");
    const raw = toObjects(rows);
    const { ativos, historicoPorId } = deduplicarIndicadores(raw);
    const o = ativos.find(r => (pick(r, ["id_indicador", "id"]) || pick(r, ["nome_exibicao", "nome"])) === id);
    if (!o) {
      view().innerHTML = `<a class="btn-refresh" href="#/indicadores"><span class="ms">arrow_back</span> Indicadores</a><div class="empty" style="margin-top:16px">Indicador <b>${esc(id)}</b> não encontrado.</div>`;
      return;
    }
    const d = mapIndicadorFull(o);
    const supData = await fetchIndicadoresOperacionais();
    if (supData) {
      const mapa = SUPABASE_MAP[id];
      if (mapa && supData.grupos?.[mapa.grupo]?.[mapa.campo] != null) {
        const v = supData.grupos[mapa.grupo][mapa.campo];
        d.valor = typeof v === "string" ? v : Number(v);
        d._fonte = "supabase";
        d._periodo = supData.periodo;
      }
    }
    d.farol = computeStatus(d.valor, d.meta, d.dir);
    const versoesHistoricas = (historicoPorId[id] || []).map(v =>
      mapVersaoHistorica(v, v._vigencia_fim_calculada)
    );
    view().innerHTML = detailHtml(d, versoesHistoricas);
    bindRefresh(() => refreshTab("indicadores", () => renderIndicadorDetalhe(id)));
  } catch (e) { errorState("indicador", e.message); }
}

function detailHtml(d, versoesHistoricas) {
  const badgeClass = ["OP", "JORNADA", "MC"].includes(d.area) ? `badge--${d.area}` : "badge--default";
  const lifecycle = d.statusInd ? `<span class="badge badge--default">${esc(d.statusInd)}</span>` : "";

  const vigente = {
    meta: d.meta,
    metaVigencia: d.metaVigencia,
    vigFim: "",
    ultValData: d.ultValData,
    ultValPor: d.ultValPor,
    obs: "",
  };

  const todasVersoes = [vigente, ...versoesHistoricas];

  const timelineHtml = todasVersoes.length
    ? `<div class="timeline">${todasVersoes.map((v, idx) => {
        const isVigente = idx === 0;
        const periodo = v.metaVigencia
          ? `${esc(v.metaVigencia)} → ${v.vigFim ? esc(v.vigFim) : "atual"}`
          : (v.vigFim ? `até ${esc(v.vigFim)}` : "—");
        const atualizadoPor = [v.ultValData, v.ultValPor].filter(Boolean).join(" · ");
        return `<div class="tl-item${isVigente ? " tl-item--current" : ""}">
          <div class="tl-dot"></div>
          <div class="tl-body">
            <div class="tl-top">
              <span class="tl-valor">${v.meta == null ? "—" : fmt(v.meta, d.unidade)}</span>
              ${isVigente ? `<span class="pill pill--on_track">Vigente</span>` : ""}
            </div>
            <div class="tl-period">${periodo}</div>
            ${atualizadoPor ? `<div class="tl-meta"><span class="ms" style="font-size:13px;vertical-align:-2px">update</span> ${esc(atualizadoPor)}</div>` : ""}
            ${v.obs ? `<div class="tl-meta" style="margin-top:2px">${esc(v.obs)}</div>` : ""}
          </div>
        </div>`;
      }).join("")}</div>`
    : `<div class="empty">Sem histórico de metas.</div>`;

  const sobreCard = d.descricao
    ? `<div class="card detail-sobre"><h2><span class="ms">info</span> Sobre</h2><p>${esc(d.descricao)}</p></div>`
    : "";

  const fonteTag = d._fonte === "supabase" && d._periodo
    ? `<span style="font-size:12px;color:var(--on-variant);background:var(--surface-high);padding:2px 8px;border-radius:9999px">⚡ Últimos 7 dias · ${fmtDataCurta(d._periodo.inicio)} → ${fmtDataCurta(d._periodo.fim)}</span>`
    : "";

  return `<div>
    <a class="btn-refresh" href="#/indicadores"><span class="ms">arrow_back</span> Indicadores</a>
    <div class="page-head" style="margin-top:16px">
      <div><h1>${esc(d.nome || "—")}</h1><div class="detail-badges">${d.empresa ? `<span class="badge badge--default">${esc(d.empresa)}</span>` : ""}${d.area ? `<span class="badge ${badgeClass}">${esc(d.area)}</span>` : ""}${lifecycle}<span class="mono">${esc(d.id)}</span>${fonteTag}</div></div>
      <div class="head-actions"><button class="btn-refresh" id="refresh"><span class="ms">refresh</span></button></div>
    </div>
    <div class="detail-hero-row">
      <div class="card detail-hero"><div><div class="kv__k">Valor atual</div><div class="ind-card__value">${fmt(d.valor, d.unidade)}</div><span class="pill pill--${d.farol}">${STATUS_LABEL[d.farol]}</span></div><div class="detail-hero__meta"><div class="kv__k">Meta atual</div><div class="detail-meta-val">${d.meta == null ? "—" : fmt(d.meta, d.unidade)}</div>${d.metaVigencia ? `<div class="kv__k">desde ${esc(d.metaVigencia)}</div>` : ""}</div></div>
      ${sobreCard}
    </div>
    <div class="detail-grid">
      ${(d.memorial || d.formula) ? `<div class="card detail-sec"><h2><span class="ms">calculate</span> Como se calcula</h2>${d.memorial ? `<p>${esc(d.memorial)}</p>` : ""}${d.formula ? `<pre class="formula">${esc(d.formula)}</pre>` : ""}</div>` : ""}
      <div class="card detail-sec"><h2><span class="ms">database</span> De onde vem</h2>${kv("Fonte / sistema", d.fonte, true)}${linkRow("URL da fonte", d.fonteUrl)}${linkRow("Dashboard", d.dashboardUrl)}</div>
      ${d.restricoes && d.restricoes.length ? `<div class="card detail-sec"><h2><span class="ms">filter_alt</span> Filtros aplicados</h2><ul class="restricoes">${d.restricoes.map(r => `<li><span class="ms">block</span> ${esc(r)}</li>`).join("")}</ul></div>` : ""}
      <div class="card detail-sec"><h2><span class="ms">person</span> Responsável</h2>${kv("Owner", d.owner)}${kv("E-mail", d.ownerEmail)}</div>
      <div class="card detail-sec"><h2><span class="ms">update</span> Atualização</h2>${kv("Tipo", d.tipoAtual)}${kv("Frequência", d.frequencia)}${kv("Granularidade", d.granularidade)}${kv("SLA", d.sla)}${kv("Unidade", d.unidade)}</div>
      ${d.obs ? `<div class="card detail-sec"><h2><span class="ms">sticky_note_2</span> Observações</h2><p>${esc(d.obs)}</p></div>` : ""}
    </div>
    <div class="detail-sec" style="margin-top:8px"><h2 class="detail-h2-standalone"><span class="ms">flag</span> Histórico de metas</h2>${timelineHtml}</div>
    <div class="card detail-sec placeholder" style="margin-top:16px"><h2><span class="ms">show_chart</span> Histórico de valor</h2><p class="muted-row">A série de valores chega na fase Supabase/n8n.</p></div>
  </div>`;
}

const PROJ_CATEGORIAS = ["Automação","BI & Analytics","Atendimento","Jornada do Cliente","Infra & Dados","Produto","Processos","Inteligência Artificial"];
const PROJ_FERRAMENTAS = ["n8n","Python","Excel","Google Sheets","Metabase","Supabase","Zendesk","Claude / IA","Power BI","Zapier","Apps Script","Figma","Notion","Obsidian","WhatsApp API","API REST"];
const PROJ_STATUS_CFG = {
  in_progress: { label: "Em andamento", pill: "pill--at_risk",  icon: "play_circle" },
  planned:     { label: "Planejado",     pill: "pill--sem_dado", icon: "schedule" },
  blocked:     { label: "Bloqueado",     pill: "pill--off_track",icon: "block" },
  done:        { label: "Concluído",     pill: "pill--on_track", icon: "check_circle" },
};

const CLAUDE_PROMPT_TEMPLATE = `Você é um assistente especialista em CX e Gestão de Projetos. Responda EXCLUSIVAMENTE neste formato JSON:\n\n{\n  "resumo": "Texto com no máximo 400 palavras",\n  "categoria": "[UMA das opções: Automação | BI & Analytics | Atendimento | Jornada do Cliente | Infra & Dados | Produto | Processos | Inteligência Artificial]",\n  "ferramentas": ["lista", "de", "ferramentas"],\n  "status_sugerido": "[in_progress | planned | blocked | done]"\n}\n\n---\nInformações do projeto:\n\n[COLE AS INFORMAÇÕES BRUTAS DO PROJETO AQUI]`;

let projState = { items: null, ts: 0, filtStatus: "TODOS", filtCategoria: "TODOS", filtFerramenta: "TODOS", filtEmpresa: "TODOS", search: "" };

function normProjStatus(s) {
  const x = normKey(s || "");
  if (["in_progress","em_andamento","andamento","doing"].includes(x)) return "in_progress";
  if (["done","concluido","feito","finalizado"].includes(x)) return "done";
  if (["blocked","bloqueado","impedido"].includes(x)) return "blocked";
  return "planned";
}

function mapProjetoApi(o) {
  return { id: o.id || "", titulo: o.titulo || "—", descricao: o.descricao || "", responsavel: o.responsavel || "", url: o.url || "", status: normProjStatus(o.status), empresa: o.empresa || "GC", categoria: o.categoria || "", ferramentas: splitList(o.ferramentas || ""), resumo_ia: o.resumo_ia || "", tem_imagem: Boolean(o.tem_imagem), criado_em: o.criado_em || "" };
}

async function fetchProjetos(force = false) {
  if (!force && projState.items && Date.now() - projState.ts < 30000) return projState.items;
  const res = await fetch("/api/projetos", { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  projState.items = (data.projetos || []).map(mapProjetoApi);
  projState.ts = Date.now();
  return projState.items;
}

async function renderProjetos(force) {
  loading();
  try { const items = await fetchProjetos(force === true); paintProjetos(items); }
  catch (e) { errorState("projetos", e.message); }
}

function paintProjetos(items) {
  const todasEmpresas = [...new Set(items.map(p => p.empresa).filter(Boolean))];
  const todosStatus = Object.keys(PROJ_STATUS_CFG).filter(s => items.some(p => p.status === s));
  const todasCats = [...new Set(items.map(p => p.categoria).filter(Boolean))].sort();
  const todasFerr = [...new Set(items.flatMap(p => p.ferramentas))].sort();
  let list = items;
  if (projState.filtEmpresa !== "TODOS") list = list.filter(p => p.empresa === projState.filtEmpresa);
  if (projState.filtStatus !== "TODOS") list = list.filter(p => p.status === projState.filtStatus);
  if (projState.filtCategoria !== "TODOS") list = list.filter(p => p.categoria === projState.filtCategoria);
  if (projState.filtFerramenta !== "TODOS") list = list.filter(p => p.ferramentas.includes(projState.filtFerramenta));
  if (projState.search.trim()) { const q = normTxt(projState.search); list = list.filter(p => normTxt(p.titulo + " " + p.descricao + " " + p.responsavel + " " + p.categoria).includes(q)); }
  const segmentHtml = todasEmpresas.length > 1 ? `<div class="segment">${todasEmpresas.map(e => `<button data-proj-emp="${esc(e)}" class="${projState.filtEmpresa === e ? "active" : ""}">${esc(e)}</button>`).join("")}</div>` : "";
  const counters = `<div class="proj-counters">${Object.entries(PROJ_STATUS_CFG).map(([st, cfg]) => { const n = items.filter(p => p.status === st).length; return `<div class="proj-counter"><span class="pill ${cfg.pill}"><span class="ms" style="font-size:13px">${cfg.icon}</span> ${cfg.label}</span><span class="proj-counter__n">${n}</span></div>`; }).join("")}</div>`;
  const statusChips = `<div class="chips proj-chips">${["TODOS", ...todosStatus].map(s => { const cfg = PROJ_STATUS_CFG[s]; return `<button class="chip ${projState.filtStatus === s ? "active" : ""}" data-proj-status="${esc(s)}">${cfg ? `<span class="ms" style="font-size:15px">${cfg.icon}</span> ${cfg.label}` : "Todos"}</button>`; }).join("")}</div>`;
  const catChips = todasCats.length ? `<div class="chips proj-chips"><button class="chip chip--sec ${projState.filtCategoria === "TODOS" ? "active" : ""}" data-proj-cat="TODOS">Todas</button>${todasCats.map(c => `<button class="chip chip--sec ${projState.filtCategoria === c ? "active" : ""}" data-proj-cat="${esc(c)}">${esc(c)}</button>`).join("")}</div>` : "";
  const ferrChips = todasFerr.length ? `<div class="chips proj-chips"><button class="chip chip--tool ${projState.filtFerramenta === "TODOS" ? "active" : ""}" data-proj-ferr="TODOS">Todas</button>${todasFerr.map(f => `<button class="chip chip--tool ${projState.filtFerramenta === f ? "active" : ""}" data-proj-ferr="${esc(f)}">${esc(f)}</button>`).join("")}</div>` : "";
  const cards = list.map(p => projCardHtml(p)).join("");
  view().innerHTML = `<div>
    <div class="page-head">
      <div><h1>Projetos</h1><p class="sub">Catálogo de iniciativas do time CX.</p></div>
      <div class="head-actions">${segmentHtml}<button class="btn-refresh" id="refresh"><span class="ms">refresh</span></button><button class="btn-cta" id="add-proj"><span class="ms">add</span> Novo projeto</button></div>
    </div>
    ${counters}
    <div class="proj-filter-bar"><div class="search-box"><span class="ms">search</span><input id="proj-search" type="search" placeholder="Buscar projetos…" value="${esc(projState.search)}" /></div></div>
    <div class="proj-filter-group"><div class="proj-filter-label"><span class="ms">flag</span> Status</div>${statusChips}</div>
    ${todasCats.length ? `<div class="proj-filter-group"><div class="proj-filter-label"><span class="ms">category</span> Categoria</div>${catChips}</div>` : ""}
    ${todasFerr.length ? `<div class="proj-filter-group"><div class="proj-filter-label"><span class="ms">build</span> Ferramentas</div>${ferrChips}</div>` : ""}
    ${list.length ? `<div class="proj-grid" id="proj-grid">${cards}</div>` : `<div class="empty">Nenhum projeto encontrado.<br /><small>${items.length === 0 ? 'Clique em "Novo projeto" para começar.' : `${items.length} projeto(s) no total.`}</small></div>`}
  </div>`;
  bindRefresh(() => renderProjetos(true));
  document.getElementById("add-proj").onclick = () => openProjModal(null);
  const si = document.getElementById("proj-search"); si.oninput = () => { projState.search = si.value; paintProjetos(projState.items || []); };
  view().querySelectorAll("[data-proj-status]").forEach(b => b.onclick = () => { projState.filtStatus = b.dataset.projStatus; paintProjetos(projState.items || []); });
  view().querySelectorAll("[data-proj-cat]").forEach(b => b.onclick = () => { projState.filtCategoria = b.dataset.projCat; paintProjetos(projState.items || []); });
  view().querySelectorAll("[data-proj-ferr]").forEach(b => b.onclick = () => { projState.filtFerramenta = b.dataset.projFerr; paintProjetos(projState.items || []); });
  view().querySelectorAll("[data-proj-emp]").forEach(b => b.onclick = () => { projState.filtEmpresa = b.dataset.projEmp; paintProjetos(projState.items || []); });
  view().querySelectorAll("[data-proj-id]").forEach(card => card.onclick = (e) => { if (e.target.closest("button")) return; const p = (projState.items || []).find(x => x.id === card.dataset.projId); if (p) openProjDetalhe(p); });
  view().querySelectorAll("[data-edit-proj]").forEach(btn => btn.onclick = (e) => { e.stopPropagation(); const p = (projState.items || []).find(x => x.id === btn.dataset.editProj); if (p) openProjModal(p); });
}

function catIcon(cat) {
  const map = { "Automação":"bolt","BI & Analytics":"bar_chart","Atendimento":"headset_mic","Jornada do Cliente":"route","Infra & Dados":"database","Produto":"widgets","Processos":"account_tree","Inteligência Artificial":"auto_awesome" };
  return map[cat] || "lightbulb";
}

function projCardHtml(p) {
  const cfg = PROJ_STATUS_CFG[p.status] || PROJ_STATUS_CFG.planned;
  const imgSrc = p.tem_imagem ? `/api/projetos/${encodeURIComponent(p.id)}/image` : null;
  const ferrBadges = p.ferramentas.slice(0, 4).map(f => `<span class="tag tag--tool">${esc(f)}</span>`).join("") + (p.ferramentas.length > 4 ? `<span class="tag tag--more">+${p.ferramentas.length - 4}</span>` : "");
  return `<div class="proj-card-new" data-proj-id="${esc(p.id)}">
    ${imgSrc ? `<div class="proj-card__img"><img src="${imgSrc}" alt="${esc(p.titulo)}" loading="lazy" /></div>` : `<div class="proj-card__img proj-card__img--empty"><span class="ms proj-card__cat-icon">${catIcon(p.categoria)}</span></div>`}
    <div class="proj-card__body">
      <div class="proj-card__top-row"><span class="pill ${cfg.pill}"><span class="ms" style="font-size:13px">${cfg.icon}</span> ${cfg.label}</span><button class="icon-btn" data-edit-proj="${esc(p.id)}" title="Editar"><span class="ms">edit</span></button></div>
      <div class="proj-card__title">${esc(p.titulo)}</div>
      ${p.categoria ? `<div class="proj-card__categoria"><span class="ms">category</span>${esc(p.categoria)}</div>` : ""}
      ${p.descricao ? `<div class="proj-card__desc">${esc(p.descricao.slice(0,120))}${p.descricao.length > 120 ? "…" : ""}</div>` : ""}
      ${ferrBadges ? `<div class="tags">${ferrBadges}</div>` : ""}
      <div class="proj-card__foot">${p.responsavel ? `<span><span class="ms">person</span> ${esc(p.responsavel)}</span>` : ""}${p.empresa ? `<span class="badge badge--default">${esc(p.empresa)}</span>` : ""}</div>
    </div>
  </div>`;
}

function openProjDetalhe(p) {
  const cfg = PROJ_STATUS_CFG[p.status] || PROJ_STATUS_CFG.planned;
  const imgSrc = p.tem_imagem ? `/api/projetos/${encodeURIComponent(p.id)}/image` : null;
  const wrap = document.createElement("div"); wrap.className = "modal";
  const ferrsHtml = p.ferramentas.map(f => `<span class="tag tag--tool">${esc(f)}</span>`).join("");
  const resumoHtml = p.resumo_ia ? `<div class="proj-detail__resumo">${esc(p.resumo_ia).replace(/\n/g,"<br/>")}</div>` : `<div class="muted-row">Sem resumo. Edite o projeto e use o assistente Claude.</div>`;
  wrap.innerHTML = `<div class="modal__box modal__box--wide">
    ${imgSrc ? `<div class="proj-detail__img"><img src="${imgSrc}" alt="${esc(p.titulo)}" /></div>` : ""}
    <div class="proj-detail__header"><div><span class="pill ${cfg.pill}"><span class="ms" style="font-size:13px">${cfg.icon}</span> ${cfg.label}</span>${p.empresa ? `<span class="badge badge--default" style="margin-left:8px">${esc(p.empresa)}</span>` : ""}</div><button class="icon-btn" id="det-close"><span class="ms">close</span></button></div>
    <h2 class="modal__title" style="margin-top:12px">${esc(p.titulo)}</h2>
    ${p.categoria ? `<div class="proj-card__categoria" style="margin-bottom:12px"><span class="ms">category</span>${esc(p.categoria)}</div>` : ""}
    ${p.responsavel ? `<div style="font-size:14px;color:var(--on-variant);margin-bottom:16px"><span class="ms" style="font-size:16px">person</span> ${esc(p.responsavel)}</div>` : ""}
    ${ferrsHtml ? `<div class="tags" style="margin-bottom:16px">${ferrsHtml}</div>` : ""}
    <div class="proj-detail__section"><div class="links-section__h"><span class="ms">auto_awesome</span> Resumo do projeto</div>${resumoHtml}</div>
    ${p.url ? `<div class="proj-detail__section"><div class="links-section__h"><span class="ms">link</span> Link</div><a href="${esc(p.url)}" target="_blank" rel="noopener" class="kv__v link">${esc(p.url)} <span class="ms" style="font-size:14px">open_in_new</span></a></div>` : ""}
    <div class="modal__actions"><button class="btn-ghost" id="det-close2">Fechar</button><button class="btn-cta" id="det-edit"><span class="ms">edit</span> Editar</button></div>
  </div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.onclick = (e) => { if (e.target === wrap) close(); };
  document.getElementById("det-close").onclick = close;
  document.getElementById("det-close2").onclick = close;
  document.getElementById("det-edit").onclick = () => { close(); openProjModal(p); };
}

function openProjModal(proj) {
  const isEdit = !!proj;
  let wizardStep = 1;
  let wData = { titulo: proj?.titulo || "", descricao: proj?.descricao || "", responsavel: proj?.responsavel || "", url: proj?.url || "", status: proj?.status || "planned", empresa: proj?.empresa || "GC", categoria: proj?.categoria || "", ferramentas: proj?.ferramentas || [], resumo_ia: proj?.resumo_ia || "", image_mime: null, image_data: null };
  const wrap = document.createElement("div"); wrap.className = "modal";
  document.body.appendChild(wrap);

  function renderWizard() {
    wrap.innerHTML = `<div class="modal__box modal__box--wide">
      <div class="wizard-header">
        <h2 class="modal__title">${isEdit ? "Editar projeto" : "Novo projeto"}</h2>
        <div class="wizard-steps">
          <div class="wizard-step ${wizardStep >= 1 ? "active" : ""} ${wizardStep > 1 ? "done" : ""}"><span>${wizardStep > 1 ? "✓" : "1"}</span> Dados</div>
          <div class="wizard-step-line"></div>
          <div class="wizard-step ${wizardStep >= 2 ? "active" : ""} ${wizardStep > 2 ? "done" : ""}"><span>${wizardStep > 2 ? "✓" : "2"}</span> Claude</div>
          <div class="wizard-step-line"></div>
          <div class="wizard-step ${wizardStep >= 3 ? "active" : ""}"><span>3</span> Imagem</div>
        </div>
      </div>
      <div class="modal__err" id="w-err" hidden></div>
      ${wizardStep === 1 ? renderStep1() : ""}${wizardStep === 2 ? renderStep2() : ""}${wizardStep === 3 ? renderStep3() : ""}
      <div class="modal__actions">
        ${wizardStep > 1 ? `<button class="btn-ghost" id="w-back"><span class="ms">arrow_back</span> Voltar</button>` : ""}
        <button class="btn-ghost" id="w-cancel">Cancelar</button>
        ${wizardStep < 3 ? `<button class="btn-cta" id="w-next"><span class="ms">arrow_forward</span> Próximo</button>` : `<button class="btn-cta" id="w-save"><span class="ms">save</span> ${isEdit ? "Salvar" : "Criar projeto"}</button>`}
      </div>
    </div>`;
    wrap.onclick = (e) => { if (e.target === wrap) wrap.remove(); };
    document.getElementById("w-cancel").onclick = () => wrap.remove();
    if (wizardStep > 1) document.getElementById("w-back").onclick = () => { collectStep(); wizardStep--; renderWizard(); };
    if (wizardStep < 3) document.getElementById("w-next").onclick = () => { if (!collectStep()) return; wizardStep++; renderWizard(); };
    else document.getElementById("w-save").onclick = saveProj;
    if (wizardStep === 2) bindStep2();
    if (wizardStep === 3) bindStep3();
  }

  function renderStep1() {
    const ferrsCheckboxes = PROJ_FERRAMENTAS.map(f => `<label class="ferr-check"><input type="checkbox" name="ferr" value="${esc(f)}" ${wData.ferramentas.includes(f) ? "checked" : ""} />${esc(f)}</label>`).join("");
    return `<div class="field"><label>Nome do projeto *</label><input id="w-titulo" type="text" maxlength="120" value="${esc(wData.titulo)}" placeholder="Ex.: Automação NPS via n8n" /></div>
      <div class="field"><label>Descrição curta</label><textarea id="w-desc" maxlength="280" rows="2">${esc(wData.descricao)}</textarea></div>
      <div class="field-row"><div class="field"><label>Responsável</label><input id="w-resp" type="text" value="${esc(wData.responsavel)}" /></div><div class="field"><label>Empresa</label><select id="w-emp"><option value="GC" ${wData.empresa==="GC"?"selected":""}>GC — Gocase</option><option value="GB" ${wData.empresa==="GB"?"selected":""}>GB — Gobeaute</option></select></div></div>
      <div class="field-row"><div class="field"><label>Status</label><select id="w-status">${Object.entries(PROJ_STATUS_CFG).map(([v,c])=>`<option value="${v}" ${wData.status===v?"selected":""}>${c.label}</option>`).join("")}</select></div><div class="field"><label>Categoria</label><select id="w-cat"><option value="">Selecionar...</option>${PROJ_CATEGORIAS.map(c=>`<option value="${esc(c)}" ${wData.categoria===c?"selected":""}>${esc(c)}</option>`).join("")}</select></div></div>
      <div class="field"><label>URL do projeto</label><input id="w-url" type="url" value="${esc(wData.url)}" /></div>
      <div class="field"><label>Ferramentas usadas</label><div class="ferr-grid">${ferrsCheckboxes}</div></div>`;
  }

  function renderStep2() {
    const ctx = [`Projeto: ${wData.titulo}`, wData.descricao ? `Descrição: ${wData.descricao}` : "", wData.responsavel ? `Responsável: ${wData.responsavel}` : ""].filter(Boolean).join("\n");
    const promptFinal = CLAUDE_PROMPT_TEMPLATE.replace("[COLE AS INFORMAÇÕES BRUTAS DO PROJETO AQUI]", ctx);
    return `<div class="claude-step">
      <div class="claude-step__header"><span class="ms" style="color:var(--primary);font-size:28px">auto_awesome</span><div><div style="font-weight:700;font-size:16px">Assistente Claude</div><div style="font-size:13px;color:var(--on-variant)">Gere um resumo rico automaticamente</div></div></div>
      <div class="claude-step__flow"><div class="claude-step__num">1</div><div class="claude-step__body"><div style="font-weight:600;font-size:14px;margin-bottom:8px">Copie o prompt e cole no Claude</div><div class="prompt-box"><pre id="prompt-text">${esc(promptFinal)}</pre><button class="btn-copy" id="btn-copy"><span class="ms">content_copy</span> Copiar prompt</button></div></div></div>
      <div class="claude-step__flow"><div class="claude-step__num">2</div><div class="claude-step__body" style="flex:1"><div style="font-weight:600;font-size:14px;margin-bottom:8px">Cole a resposta do Claude aqui</div><textarea id="w-resposta-ia" rows="6" placeholder='{ "resumo": "...", "categoria": "...", "ferramentas": [...], "status_sugerido": "..." }'>${esc(wData.resumo_ia ? JSON.stringify({resumo:wData.resumo_ia}) : "")}</textarea><button class="btn-ghost" id="btn-parse" style="margin-top:8px"><span class="ms">auto_fix_high</span> Aplicar</button></div></div>
      <div id="ia-preview" style="display:none" class="ia-preview"></div>
      <p class="claude-step__skip">Pode pular — o resumo pode ser adicionado depois.</p>
    </div>`;
  }

  function bindStep2() {
    document.getElementById("btn-copy").onclick = async () => {
      const text = document.getElementById("prompt-text").textContent;
      await navigator.clipboard.writeText(text).catch(() => {});
      const btn = document.getElementById("btn-copy");
      if (btn) { btn.innerHTML = '<span class="ms">check</span> Copiado!'; setTimeout(() => { if(btn) btn.innerHTML = '<span class="ms">content_copy</span> Copiar prompt'; }, 2000); }
    };
    document.getElementById("btn-parse").onclick = () => {
      const raw = document.getElementById("w-resposta-ia").value.trim();
      if (!raw) { showErr("Cole a resposta do Claude antes de aplicar."); return; }
      let parsed;
      try { const m = raw.match(/\{[\s\S]*\}/); if (!m) throw new Error("Não encontrei JSON."); parsed = JSON.parse(m[0]); }
      catch (e) { showErr("Não consegui interpretar o JSON: " + e.message); return; }
      if (parsed.resumo) wData.resumo_ia = parsed.resumo;
      if (parsed.categoria) wData.categoria = parsed.categoria;
      if (Array.isArray(parsed.ferramentas)) wData.ferramentas = parsed.ferramentas;
      if (parsed.status_sugerido) wData.status = normProjStatus(parsed.status_sugerido);
      const preview = document.getElementById("ia-preview");
      if (preview) { preview.style.display = "block"; preview.innerHTML = `<div class="links-section__h"><span class="ms">check_circle</span> Aplicado</div><div style="font-size:13px;padding:12px;background:var(--surface-low);border-radius:var(--r);line-height:1.6">${esc(parsed.resumo||"").replace(/\n/g,"<br/>")}</div>`; }
      hideErr();
    };
  }

  function renderStep3() {
    const hasImg = proj?.tem_imagem && !wData.image_data;
    return `<div class="img-step">
      <div class="img-step__header"><span class="ms" style="color:var(--primary);font-size:28px">image</span><div><div style="font-weight:700;font-size:16px">Imagem do projeto</div><div style="font-size:13px;color:var(--on-variant)">PNG, JPG ou WebP — máx. 2 MB.</div></div></div>
      <div class="img-dropzone" id="img-dropzone">
        ${hasImg ? `<img id="img-preview" src="/api/projetos/${encodeURIComponent(proj.id)}/image" class="img-preview-thumb" alt="Imagem atual" />` : wData.image_data ? `<img id="img-preview" src="data:${wData.image_mime};base64,${wData.image_data}" class="img-preview-thumb" alt="Preview" />` : `<span class="ms" style="font-size:48px;color:var(--outline-v)">add_photo_alternate</span>`}
        <div class="img-dropzone__hint">Arraste ou clique para escolher</div>
        <input type="file" id="img-input" accept="image/png,image/jpeg,image/webp" style="position:absolute;inset:0;opacity:0;cursor:pointer" />
      </div>
      ${wData.image_data || hasImg ? `<button class="btn-ghost" id="img-remove" style="margin-top:8px"><span class="ms">delete</span> Remover imagem</button>` : ""}
      <p class="claude-step__skip">Imagem é opcional.</p>
    </div>`;
  }

  function bindStep3() {
    const input = document.getElementById("img-input");
    const dropzone = document.getElementById("img-dropzone");
    input.onchange = () => processImageFile(input.files[0]);
    dropzone.ondragover = (e) => { e.preventDefault(); dropzone.classList.add("dragover"); };
    dropzone.ondragleave = () => dropzone.classList.remove("dragover");
    dropzone.ondrop = (e) => { e.preventDefault(); dropzone.classList.remove("dragover"); processImageFile(e.dataTransfer.files[0]); };
    const rb = document.getElementById("img-remove");
    if (rb) rb.onclick = () => { wData.image_data = null; wData.image_mime = null; renderWizard(); };
  }

  function processImageFile(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showErr("Imagem muito grande. Máximo 2 MB."); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const [header, base64] = e.target.result.split(",");
      wData.image_mime = header.match(/:(.*?);/)[1];
      wData.image_data = base64;
      const ex = document.getElementById("img-preview");
      if (ex) { ex.src = e.target.result; }
      else { const dz = document.getElementById("img-dropzone"); if (dz) { const img = document.createElement("img"); img.src = e.target.result; img.className = "img-preview-thumb"; img.id = "img-preview"; dz.insertBefore(img, dz.firstChild); } }
    };
    reader.readAsDataURL(file);
  }

  function collectStep() {
    if (wizardStep === 1) {
      const titulo = document.getElementById("w-titulo")?.value.trim();
      if (!titulo) { showErr("Nome do projeto é obrigatório."); return false; }
      wData.titulo = titulo;
      wData.descricao = document.getElementById("w-desc")?.value.trim() || "";
      wData.responsavel = document.getElementById("w-resp")?.value.trim() || "";
      wData.empresa = document.getElementById("w-emp")?.value || "GC";
      wData.status = document.getElementById("w-status")?.value || "planned";
      wData.categoria = document.getElementById("w-cat")?.value || "";
      wData.url = document.getElementById("w-url")?.value.trim() || "";
      wData.ferramentas = [...wrap.querySelectorAll("input[name=ferr]:checked")].map(c => c.value);
    }
    return true;
  }

  function showErr(msg) { const b = document.getElementById("w-err"); if(b){b.textContent=msg;b.hidden=false;} }
  function hideErr() { const b = document.getElementById("w-err"); if(b) b.hidden=true; }

  async function saveProj() {
    const btn = document.getElementById("w-save");
    if (btn) btn.disabled = true;
    hideErr();
    const body = { titulo:wData.titulo, descricao:wData.descricao, responsavel:wData.responsavel, url:wData.url, status:wData.status, empresa:wData.empresa, categoria:wData.categoria, ferramentas:wData.ferramentas, resumo_ia:wData.resumo_ia };
    if (wData.image_data) { body.image_mime = wData.image_mime; body.image_data = wData.image_data; }
    try {
      const res = await fetch(isEdit ? `/api/projetos/${encodeURIComponent(proj.id)}` : "/api/projetos", { method: isEdit ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showErr(data.error || "Erro HTTP " + res.status); if(btn) btn.disabled=false; return; }
      wrap.remove(); projState.ts = 0; renderProjetos(true);
    } catch (e) { showErr(e.message); if(btn) btn.disabled=false; }
  }

  renderWizard();
}

/* ============================================================
   ORGANOGRAMA
   ============================================================ */
const ORG_HARDCODED = [
  { id:"74",    nome:"Laiza Garcia",    cargo:"Gerente CX",                          empresa:"GG", gestor:null,    coord:false        },
  { id:"73",    nome:"Ytalo Ferreira",  cargo:"Coordenador Corporativo",              empresa:"GG", gestor:"74",   coord:false        },
  { id:"5",     nome:"Giovanna Sabrina",cargo:"Coordenadora de CX",                  empresa:"GC", gestor:"73",   coord:true         },
  { id:"3",     nome:"Bruna Cunha",     cargo:"Supervisora de M. Contínua",          empresa:"GG", gestor:"73",   coord:false        },
  { id:"mari",  nome:"Maria",           cargo:"Analista de performance (custos)",     empresa:"GB", gestor:"73",   coord:false        },
  { id:"4",     nome:"Larissa Queiroz", cargo:"Coordenadora de Operações",           empresa:"GB", gestor:"73",   coord:true         },
  { id:"56",    nome:"Lucas Félix",     cargo:"Supervisor de Operações",             empresa:"GC", gestor:"73",   coord:false        },
  { id:"vaga",  nome:"VAGA (IA)",       cargo:"Analista de performance (IA e Autom.)",empresa:"GC",gestor:"5",    coord:false,vaga:true },
  { id:"marc",  nome:"Marcelo",         cargo:"Analista Pl Projetos",                empresa:"GC", gestor:"5",    coord:false        },
  { id:"mirei", nome:"Mireia Torres",   cargo:"Supervisor de Projetos",              empresa:"GC", gestor:"5",    coord:false        },
  { id:"mara",  nome:"Mariana",         cargo:"Analista Jr Clind",                   empresa:"GC", gestor:"5",    coord:false        },
  { id:"kamel", nome:"Kamel",           cargo:"Aprendiz de CX",                      empresa:"GC", gestor:"mara", coord:false        },
  { id:"bgon",  nome:"Bruna Gondim",    cargo:"Analista Pl de Melhoria",             empresa:"GG", gestor:"3",    coord:false        },
  { id:"weld",  nome:"Welder",          cargo:"Analista de Dados e MC Sênior",       empresa:"GG", gestor:"3",    coord:false        },
  { id:"ital",  nome:"Italo",           cargo:"Estagiário de Dados",                 empresa:"GG", gestor:"3",    coord:false        },
  { id:"yasmi", nome:"Yasmin",          cargo:"Estagiário de Operações",             empresa:"GB", gestor:"4",    coord:false        },
  { id:"naiar", nome:"Naiarlison",      cargo:"Supervisor Scooto",                   empresa:"GB", gestor:"4",    coord:false        },
  { id:"layla", nome:"Layane Andrade",  cargo:"Monitor de atend.",                   empresa:"GB", gestor:"naiar",coord:false        },
  { id:"ludi",  nome:"Ludiane",         cargo:"Teamleader Chat",                     empresa:"GC", gestor:"56",   coord:false        },
  { id:"gras",  nome:"Grasielle",       cargo:"Teamleader Chat",                     empresa:"GC", gestor:"56",   coord:false        },
  { id:"vane",  nome:"Vanessa",         cargo:"Teamleader Proativos",                empresa:"GC", gestor:"56",   coord:false        },
];
const EMPRESA_COR   = { GG:"#2659A5", GB:"#E0007A", GC:"#E07020" };
const EMPRESA_LABEL = { GG:"Gogroup", GB:"Gobeaute", GC:"Gocase"  };

function mapPessoa(o) {
  return { id: pick(o, ["id_pessoa", "id", "matricula"]) || pick(o, ["email", "nome"]), nome: pick(o, ["nome", "name"]) || "—", cargo: pick(o, ["cargo", "role", "funcao"]) || "", time: pick(o, ["time", "team", "equipe", "area"]) || "", gestor: pick(o, ["id_gestor", "gestor_id", "gestor", "reporta_a", "manager"]) || "", coord: ["sim", "true", "1", "yes", "x"].includes(normKey(pick(o, ["is_coordenador", "coordenador", "lider"]) || "")) };
}
function personNode(p, byManager) {
  const kids = byManager[p.id] || [];
  const coordMark = p.coord ? `<span class="ms" title="Coordenador">workspace_premium</span>` : "";
  const cor = EMPRESA_COR[p.empresa] || "#8a8d93";
  const vagaStyle = p.vaga ? " style=\"opacity:.65\"" : "";
  return `<div class="tree__node"><div class="person ${p.coord ? "person--coord" : ""}"${vagaStyle}><div class="person__avatar" style="background:${cor};color:#fff">${esc((p.nome||"?").slice(0,1).toUpperCase())}</div><div><div class="person__name">${esc(p.nome)} ${coordMark}</div><div class="person__role">${esc([p.cargo,p.time].filter(Boolean).join(" · "))}</div></div></div>${kids.length ? `<div class="tree__children">${kids.map(k=>personNode(k,byManager)).join("")}</div>` : ""}</div>`;
}
async function renderOrganograma() {
  const people = ORG_HARDCODED;
  const ids = new Set(people.map(p => p.id));
  const byManager = {};
  people.forEach(p => { const key = (p.gestor && ids.has(p.gestor)) ? p.gestor : "__root__"; (byManager[key] = byManager[key]||[]).push(p); });
  const roots = byManager["__root__"] || [];
  const empresas = [...new Set(people.map(p => p.empresa).filter(Boolean))];
  const stat = (n,l,icon) => `<div class="stat"><span class="ms">${icon}</span><div><div class="stat__n">${n}</div><div class="stat__l">${l}</div></div></div>`;
  const legendHtml = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px">${empresas.map(e=>`<span style="background:${EMPRESA_COR[e]||"#888"};color:#fff;padding:4px 14px;border-radius:9999px;font-size:12px;font-weight:700;letter-spacing:.04em">${esc(EMPRESA_LABEL[e]||e)}</span>`).join("")}</div>`;
  view().innerHTML = `${pageHead("Organograma","Hierarquia do time CX.",false)}${legendHtml}<div class="stats">${stat(people.filter(p=>!p.vaga).length,"Pessoas","groups")}${stat(empresas.length,"Empresas","domain")}${stat(people.filter(p=>p.vaga).length,"Vaga aberta","person_add")}</div>${people.length?`<div class="tree">${roots.map(r=>personNode(r,byManager)).join("")}</div>`:`<div class="empty">Nenhuma pessoa encontrada.</div>`}`;
}

/* ============================================================
   LINKS — v4 (cards visuais, filtros, ordenação)
   ============================================================ */
const LINK_CATS = { "Dashboards":{ icon:"space_dashboard",color:"#004189" },"Documentação":{ icon:"description",color:"#616200" },"API":{ icon:"api",color:"#00495f" },"Ferramentas":{ icon:"build",color:"#2659a5" },"Drive":{ icon:"cloud",color:"#00627f" },"Links":{ icon:"link",color:"#7a5600" },"E-books":{ icon:"menu_book",color:"#ba1a1a" },"Playbooks":{ icon:"integration_instructions",color:"#1b5e20" } };
const DEFAULT_CAT = { icon: "link", color: "#434751" };
function catMeta(c) {
  if (LINK_CATS[c]) return LINK_CATS[c];
  const k = normTxt(c);
  for (const [nome, m] of Object.entries(LINK_CATS)) if (normTxt(nome) === k) return m;
  return DEFAULT_CAT;
}

function linkDomain(u) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; }
}
function linkFaviconImg(url, size) {
  const dom = linkDomain(url);
  if (!dom) return "";
  return `<img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(dom)}&sz=${size || 64}" alt="" loading="lazy" onerror="this.remove()" />`;
}

let linksState = { items: null, categorias: null, ts: 0, usuario: "", recentes: [], favoritos: [] };
let linksUI = { q: "", creator: "", cat: "", sort: "az", aba: "home", q_fav: "", cat_fav: "" };

async function loadLinks(force) {
  if (!force && linksState.items && Date.now() - linksState.ts < 30000) return linksState;
  const res = await fetch("/api/links", { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  linksState.items = (data.links || []).map(l => ({ id:l.id, nome:l.nome, url:l.url, descricao:l.descricao||"", categoria:l.categoria, ativo:Number(l.ativo)===1, cliques:Number(l.cliques)||0, criadoPor:l.criado_por||"", criadoEm:l.criado_em||"", atualizadoPor:l.atualizado_por||"", atualizadoEm:l.atualizado_em||"" }));
  linksState.categorias = data.categorias || Object.keys(LINK_CATS);
  linksState.usuario = data.usuario || "";
  linksState.recentes = data.recentes || [];
  linksState.favoritos = data.favoritos || [];
  linksState.ts = Date.now();
  return linksState;
}
function forceLinks() { linksState.ts = 0; }

function updateFavBadge() {
  const tab = document.querySelector('[data-tab="favoritos"]');
  if (!tab) return;
  const n = (linksState.favoritos || []).length;
  tab.innerHTML = `<span class="ms">star</span> Favoritos${n ? ` <span class="links-tab__badge">${n}</span>` : ""}`;
}

async function toggleFavorito(linkId, estaFavorito) {
  try {
    await fetch("/api/links/" + linkId + "/favorito", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ favorito: !estaFavorito })
    });
    if (estaFavorito) {
      linksState.favoritos = linksState.favoritos.filter(id => id !== linkId);
    } else {
      linksState.favoritos = [linkId, ...linksState.favoritos];
    }
    // Repinta o contexto certo (bug fix: antes sempre repintava a Home)
    const { section, id } = parseHash();
    if (section === "links" && id) {
      paintLinksCategoria(linksState, id);
    } else {
      updateFavBadge();
      if (linksUI.aba === "favoritos") repaintFavBody(linksState);
      else repaintHomeBody(linksState);
    }
  } catch(e) {
    console.error("Erro ao alternar favorito:", e);
  }
}

async function renderLinks(force) {
  loading();
  try { const s = await loadLinks(force===true); paintLinksHome(s); }
  catch (e) { errorState("links", e.message + " — backend de Links pode não estar no ar."); }
}

function linkCardHtml(l, opts) {
  opts = opts || {};
  const m = catMeta(l.categoria);
  const dom = linkDomain(l.url);
  const trace = l.criadoPor ? "criado por " + esc(l.criadoPor.split("@")[0]) : "";
  const isFav = (linksState.favoritos || []).includes(l.id);
  const favIcon = isFav ? "star" : "star_border";
  const favTitle = isFav ? "Remover dos favoritos" : "Adicionar aos favoritos";
  const favClass = isFav ? "icon-btn fav-btn fav-btn--active" : "icon-btn fav-btn";
  return `<div class="link-card ${l.ativo?"":"link-card--inativo"}" style="border-top-color:${m.color}">
    <div class="link-card__head"><div class="link-card__icon" style="background:${m.color}14;color:${m.color}">${linkFaviconImg(l.url)}<span class="ms">${m.icon}</span></div><div class="link-card__head-txt"><div class="link-card__name">${esc(l.nome)}</div>${dom?`<div class="link-card__domain"><span class="ms">public</span>${esc(dom)}</div>`:""}${l.descricao?`<div class="link-card__desc">${esc(l.descricao)}</div>`:""}</div></div>
    <div class="link-card__meta">${opts.showCat?`<span class="tag" style="background:${m.color}14;color:${m.color}">${esc(l.categoria)}</span>`:""}${l.ativo?"":`<span class="pill pill--inativo">Inativo</span>`}<span title="Total de acessos"><span class="ms">touch_app</span> ${l.cliques}</span>${trace?`<span><span class="ms">person</span> ${trace}</span>`:""}</div>
    <div class="link-card__foot"><button class="btn-primary link-card__open" data-open="${l.id}" data-url="${esc(l.url)}"><span class="ms">open_in_new</span> Abrir</button><button class="${favClass}" data-fav="${l.id}" data-is-fav="${isFav?'1':'0'}" title="${favTitle}"><span class="ms">${favIcon}</span></button><button class="icon-btn" data-edit="${l.id}" title="Editar"><span class="ms">edit</span></button></div>
  </div>`;
}

function recentCardHtml(l) {
  const m = catMeta(l.categoria);
  return `<div class="recent-card" data-open="${l.id}" data-url="${esc(l.url)}"><div class="recent-card__icon" style="background:${m.color}14;color:${m.color}">${linkFaviconImg(l.url)}<span class="ms">${m.icon}</span></div><div class="recent-card__txt"><div class="recent-card__name">${esc(l.nome)}</div><div class="recent-card__cat">${esc(l.categoria)}</div></div><span class="ms recent-card__go">open_in_new</span></div>`;
}

function sortLinks(list) {
  const s = [...list];
  if (linksUI.sort === "cliques") s.sort((a,b)=>b.cliques-a.cliques);
  else if (linksUI.sort === "recentes") s.sort((a,b)=>String(b.criadoEm).localeCompare(String(a.criadoEm)));
  else s.sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR",{sensitivity:"base"}));
  return s;
}

function bindLinkCardEvents(container, s) {
  container.querySelectorAll("[data-open]").forEach(b => b.onclick = () => {
    fetch("/api/links/"+b.dataset.open+"/click",{method:"POST"}).then(()=>forceLinks()).catch(()=>{});
    window.open(b.dataset.url,"_blank","noopener");
  });
  container.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => {
    const l=(s.items||[]).find(x=>String(x.id)===b.dataset.edit); if(l) openLinkModal(l,l.categoria);
  });
  container.querySelectorAll("[data-fav]").forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    const linkId = Number(b.dataset.fav);
    const estaFavorito = b.dataset.isFav === "1";
    toggleFavorito(linkId, estaFavorito);
  });
}

function paintLinksHome(s) {
  const items = s.items||[];
  const creators=[...new Set(items.map(i=>i.criadoPor).filter(Boolean))].sort();
  const cats = (s.categorias || []);

  view().innerHTML=`<div>
    <div class="page-head"><div><h1>Links</h1><p class="sub">Acessos rápidos do time.</p></div><div class="head-actions"><button class="btn-refresh" id="refresh"><span class="ms">refresh</span></button><button class="btn-cta" id="add-link"><span class="ms">add</span> Adicionar link</button></div></div>

    <div class="links-tabs">
      <button class="links-tab ${linksUI.aba==='home'?'links-tab--active':''}" data-tab="home"><span class="ms">home</span> Início</button>
      <button class="links-tab ${linksUI.aba==='favoritos'?'links-tab--active':''}" data-tab="favoritos"><span class="ms">star</span> Favoritos${s.favoritos&&s.favoritos.length?` <span class="links-tab__badge">${s.favoritos.length}</span>`:''}</button>
    </div>

    <div id="lk-tab-home" style="${linksUI.aba==='home'?'':'display:none'}">
      <div class="links-toolbar"><div class="search-box"><span class="ms">search</span><input id="lk-search" type="search" placeholder="Pesquisar…" value="${esc(linksUI.q)}" /></div><select id="lk-cat" class="lk-select"><option value="">Todas as categorias</option>${cats.map(c=>`<option value="${esc(c)}" ${c===linksUI.cat?"selected":""}>${esc(c)}</option>`).join("")}</select><select id="lk-creator" class="lk-select"><option value="">Todos os criadores</option>${creators.map(c=>`<option value="${esc(c)}" ${c===linksUI.creator?"selected":""}>${esc(c)}</option>`).join("")}</select><select id="lk-sort" class="lk-select" title="Ordenação"><option value="az" ${linksUI.sort==="az"?"selected":""}>A–Z</option><option value="cliques" ${linksUI.sort==="cliques"?"selected":""}>Mais acessados</option><option value="recentes" ${linksUI.sort==="recentes"?"selected":""}>Mais recentes</option></select></div>
      <div id="lk-body"></div>
    </div>

    <div id="lk-tab-favoritos" style="${linksUI.aba==='favoritos'?'':'display:none'}">
      <div class="links-toolbar"><div class="search-box"><span class="ms">search</span><input id="lk-fav-search" type="search" placeholder="Pesquisar favoritos…" value="${esc(linksUI.q_fav)}" /></div><select id="lk-fav-cat" class="lk-select"><option value="">Todas as categorias</option>${cats.map(c=>`<option value="${esc(c)}" ${c===linksUI.cat_fav?"selected":""}>${esc(c)}</option>`).join("")}</select></div>
      <div id="lk-fav-body"></div>
    </div>
  </div>`;

  bindRefresh(()=>renderLinks(true));
  document.getElementById("add-link").onclick=()=>openLinkModal(null,null);

  view().querySelectorAll("[data-tab]").forEach(btn => btn.onclick = () => {
    linksUI.aba = btn.dataset.tab;
    view().querySelectorAll(".links-tab").forEach(t => t.classList.remove("links-tab--active"));
    btn.classList.add("links-tab--active");
    document.getElementById("lk-tab-home").style.display = linksUI.aba === "home" ? "" : "none";
    document.getElementById("lk-tab-favoritos").style.display = linksUI.aba === "favoritos" ? "" : "none";
    if (linksUI.aba === "favoritos") repaintFavBody(s);
    else repaintHomeBody(s);
  });

  const si=document.getElementById("lk-search"); if(si){si.oninput=()=>{linksUI.q=si.value;repaintHomeBody(s);};};
  const cc=document.getElementById("lk-cat"); if(cc){cc.onchange=()=>{linksUI.cat=cc.value;repaintHomeBody(s);};};
  const cs=document.getElementById("lk-creator"); if(cs){cs.onchange=()=>{linksUI.creator=cs.value;repaintHomeBody(s);};};
  const so=document.getElementById("lk-sort"); if(so){so.onchange=()=>{linksUI.sort=so.value;repaintHomeBody(s);};};

  const fs=document.getElementById("lk-fav-search"); if(fs){fs.oninput=()=>{linksUI.q_fav=fs.value;repaintFavBody(s);};};
  const fc=document.getElementById("lk-fav-cat"); if(fc){fc.onchange=()=>{linksUI.cat_fav=fc.value;repaintFavBody(s);};};

  repaintHomeBody(s);
  if (linksUI.aba === "favoritos") repaintFavBody(s);
}

function repaintHomeBody(s) {
  const items=s.items||[], q=normTxt(linksUI.q).trim(), creator=linksUI.creator, cat=linksUI.cat;
  const filtering=!!(q||creator||cat);
  const body=document.getElementById("lk-body"); if(!body) return;
  if (filtering) {
    let f=items;
    if(cat) f=f.filter(i=>i.categoria===cat);
    if(creator) f=f.filter(i=>i.criadoPor===creator);
    if(q) f=f.filter(i=>normTxt(i.nome+" "+i.descricao+" "+i.categoria+" "+linkDomain(i.url)).includes(q));
    f=sortLinks(f);
    const partes=[cat?esc(cat):"",creator?"criados por "+esc(creator):""].filter(Boolean).join(" · ");
    body.innerHTML=`<div class="links-result-head">${f.length} resultado(s)${partes?" · "+partes:""}</div>`+(f.length?`<div class="link-grid">${f.map(l=>linkCardHtml(l,{showCat:!cat})).join("")}</div>`:`<div class="empty">Nada encontrado.</div>`);
  } else {
    const ri=(s.recentes||[]).map(id=>items.find(i=>i.id===id)).filter(Boolean);
    const recentHtml=ri.length?`<div class="links-section"><div class="links-section__h"><span class="ms">history</span> Seus últimos acessos</div><div class="recent-grid">${ri.map(recentCardHtml).join("")}</div></div>`:"";
    const cats=(s.categorias||[]).map(c=>{const m=catMeta(c);const n=items.filter(i=>i.categoria===c).length;return`<a class="cat-card" href="#/links/${encodeURIComponent(c)}"><div class="cat-card__icon" style="background:${m.color}1f;color:${m.color}"><span class="ms">${m.icon}</span></div><div class="cat-card__name">${esc(c)}</div><div class="cat-card__count">${n} ${n===1?"link":"links"}</div><span class="cat-card__go">Explorar <span class="ms">arrow_forward</span></span></a>`;}).join("");
    body.innerHTML=recentHtml+`<div class="links-section"><div class="links-section__h"><span class="ms">category</span> Categorias</div><div class="cat-grid">${cats}</div></div>`;
  }
  bindLinkCardEvents(body,s);
}

function repaintFavBody(s) {
  const body=document.getElementById("lk-fav-body"); if(!body) return;
  const items=s.items||[];
  const favIds=s.favoritos||[];
  let favItems=favIds.map(id=>items.find(i=>i.id===id)).filter(Boolean);
  const q=normTxt(linksUI.q_fav).trim();
  const cat=linksUI.cat_fav;
  if(q) favItems=favItems.filter(i=>normTxt(i.nome+" "+i.descricao+" "+i.categoria+" "+linkDomain(i.url)).includes(q));
  if(cat) favItems=favItems.filter(i=>i.categoria===cat);

  if (!favIds.length) {
    body.innerHTML=`<div class="empty" style="margin-top:24px"><span class="ms" style="font-size:48px;color:var(--outline-v);display:block;margin-bottom:12px">star_border</span>Você ainda não tem favoritos.<br /><small>Clique na estrela em qualquer link para salvá-lo aqui.</small></div>`;
    return;
  }
  if (!favItems.length) {
    body.innerHTML=`<div class="links-result-head">${favIds.length} favorito(s) no total · nenhum corresponde ao filtro</div><div class="empty">Nada encontrado com esse filtro.</div>`;
    return;
  }
  body.innerHTML=`<div class="links-result-head">${favItems.length} favorito(s)${q?" · filtrando por \""+esc(linksUI.q_fav)+"\"":""}${cat?" · "+esc(cat):""}</div><div class="link-grid">${favItems.map(l=>linkCardHtml(l,{showCat:true})).join("")}</div>`;
  bindLinkCardEvents(body,s);
}

async function renderLinksCategoria(cat) {
  loading();
  try { const s=await loadLinks(); paintLinksCategoria(s,cat); }
  catch(e) { errorState("links",e.message); }
}

function paintLinksCategoria(s,cat) {
  const m=catMeta(cat), items=(s.items||[]).filter(i=>i.categoria===cat).sort((a,b)=>b.cliques-a.cliques);
  view().innerHTML=`<div>
    <a class="btn-refresh" href="#/links"><span class="ms">arrow_back</span> Categorias</a>
    <div class="page-head" style="margin-top:16px"><div style="display:flex;align-items:center;gap:14px"><div class="cat-card__icon" style="background:${m.color}1f;color:${m.color};width:48px;height:48px"><span class="ms">${m.icon}</span></div><div><h1 style="margin:0">${esc(cat)}</h1><p class="sub">${items.length} ${items.length===1?"link":"links"} nesta categoria.</p></div></div><div class="head-actions"><button class="btn-refresh" id="refresh"><span class="ms">refresh</span></button><button class="btn-cta" id="add-link"><span class="ms">add</span> Adicionar link</button></div></div>
    ${items.length?`<div class="link-grid">${items.map(l=>linkCardHtml(l)).join("")}</div>`:`<div class="empty">Nenhum link nesta categoria ainda.</div>`}
  </div>`;
  bindRefresh(()=>{forceLinks();renderLinksCategoria(cat);});
  document.getElementById("add-link").onclick=()=>openLinkModal(null,cat);
  bindLinkCardEvents(view(),s);
}

function normalizarUrl(u) {
  u = String(u || "").trim();
  if (u && !/^https?:\/\//i.test(u)) u = "https://" + u;
  return u;
}

function openLinkModal(link, presetCat) {
  const isEdit=!!link, cats=linksState.categorias||Object.keys(LINK_CATS), sel=(link&&link.categoria)||presetCat||cats[0];
  const wrap=document.createElement("div"); wrap.className="modal";
  wrap.innerHTML=`<div class="modal__box" role="dialog" aria-modal="true">
    <h2 class="modal__title">${isEdit?"Editar link":"Adicionar link"}</h2>
    <p class="modal__sub">${isEdit?"As alterações ficam registradas com seu e-mail.":"Fica registrado com seu e-mail."}</p>
    <div class="modal__err" id="m-err" hidden></div>
    <div class="field"><label>Nome</label><input id="m-nome" type="text" maxlength="120" value="${isEdit?esc(link.nome):""}" placeholder="Ex.: Dashboard CSAT" /></div>
    <div class="field"><label>URL</label><input id="m-url" type="url" value="${isEdit?esc(link.url):""}" placeholder="https://..." /></div>
    <div class="field"><label>Descrição</label><textarea id="m-desc" maxlength="280" placeholder="Pra que serve?">${isEdit?esc(link.descricao):""}</textarea></div>
    <div class="field"><label>Categoria</label><select id="m-cat">${cats.map(c=>`<option value="${esc(c)}" ${c===sel?"selected":""}>${esc(c)}</option>`).join("")}</select></div>
    ${isEdit?`<div class="field field--row"><input id="m-ativo" type="checkbox" ${link.ativo?"checked":""} /><label for="m-ativo">Ativo</label></div>`:""}
    <div class="modal__actions">${isEdit?`<button class="btn-ghost" id="m-delete" style="color:var(--err);border-color:var(--err);margin-right:auto"><span class="ms">delete</span> Excluir</button>`:""}<button class="btn-ghost" id="m-cancel">Cancelar</button><button class="btn-cta" id="m-save"><span class="ms">${isEdit?"save":"add"}</span> ${isEdit?"Salvar":"Adicionar"}</button></div>
  </div>`;
  document.body.appendChild(wrap);
  const close=()=>wrap.remove(); wrap.onclick=(e)=>{if(e.target===wrap)close();}; document.getElementById("m-cancel").onclick=close;
  if(isEdit){
    document.getElementById("m-delete").onclick=async()=>{
      if(!confirm(`Excluir o link "${link.nome}"?\n\nEsta ação não pode ser desfeita.`)) return;
      const delBtn=document.getElementById("m-delete"); if(delBtn) delBtn.disabled=true;
      const errBox=document.getElementById("m-err");
      try{
        const res=await fetch("/api/links/"+link.id+"/delete",{method:"POST"});
        if(!res.ok){const d=await res.json().catch(()=>({}));throw new Error(d.message||"Erro HTTP "+res.status);}
        close(); forceLinks(); route();
      }catch(e){if(errBox){errBox.textContent=e.message;errBox.hidden=false;}if(delBtn)delBtn.disabled=false;}
    };
  }
  document.getElementById("m-save").onclick=async()=>{
    const body={nome:document.getElementById("m-nome").value.trim(),url:normalizarUrl(document.getElementById("m-url").value),descricao:document.getElementById("m-desc").value.trim(),categoria:document.getElementById("m-cat").value};
    if(isEdit) body.ativo=document.getElementById("m-ativo").checked;
    const errBox=document.getElementById("m-err"),saveBtn=document.getElementById("m-save"); errBox.hidden=true; saveBtn.disabled=true;
    try {
      const res=await fetch(isEdit?"/api/links/"+link.id:"/api/links",{method:isEdit?"PUT":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
      const data=await res.json().catch(()=>({}));
      if(!res.ok){errBox.textContent=data.message||("Erro HTTP "+res.status);errBox.hidden=false;saveBtn.disabled=false;return;}
      close(); forceLinks(); route();
    } catch(e){errBox.textContent=e.message;errBox.hidden=false;saveBtn.disabled=false;}
  };
}

/* ============================================================
   NAVIGATION — Sidebar (v3)
   ============================================================ */

function buildNav() {
  const cur = location.hash || "#/indicadores";
  const sidebarNav = document.getElementById("sidebar-nav");
  if (!sidebarNav) return;

  const AREAS = [
    { key: "TODOS", label: "Todos", icon: "apps" },
    { key: "OP", label: "OP — Operações", icon: "support_agent" },
    { key: "JORNADA", label: "JORNADA", icon: "route" },
    { key: "MC", label: "MC — Melhoria", icon: "trending_up" },
  ];

  const indCount = (indState.items || []).length;
  const isInd = cur.startsWith("#/indicadores");
  const isProj = cur.startsWith("#/projetos");
  const isOrg = cur.startsWith("#/organograma");
  const isLinks = cur.startsWith("#/links");

  const subItems = AREAS.map(a => {
    const isActive = isInd && indState.area === a.key && !parseHash().id;
    return `<a class="nav-item${isActive ? ' active' : ''}" href="#/indicadores" data-area="${esc(a.key)}"><span class="ms">${a.icon}</span><span class="nav-label">${esc(a.label)}</span></a>`;
  }).join("");

  sidebarNav.innerHTML = `
    <div class="nav-group${isInd ? ' open' : ''}" id="grp-indicadores">
      <div class="nav-item" id="grp-indicadores-head">
        <span class="ms">monitoring</span>
        <span class="nav-label">Indicadores</span>
        ${indCount ? `<span class="nav-count">${indCount}</span>` : ""}
        <span class="ms nav-chev">expand_more</span>
      </div>
      <div class="nav-sub">${subItems}</div>
    </div>
    <a class="nav-item${isProj ? ' active' : ''}" href="#/projetos"><span class="ms">lightbulb</span><span class="nav-label">Projetos</span></a>
    <a class="nav-item${isOrg ? ' active' : ''}" href="#/organograma"><span class="ms">account_tree</span><span class="nav-label">Organograma</span></a>
    <a class="nav-item${isLinks ? ' active' : ''}" href="#/links"><span class="ms">link</span><span class="nav-label">Links</span></a>
  `;

  const grpHead = document.getElementById("grp-indicadores-head");
  if (grpHead) {
    grpHead.onclick = () => {
      document.getElementById("grp-indicadores").classList.toggle("open");
    };
  }

  sidebarNav.querySelectorAll("[data-area]").forEach(a => {
    a.onclick = (e) => {
      e.preventDefault();
      indState.area = a.dataset.area;
      if (!location.hash.startsWith("#/indicadores") || parseHash().id) {
        location.hash = "#/indicadores";
      } else {
        paintIndicadores();
        buildNav();
      }
      closeMobileSidebar();
    };
  });
}

function closeMobileSidebar() {
  document.getElementById("sidebar").classList.remove("mobile-open");
  const bd = document.querySelector(".sidebar-backdrop");
  if (bd) bd.remove();
}

function parseHash() {
  const h = location.hash || "#/indicadores";
  const parts = h.replace(/^#\/?/, "").split("/");
  return { section: parts[0] || "indicadores", id: parts[1] ? decodeURIComponent(parts[1]) : null };
}

function route() {
  buildNav();
  const { section, id } = parseHash();

  const titles = {
    indicadores: { title: "Indicadores", sub: "Valores operacionais via Supabase · metas via Google Sheets" },
    projetos: { title: "Projetos", sub: "Catálogo de iniciativas do time CX" },
    organograma: { title: "Organograma", sub: "Hierarquia do time CX" },
    links: { title: "Links", sub: "Acessos rápidos do time" },
  };
  const t = titles[section] || titles.indicadores;
  const topTitle = document.getElementById("topbar-title");
  const topSub = document.getElementById("topbar-sub");
  if (topTitle) topTitle.textContent = id ? (section === "indicadores" ? "Detalhe do indicador" : section === "links" ? "Categoria" : t.title) : t.title;
  if (topSub) topSub.textContent = id ? "" : t.sub;

  const topRight = document.getElementById("topbar-right");
  if (topRight) {
    topRight.innerHTML = `<div class="icon-circle" id="tb-refresh" title="Atualizar"><span class="ms">refresh</span></div>`;
    const rb = document.getElementById("tb-refresh");
    if (rb) rb.onclick = () => {
      const r = ROUTES.find(x => x.hash === "#/" + section);
      if (r) r.render(true);
    };
  }

  closeMobileSidebar();

  if (section === "indicadores" && id) return renderIndicadorDetalhe(id);
  if (section === "links" && id) return renderLinksCategoria(id);
  const r = ROUTES.find(x => x.hash === "#/" + section) || ROUTES[0];
  r.render();
}

/* ============================================================
   INIT — Sidebar + Router
   ============================================================ */
function initSidebar() {
  const sidebar = document.getElementById("sidebar");
  const toggle = document.getElementById("sidebar-toggle");
  const openBtn = document.getElementById("sidebar-open");

  try {
    const saved = localStorage.getItem("radar_sidebar_collapsed");
    if (saved === "1") sidebar.classList.add("collapsed");
  } catch(e) { /* localStorage may be unavailable */ }

  if (toggle) {
    toggle.onclick = () => {
      sidebar.classList.toggle("collapsed");
      try { localStorage.setItem("radar_sidebar_collapsed", sidebar.classList.contains("collapsed") ? "1" : "0"); } catch(e) {}
    };
  }

  if (openBtn) {
    openBtn.onclick = () => {
      sidebar.classList.add("mobile-open");
      const bd = document.createElement("div");
      bd.className = "sidebar-backdrop";
      bd.onclick = () => closeMobileSidebar();
      document.body.appendChild(bd);
    };
  }
}

initSidebar();
window.addEventListener("hashchange", route);
if (!location.hash) location.hash = "#/indicadores";
route();

