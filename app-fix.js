(() => {
  const templates = {
    "L'Oreal": "https://careers.loreal.com/en_US/jobs/SearchJobs?jobOffset=0&keyword={query}",
    "欧莱雅": "https://careers.loreal.com/en_US/jobs/SearchJobs?jobOffset=0&keyword={query}",
    "雅诗兰黛": "https://www.elcompanies.com/en/careers/jobs?search={query}",
    Sephora: "https://jobs.sephora.com/search-jobs?keywords={query}",
    "资生堂": "https://corp.shiseido.com/en/careers/search/?keywords={query}",
    Coty: "https://careers.coty.com/search/?q={query}",
    Beiersdorf: "https://www.beiersdorf.com/career/jobs?query={query}",
    "花王": "https://www.kao.com/global/en/careers/jobs/",
    "宝洁": "https://www.pgcareers.com/search-jobs?keywords={query}",
    "联合利华": "https://careers.unilever.com/search-jobs?keywords={query}",
    "雀巢": "https://www.nestle.com/jobs/search-jobs?keyword={query}",
    "玛氏": "https://careers.mars.com/global/en/search-results?keywords={query}",
    "亿滋": "https://www.mondelezinternational.com/careers/jobs/?search={query}",
    "百事": "https://www.pepsicojobs.com/main/jobs?keywords={query}",
    "可口可乐": "https://careers.coca-colacompany.com/job-search-results/?keyword={query}",
    "达能": "https://careers.danone.com/search/?q={query}",
    "高露洁": "https://jobs.colgate.com/search/?q={query}",
    "罗氏": "https://careers.roche.com/global/en/search-results?keywords={query}",
    "强生": "https://www.careers.jnj.com/en/search-jobs?keywords={query}",
    "诺华": "https://www.novartis.com/careers/career-search?search_api_fulltext={query}",
    "辉瑞": "https://www.pfizer.com/about/careers/search?keyword={query}",
    "赛诺菲": "https://jobs.sanofi.com/en/search-jobs?keywords={query}",
    GSK: "https://jobs.gsk.com/en-gb/jobs?keywords={query}",
    "拜耳": "https://career.bayer.com/en/search-jobs?keywords={query}",
    "礼来": "https://careers.lilly.com/us/en/search-results?keywords={query}",
    "默克": "https://www.merckgroup.com/en/careers.html",
    "阿斯利康": "https://careers.astrazeneca.com/search-jobs?keywords={query}",
    "西门子": "https://jobs.siemens.com/careers?query={query}",
    "博世": "https://www.bosch.com/careers/jobs/?search={query}",
    "宜家": "https://www.ikea.com/global/en/this-is-ikea/work-with-us/",
    KPMG: "https://kpmg.com/cn/en/home/careers/graduates.html",
    PwC: "https://www.pwccn.com/en/careers/students.html",
    Deloitte: "https://www2.deloitte.com/cn/en/careers/students.html",
    EY: "https://www.ey.com/en_cn/careers/job-search",
    "麦肯锡": "https://www.mckinsey.com/careers/search-jobs/jobs?text={query}",
    BCG: "https://careers.bcg.com/global/en/search-results?keywords={query}",
    "字节跳动": "https://jobs.bytedance.com/campus/position?keywords={query}",
    "腾讯": "https://join.qq.com/post.html",
    "阿里巴巴": "https://talent.alibaba.com/campus/position-list?keyword={query}",
    "京东": "https://campus.jd.com/#/jobs",
    "美团": "https://zhaopin.meituan.com/web/position",
    "哔哩哔哩": "https://jobs.bilibili.com/social/positions"
  };

  const searchHosts = ["bing.com", "google.com", "baidu.com", "sogou.com"];
  const directSignals = [
    "/job/",
    "/jobs/",
    "/position/",
    "/positions/",
    "jobid=",
    "job_id=",
    "requisition",
    "reqid",
    "req_id",
    "greenhouse.io",
    "lever.co",
    "myworkdayjobs.com",
    "successfactors"
  ];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function targetQuery(title = "") {
    const roles = $("#targetRolesInput")?.value || $("#profileRoles")?.value || "";
    return encodeURIComponent(title || roles.split(/[,，、;\n]/).find(Boolean) || "graduate trainee");
  }

  function sourceTemplate(company) {
    const normalized = String(company || "").trim();
    return Object.entries(templates).find(([name]) => normalized.includes(name) || name.includes(normalized))?.[1] || "";
  }

  function officialApplyUrl(company, title) {
    const template = sourceTemplate(company);
    return template ? template.replace("{query}", targetQuery(title)) : "";
  }

  function isSearchUrl(url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
      return searchHosts.some((domain) => host.endsWith(domain));
    } catch {
      return true;
    }
  }

  function isLikelyDirectApplyUrl(url) {
    if (!url || isSearchUrl(url)) return false;
    try {
      const parsed = new URL(url);
      const value = `${parsed.hostname} ${parsed.pathname} ${parsed.search}`.toLowerCase();
      if (!parsed.search && /^#/.test(parsed.hash || "")) return false;
      return directSignals.some((signal) => value.includes(signal));
    } catch {
      return false;
    }
  }

  function fixJob(job) {
    const applyUrl = isLikelyDirectApplyUrl(job.applyUrl) ? job.applyUrl
      : isLikelyDirectApplyUrl(job.url) ? job.url
        : officialApplyUrl(job.company, job.title) || job.applyUrl || job.url;
    return {
      ...job,
      url: applyUrl,
      applyUrl,
      linkLabel: "去投递",
      summary: String(job.summary || "").replace(/搜索入口|招聘专站搜索/g, "官方投递入口")
    };
  }

  function patchFetch() {
    if (!window.fetch || window.__getOfferFetchPatched) return;
    window.__getOfferFetchPatched = true;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await nativeFetch(...args);
      const requestUrl = String(args[0]?.url || args[0] || "");
      if (!requestUrl.includes("/api/crawl")) return response;
      try {
        const payload = await response.clone().json();
        if (!Array.isArray(payload.jobs)) return response;
        payload.jobs = payload.jobs.map(fixJob);
        return new Response(JSON.stringify(payload), {
          status: response.status,
          statusText: response.statusText,
          headers: { "Content-Type": "application/json" }
        });
      } catch {
        return response;
      }
    };
  }

  function patchJobCards() {
    $$(".job-card").forEach((card) => {
      const title = $("h3", card)?.textContent?.trim() || "";
      const meta = $(".job-header p", card)?.textContent || "";
      const company = meta.split("·")[0]?.trim() || "";
      const anchor = $(".job-actions a", card);
      if (!anchor) return;
      const current = anchor.getAttribute("href") || "";
      const replacement = officialApplyUrl(company, title);
      if (replacement && !isLikelyDirectApplyUrl(current) && anchor.href !== replacement) {
        anchor.href = replacement;
      }
      if (anchor.textContent !== "去投递") anchor.textContent = "去投递";
    });
  }

  function observeJobCards() {
    if (window.__getOfferJobCardObserver) return;
    let queued = false;
    window.__getOfferJobCardObserver = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        patchJobCards();
      });
    });
    window.__getOfferJobCardObserver.observe(document.body, { childList: true, subtree: true });
  }

  function removeTargetLiveRefresh() {
    ["targetRolesInput", "targetKeywordsInput"].forEach((id) => {
      const input = document.getElementById(id);
      if (!input || input.dataset.getOfferFixed === "1") return;
      const clone = input.cloneNode(true);
      clone.value = input.value;
      clone.dataset.getOfferFixed = "1";
      input.replaceWith(clone);
      clone.addEventListener("input", () => {
        const status = $("#sourceStatus");
        if (status) status.textContent = "目标已修改，保存或抓取后更新候选";
      });
    });

    ["saveResumeBtn", "startRecommendBtn", "crawlOfficialBtn", "crawlOfficialBtnToday"].forEach((id) => {
      const button = document.getElementById(id);
      if (!button || button.dataset.getOfferCommitFixed === "1") return;
      button.dataset.getOfferCommitFixed = "1";
      button.addEventListener("click", () => {
        if (typeof window.commitTargetDraft === "function") {
          window.commitTargetDraft({ renderJobs: false });
        } else if (typeof window.g === "function") {
          window.g();
        }
      }, true);
    });
  }

  function boot() {
    patchFetch();
    removeTargetLiveRefresh();
    patchJobCards();
    observeJobCards();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
