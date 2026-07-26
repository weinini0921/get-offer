const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PORT = Number(process.env.PORT || 4174);
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = __dirname;
const PYTHON = process.env.PYTHON || "python3";
const OLLAMA_ENDPOINT = process.env.OLLAMA_ENDPOINT || "http://127.0.0.1:11434/api/generate";
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

const APPLICATION_URLS = {
  loreal: "https://careers.loreal.com/en_US/jobs/SearchJobs?jobOffset=0&keyword={query}",
  elc: "https://www.elcompanies.com/en/careers/jobs?search={query}",
  sephora: "https://jobs.sephora.com/search-jobs?keywords={query}",
  shiseido: "https://corp.shiseido.com/en/careers/search/?keywords={query}",
  coty: "https://careers.coty.com/search/?q={query}",
  beiersdorf: "https://www.beiersdorf.com/career/jobs?query={query}",
  kao: "https://www.kao.com/global/en/careers/jobs/",
  pg: "https://www.pgcareers.com/search-jobs?keywords={query}",
  unilever: "https://careers.unilever.com/search-jobs?keywords={query}",
  nestle: "https://www.nestle.com/jobs/search-jobs?keyword={query}",
  mars: "https://careers.mars.com/global/en/search-results?keywords={query}",
  mondelez: "https://www.mondelezinternational.com/careers/jobs/?search={query}",
  pepsi: "https://www.pepsicojobs.com/main/jobs?keywords={query}",
  coca: "https://careers.coca-colacompany.com/job-search-results/?keyword={query}",
  danone: "https://careers.danone.com/search/?q={query}",
  colgate: "https://jobs.colgate.com/search/?q={query}",
  roche: "https://careers.roche.com/global/en/search-results?keywords={query}",
  jnj: "https://www.careers.jnj.com/en/search-jobs?keywords={query}",
  novartis: "https://www.novartis.com/careers/career-search?search_api_fulltext={query}",
  pfizer: "https://www.pfizer.com/about/careers/search?keyword={query}",
  sanofi: "https://jobs.sanofi.com/en/search-jobs?keywords={query}",
  gsk: "https://jobs.gsk.com/en-gb/jobs?keywords={query}",
  bayer: "https://career.bayer.com/en/search-jobs?keywords={query}",
  lilly: "https://careers.lilly.com/us/en/search-results?keywords={query}",
  merck: "https://www.merckgroup.com/en/careers.html",
  astrazeneca: "https://careers.astrazeneca.com/search-jobs?keywords={query}",
  siemens: "https://jobs.siemens.com/careers?query={query}",
  bosch: "https://www.bosch.com/careers/jobs/?search={query}",
  ikea: "https://www.ikea.com/global/en/this-is-ikea/work-with-us/",
  kpmg: "https://kpmg.com/cn/en/home/careers/graduates.html",
  pwc: "https://www.pwccn.com/en/careers/students.html",
  deloitte: "https://www2.deloitte.com/cn/en/careers/students.html",
  ey: "https://www.ey.com/en_cn/careers/job-search",
  mckinsey: "https://www.mckinsey.com/careers/search-jobs/jobs?text={query}",
  bcg: "https://careers.bcg.com/global/en/search-results?keywords={query}",
  bytedance: "https://jobs.bytedance.com/campus/position?keywords={query}",
  tencent: "https://join.qq.com/post.html",
  alibaba: "https://talent.alibaba.com/campus/position-list?keyword={query}",
  jd: "https://campus.jd.com/#/jobs",
  meituan: "https://zhaopin.meituan.com/web/position",
  bilibili: "https://jobs.bilibili.com/social/positions"
};

async function handleRequest(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "POST" && url.pathname === "/api/crawl") {
      const body = await readJson(req);
      const result = await crawlSources(body);
      sendJson(res, result);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/parse-resume") {
      const body = await readJson(req);
      const result = await parseResume(body);
      sendJson(res, result);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/analyze-resume") {
      const body = await readJson(req);
      const result = await analyzeResume(body);
      sendJson(res, result);
      return;
    }
    serveStatic(url.pathname, res);
  } catch (error) {
    sendJson(res, { error: error.message || "server error" }, 500);
  }
}

const server = http.createServer(handleRequest);

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`Get Offer: http://${HOST}:${PORT}/`);
  });
}

module.exports = handleRequest;

async function crawlSources(body) {
  const sourceIds = new Set(Array.isArray(body.sourceIds) ? body.sourceIds : []);
  const rawSources = Array.isArray(body.sources) ? body.sources : [];
  const sources = sourceIds.size ? rawSources.filter((source) => sourceIds.has(source.id)) : rawSources;
  const profile = body.profile || {};
  const queries = buildQueries(
    body.targetRoles || profile.roles,
    body.targetKeywords || profile.keywords,
    body.resume
  );
  const jobs = [];
  const sourceStatus = {};

  for (const source of sources) {
    const status = { label: "未访问", ok: false };
    try {
      const targets = await resolveRecruitingTargets(source, queries);
      if (isSearchSource(source.url, source) && targets.length === 1 && targets[0].url === source.url) {
        jobs.push(...fallbackSearchJobs(source, queries));
        status.label = "定位投递入口";
        sourceStatus[source.id] = status;
        continue;
      }

      let extracted = [];
      let usedTarget = targets[0] || source;
      for (const target of targets.slice(0, 4)) {
        try {
          const html = await fetchText(target.url);
          const found = extractJobsFromHtml(html, target, queries);
          if (found.length) {
            extracted = found;
            usedTarget = target;
            break;
          }
        } catch {
          usedTarget = target;
        }
      }
      jobs.push(...extracted);
      if (!extracted.length) jobs.push(...fallbackSearchJobs(usedTarget, queries));
      status.label = extracted.length
        ? `${usedTarget.url !== source.url ? "定位专站，" : ""}抓到 ${extracted.length} 条`
        : "定位投递入口";
      status.platform = usedTarget.platform || source.platform || "招聘专站";
      status.url = usedTarget.url || source.url;
      status.ok = true;
    } catch (error) {
      jobs.push(...fallbackSearchJobs(source, queries));
      status.label = "招聘站限制访问，保留投递入口";
      status.ok = false;
    }
    sourceStatus[source.id] = status;
  }

  return {
    crawledAt: new Date().toISOString(),
    jobs: dedupeJobs(jobs).slice(0, 120),
    sourceStatus
  };
}

async function resolveRecruitingTargets(source, queries) {
  if (!isSearchSource(source.url, source)) return [source];
  try {
    const html = await fetchText(source.url);
    const candidates = extractRecruitmentLinks(html, source);
    if (!candidates.length) return [source];
    return candidates.slice(0, 5).map((candidate, index) => ({
      ...source,
      url: candidate.url,
      platform: inferRecruitingPlatform(candidate.url, candidate.label),
      keywords: [...new Set([...(source.keywords || []), ...splitTerms(candidate.label), queries[index] || ""])].filter(Boolean)
    }));
  } catch {
    return [source];
  }
}

function extractRecruitmentLinks(html, source) {
  const anchors = [...String(html || "").matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,500}?)<\/a>/gi)];
  const seen = new Set();
  const candidates = [];
  for (const [, rawHref, labelHtml] of anchors) {
    const label = cleanText(labelHtml);
    const decodedHref = decodeEntities(rawHref);
    const url = unwrapSearchRedirect(absolutize(decodedHref, source.url));
    if (!looksLikeRecruitmentUrl(url, label)) continue;
    const key = url.replace(/[#?].*$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ url, label });
  }
  return candidates;
}

function unwrapSearchRedirect(url) {
  try {
    const parsed = new URL(url);
    for (const key of ["url", "q"]) {
      const direct = parsed.searchParams.get(key);
      if (direct && /^https?:\/\//i.test(direct)) return direct;
    }
    const encoded = parsed.searchParams.get("u");
    if (encoded?.startsWith("a1")) {
      const normalized = encoded.slice(2).replace(/-/g, "+").replace(/_/g, "/");
      const decoded = Buffer.from(normalized, "base64").toString("utf8");
      if (/^https?:\/\//i.test(decoded)) return decoded;
    }
    return url;
  } catch {
    return url;
  }
}

function looksLikeRecruitmentUrl(url, label = "") {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (["bing.com", "google.com", "baidu.com", "sogou.com"].some((domain) => host.endsWith(domain))) return false;
    const blocked = ["linkedin.com", "indeed.com", "glassdoor.com", "liepin.com", "zhipin.com", "51job.com", "zhaopin.com"];
    if (blocked.some((domain) => host.endsWith(domain))) return false;
    const value = `${url} ${label}`.toLowerCase();
    const signals = [
      "career",
      "careers",
      "jobs",
      "jobsearch",
      "campus",
      "graduate",
      "graduates",
      "students",
      "trainee",
      "recruit",
      "talent",
      "workdayjobs",
      "myworkdayjobs",
      "successfactors",
      "jobs2web",
      "greenhouse",
      "lever.co",
      "yello.co",
      "taleo",
      "招聘",
      "校招",
      "职位"
    ];
    return signals.some((signal) => value.includes(signal));
  } catch {
    return false;
  }
}

async function parseResume(body) {
  const filename = String(body.filename || "resume").toLowerCase();
  const base64 = String(body.base64 || body.content || "").replace(/^data:.*?;base64,/, "");
  if (!base64) throw new Error("missing file data");
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length > 12_000_000) throw new Error("file too large");

  if (filename.endsWith(".txt") || filename.endsWith(".md")) {
    return { text: buffer.toString("utf8"), parser: "text" };
  }

  if (!filename.endsWith(".pdf")) {
    throw new Error("only txt, md, and pdf resumes are supported");
  }

  const tempPath = path.join(os.tmpdir(), `autumn-resume-${Date.now()}-${Math.random().toString(16).slice(2)}.pdf`);
  fs.writeFileSync(tempPath, buffer);
  try {
    const result = await runPython(path.join(ROOT, "scripts", "extract_resume_text.py"), [tempPath]);
    const parsed = JSON.parse(result || "{}");
    if (!parsed.text) {
      return {
        text: "",
        parser: parsed.parser || "",
        warning: "PDF 可能是扫描件或图片版，免费文本解析没有识别到文字。"
      };
    }
    return parsed;
  } finally {
    fs.rm(tempPath, { force: true }, () => {});
  }
}

async function analyzeResume(body) {
  const resume = String(body.resume || "").trim();
  const targetRoles = String(body.targetRoles || "").trim();
  const targetKeywords = String(body.targetKeywords || "").trim();
  const model = String(body.model || "deepseek-r1:7b").trim();
  const endpoint = String(body.endpoint || OLLAMA_ENDPOINT).trim();
  if (!resume) throw new Error("missing resume");

  const fallback = localResumeAnalysis(resume, targetRoles, targetKeywords);
  try {
    const aiText = await callOllama(endpoint, model, resume, targetRoles, targetKeywords);
    const parsed = parseAiJson(aiText);
    return {
      provider: "local-ollama",
      model,
      ...fallback,
      ...parsed,
      raw: aiText.slice(0, 2400)
    };
  } catch (error) {
    return {
      provider: "local-rules",
      model: "zero-cost-rules",
      notice: "未连接到本机免费 AI，已使用本地规则分析。可安装 Ollama 并运行 DeepSeek 系模型后重试。",
      ...fallback
    };
  }
}

async function callOllama(endpoint, model, resume, targetRoles, targetKeywords) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const prompt = [
      "你是中文秋招简历顾问。请只返回 JSON，不要 Markdown。",
      "JSON 字段：summary:string, strengths:string[], gaps:string[], rewriteTips:string[], recommendedRoles:string[], keywords:string[]。",
      "要求：summary 30字以内；gaps 和 rewriteTips 各不超过2条；只写大方向，不要长报告。",
      `目标岗位：${targetRoles || "未填写"}`,
      `搜索关键词：${targetKeywords || "未填写"}`,
      `简历：${resume.slice(0, 7000)}`
    ].join("\n\n");
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.2 } })
    });
    if (!response.ok) throw new Error(`AI HTTP ${response.status}`);
    const payload = await response.json();
    return String(payload.response || "");
  } finally {
    clearTimeout(timer);
  }
}

function parseAiJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { summary: text.slice(0, 500) };
    try {
      return JSON.parse(match[0]);
    } catch {
      return { summary: text.slice(0, 500) };
    }
  }
}

function localResumeAnalysis(resume, targetRoles, targetKeywords) {
  const skills = extractSkillKeys(`${resume} ${targetRoles} ${targetKeywords}`);
  const hasMetrics = /(\d+%|\d+人|\d+万|\d+\+|提升|增长|转化|留存|GMV|ROI)/i.test(resume);
  const hasInternship = /实习|intern|项目|project/i.test(resume);
  const targetText = `${targetRoles} ${targetKeywords}`.toLowerCase();
  const strengths = [];
  const gaps = [];

  if (skills.length) strengths.push(`已识别到岗位相关关键词：${skills.slice(0, 8).join("、")}。`);
  if (hasMetrics) strengths.push("简历中有量化结果，适合放在经历首句或项目结尾。");
  if (hasInternship) strengths.push("已有实习或项目证据，可用于 JD 匹配和面试展开。");
  if (!skills.length) gaps.push("关键词覆盖不足，建议补充目标岗位、行业词、工具技能和项目方法。");
  if (!hasMetrics) gaps.push("量化结果不足，建议增加规模、转化、效率、成本、排名或用户反馈数据。");
  if (!targetText.trim()) gaps.push("还没有填写目标岗位，推荐质量会明显下降。");

  return {
    summary: "简历已完成基础画像，优先补强岗位关键词和量化结果。",
    strengths: strengths.length ? strengths : ["简历文本可被解析，已具备基础分析条件。"],
    gaps: gaps.length ? gaps : ["当前主要优化点是按具体 JD 调整经历顺序和措辞。"],
    rewriteTips: [
      "把最匹配目标岗位的一段经历放到简历前半部分。",
      "每段经历尽量写成“任务 + 方法 + 结果”。"
    ],
    recommendedRoles: inferRolesFromSkills(skills),
    keywords: skills
  };
}

function extractSkillKeys(text) {
  const source = String(text || "").toLowerCase();
  const dictionary = {
    "数据分析": ["数据分析", "sql", "python", "dashboard", "指标", "分析"],
    "品牌管理": ["品牌", "brand", "消费者洞察", "市场营销"],
    "药企": ["医药", "药企", "制药", "临床", "医学", "药学"],
    "快消": ["快消", "fmcg", "供应链", "销售", "渠道"],
    "美妆": ["美妆", "化妆品", "护肤", "彩妆", "beauty"],
    "外企": ["外企", "英语", "英文", "global", "international"],
    "产品": ["产品", "prd", "用户研究", "需求", "a/b"],
    "运营": ["运营", "增长", "转化", "留存", "活动"]
  };
  return Object.entries(dictionary)
    .filter(([, aliases]) => aliases.some((alias) => source.includes(alias.toLowerCase())))
    .map(([key]) => key);
}

function inferRolesFromSkills(skills) {
  const roles = [];
  if (skills.includes("药企")) roles.push("药企商业管培生", "医学事务助理", "市场准入助理");
  if (skills.includes("快消") || skills.includes("品牌管理")) roles.push("快消品牌管理管培生", "消费者洞察", "渠道销售管培");
  if (skills.includes("美妆")) roles.push("美妆数字营销", "电商运营", "品牌运营");
  if (skills.includes("外企")) roles.push("外企商业分析", "项目管理", "运营管培");
  if (skills.includes("数据分析")) roles.push("商业分析师", "数据分析师");
  return [...new Set(roles)].slice(0, 6);
}

function buildQueries(targetRoles, targetKeywords) {
  const raw = `${targetRoles || ""},${targetKeywords || ""}`;
  const terms = raw
    .split(/[,，、\n\r\t]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .slice(0, 18);
  const defaults = ["校招", "实习", "管培生", "graduate", "trainee"];
  return [...new Set([...terms, ...defaults])].slice(0, 24);
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 AutumnJobAssistant/1.0 zero-cost local prototype",
        accept: "text/html,application/xhtml+xml"
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text") && !contentType.includes("html")) throw new Error("not html");
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function extractJobsFromHtml(html, source, queries) {
  const anchors = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{2,500}?)<\/a>/gi)];
  const jobs = [];
  for (const [, href, labelHtml] of anchors) {
    const label = cleanText(labelHtml);
    if (!looksLikeJob(label, queries)) continue;
    jobs.push(makeJob(source, label, absolutize(href, source.url), "招聘专站抓取"));
  }

  if (jobs.length) return jobs.slice(0, 12);

  const text = cleanText(html);
  const sentences = text.split(/[。；;|｜\n\r]+/).map((item) => item.trim()).filter(Boolean);
  for (const sentence of sentences) {
    if (!looksLikeJob(sentence, queries)) continue;
    jobs.push(makeJob(source, sentence.slice(0, 70), buildSearchUrl(source.url, queries[0], source), "投递入口"));
    if (jobs.length >= 8) break;
  }
  return jobs;
}

function fallbackSearchJobs(source, queries) {
  const primaryQueries = queries.slice(0, 4);
  return primaryQueries.map((query) =>
    makeJob(source, `${query} 投递入口`, buildSearchUrl(source.url, query, source), "投递入口")
  );
}

function makeJob(source, title, url, sourceLabel) {
  const tags = [...new Set([...(source.keywords || []), ...splitTerms(title)].filter(Boolean))].slice(0, 7);
  return {
    id: `${source.id}-${hash(`${title}-${url}`)}`,
    title,
    company: source.company,
    city: source.city || "中国",
    type: source.platform || "招聘专站",
    category: source.category,
    source: "official",
    sourceId: source.id,
    deadline: "",
    url,
    applyUrl: url,
    linkLabel: sourceLabel.includes("投递") ? "去投递" : "打开岗位",
    tags,
    summary: `${sourceLabel}：根据你的目标岗位关键词从 ${source.company} 的${source.platform || "招聘专站"}提取或生成。`,
    jd: `${title} ${source.company} ${source.category} ${tags.join(" ")}`
  };
}

function looksLikeJob(text, queries) {
  const value = text.toLowerCase();
  if (value.length < 4 || value.length > 160) return false;
  const generic = ["global careers", "search results", "make an impact", "saved jobs", "privacy", "cookie", "sign in", "login", "job alerts"];
  if (generic.some((word) => value.includes(word))) return false;
  const jobWords = ["intern", "graduate", "trainee", "campus", "校招", "实习", "职位", "岗位", "管培", "招聘"];
  const queryHit = queries.some((query) => value.includes(query.toLowerCase()));
  const jobHit = jobWords.some((word) => value.includes(word.toLowerCase()));
  return queryHit || jobHit;
}

function buildSearchUrl(baseUrl, query, source = {}) {
  const template = APPLICATION_URLS[source.id];
  const encoded = encodeURIComponent(query || "graduate trainee");
  if (template) return template.replace("{query}", encoded);
  try {
    const url = new URL(baseUrl);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (isSearchHost(host)) return baseUrl;
    return url.toString();
  } catch {
    return "#";
  }
}

function isSearchSource(url, source = {}) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return isSearchHost(host) || String(source.platform || "").includes("搜索");
  } catch {
    return String(source.platform || "").includes("搜索");
  }
}

function isSearchHost(host) {
  return ["bing.com", "google.com", "baidu.com", "sogou.com"].some((domain) => host.endsWith(domain));
}

function inferRecruitingPlatform(url, label = "") {
  const value = `${url || ""} ${label || ""}`.toLowerCase();
  if (value.includes("workdayjobs") || value.includes("myworkdayjobs")) return "Workday";
  if (value.includes("successfactors") || value.includes("jobs2web")) return "SuccessFactors";
  if (value.includes("greenhouse")) return "Greenhouse";
  if (value.includes("lever.co")) return "Lever";
  if (value.includes("yello.co")) return "Yello 招聘站";
  if (value.includes("campus") || value.includes("graduate") || value.includes("students") || value.includes("校招")) return "校园招聘专站";
  if (value.includes("jobs.") || value.includes("careers.") || value.includes("/jobs") || value.includes("招聘")) return "企业招聘站";
  return "招聘专站";
}

function cleanText(html) {
  return decodeEntities(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function splitTerms(text) {
  return String(text || "")
    .split(/[,，、\s/|｜-]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .slice(0, 5);
}

function dedupeJobs(jobs) {
  const seen = new Set();
  return jobs.filter((job) => {
    const key = `${job.company}|${job.title}|${job.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function absolutize(href, baseUrl) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return baseUrl;
  }
}

function hash(text) {
  let value = 0;
  for (let i = 0; i < text.length; i += 1) value = (value * 31 + text.charCodeAt(i)) >>> 0;
  return value.toString(36);
}

function runPython(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, [scriptPath, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(stderr || `python exited ${code}`));
      else resolve(stdout.trim());
    });
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 16_000_000) {
        reject(new Error("request too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("invalid json"));
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(pathname, res) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(ROOT, safePath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
}

function sendJson(res, payload, status = 200) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}
