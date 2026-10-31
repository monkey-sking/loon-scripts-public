/**
 * Bing Web 搜索 (Loon Task - Best Effort)
 * 说明：iOS Loon 无法运行 Playwright，所以这里只能用 HTTP 请求“尽力模拟”搜索。
 *      是否计入积分取决于微软风控/账号状态，无法保证。
 *
 * 依赖：
 * - BING_COOKIES（抓包脚本 bing.js 会保存）
 *
 * 可选配置（persistent store / BoxJS）：
 * - BING_WEB_PC_COUNT：默认 6
 * - BING_WEB_MOBILE_COUNT：默认 4
 * - BING_WEB_WAIT_MIN：默认 4（秒）
 * - BING_WEB_WAIT_MAX：默认 8（秒）
 * - BING_WEB_KEYWORDS：自定义关键词（用 \\n 分隔），不填则用内置列表
 */

const $ = new Env("Bing Web 搜索(HTTP)");
// 必应 App 自定义 scheme（2026-10-31 真机验证：sapphire:// 可唤起必应 App）
// 通用链接 https://cn.bing.com/?iba=1 在同一台机器上无效；bing:// / bingapp:// / bingsearch:// 均已失效
const BING_APP_SCHEME = "sapphire://";
// 兼容：如需改回其它跳转（快捷指令/网页），在 BoxJS 或 Argument 里设 BING_OPEN_URL
const BING_SHORTCUT_URL = "shortcuts://run-shortcut?name=%E6%81%A2%E5%A4%8DBing";

function resolveBingOpenUrl() {
  try {
    const arg = typeof $argument !== "undefined" && $argument ? $argument : {};
    return arg.Bing_Open_URL || arg.BING_OPEN_URL || $.getdata("BING_OPEN_URL") || BING_APP_SCHEME;
  } catch (e) {
    return BING_APP_SCHEME;
  }
}

const DEFAULT_KEYWORDS = [
  "AI news",
  "space launch",
  "healthy recipes",
  "stock market",
  "weather today",
  "best earbuds",
  "travel tips",
  "football highlights",
  "movie releases",
  "coding interview",
  "language learning",
  "productivity tools",
  "coffee benefits",
  "new smartphone",
  "home workout",
  "science discovery",
  "history facts",
  "music charts",
  "finance basics",
  "tech trends",
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randInt(min, max) {
  const a = Math.min(min, max);
  const b = Math.max(min, max);
  return a + Math.floor(Math.random() * (b - a + 1));
}

function safeJsonParse(text) {
  if (!text || typeof text !== "string") return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function toInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

function findCounter(obj, keyPrefix) {
  if (!obj) return null;
  if (obj[keyPrefix]) return obj[keyPrefix];
  const key = Object.keys(obj).find(k => String(k).toLowerCase() === String(keyPrefix).toLowerCase());
  return key ? obj[key] : null;
}

function getCounterValue(item, attrKey, propKey) {
  if (!item) return 0;
  if (item[propKey] !== undefined) return toInt(item[propKey]);
  if (item.attributes && item.attributes[attrKey] !== undefined) return toInt(item.attributes[attrKey]);
  return 0;
}

function parseSearchProgress(data) {
  const flyoutResult = data.flyoutResult || data.dashboard || {};
  const userStatus = flyoutResult.userStatus || {};
  const userInfo = data.userInfo || {};
  const level = userInfo.profile?.attributes?.level || userInfo.profile?.level || userStatus.profile?.attributes?.level || userStatus.profile?.level || "";

  const result = {
    isNewLevel: /^newlevel/i.test(String(level)),
    todayPoints: 0,
    totalPoints: toInt(userInfo.balance || userStatus.availablePoints || 0),
    pcSearch: { current: 0, max: 0 },
    mobileSearch: { current: 0, max: 0 },
  };

  if (data.pointsBreakdown) {
    result.pcSearch.current = toInt(data.pointsBreakdown.pcSearch?.current);
    result.pcSearch.max = toInt(data.pointsBreakdown.pcSearch?.max);
    result.mobileSearch.current = toInt(data.pointsBreakdown.mobileSearch?.current);
    result.mobileSearch.max = toInt(data.pointsBreakdown.mobileSearch?.max);
  } else {
    const counters = userStatus.counters || flyoutResult.counters || null;
    if (counters) {
      const pcCounter = findCounter(counters, "PCSearch");
      const mobileCounter = findCounter(counters, "MobileSearch");
      const dailyCounter = findCounter(counters, "DailyPoint");

      if (pcCounter && pcCounter[0]) {
        result.pcSearch.current = getCounterValue(pcCounter[0], "progress", "pointProgress");
        result.pcSearch.max = getCounterValue(pcCounter[0], "max", "pointProgressMax");
      }
      if (mobileCounter && mobileCounter[0]) {
        result.mobileSearch.current = getCounterValue(mobileCounter[0], "progress", "pointProgress");
        result.mobileSearch.max = getCounterValue(mobileCounter[0], "max", "pointProgressMax");
      }
      if (dailyCounter && dailyCounter[0]) {
        result.todayPoints = getCounterValue(dailyCounter[0], "progress", "pointProgress");
      }
    }
  }

  return result;
}

async function fetchRewardsSnapshot(cookie) {
  const urls = [
    "https://cn.bing.com/rewards/panelflyout/getuserinfo",
    "https://rewards.bing.com/api/getuserinfo",
  ];

  for (const url of urls) {
    try {
      const res = await $.http.get({
        url,
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          "X-Requested-With": "XMLHttpRequest",
          Cookie: cookie,
        },
      });
      const data = safeJsonParse(res.body);
      if (data && typeof data === "object" && (data.flyoutResult || data.dashboard || data.userInfo)) {
        return parseSearchProgress(data);
      }
    } catch (_) {
      // try next endpoint
    }
  }

  return null;
}

function buildSearchSummary({ before, after, pcCount, mobileCount, pcOk, mOk }) {
  const progress = after || before;
  if (!progress) {
    return `本次请求: ${pcOk + mOk}/${pcCount + mobileCount}\nPC: ${pcOk}/${pcCount}\nMobile: ${mOk}/${mobileCount}`;
  }

  const lines = [];
  const requestTotal = pcCount + mobileCount;
  const requestOk = pcOk + mOk;

  if (progress.isNewLevel || (progress.pcSearch.max > 0 && progress.mobileSearch.max === 0)) {
    lines.push(`搜索进度: ${progress.pcSearch.current}/${progress.pcSearch.max || "?"}`);
    lines.push(`状态: ${progress.pcSearch.max > 0 && progress.pcSearch.current >= progress.pcSearch.max ? "今日搜索已完成" : "今日搜索未完成"}`);
  } else {
    lines.push(`PC 搜索: ${progress.pcSearch.current}/${progress.pcSearch.max || "?"}`);
    lines.push(`Mobile 搜索: ${progress.mobileSearch.current}/${progress.mobileSearch.max || "?"}`);
    const pcDone = progress.pcSearch.max > 0 && progress.pcSearch.current >= progress.pcSearch.max;
    const mobileDone = progress.mobileSearch.max > 0 && progress.mobileSearch.current >= progress.mobileSearch.max;
    lines.push(`状态: ${pcDone && mobileDone ? "今日搜索已完成" : "今日搜索未完成"}`);
  }

  if (progress.todayPoints > 0) {
    lines.push(`今日积分: ${progress.todayPoints}`);
  }
  lines.push(`本次请求: ${requestOk}/${requestTotal}`);

  return lines.join("\n");
}

function pickKeywords(n, custom) {
  const base = (custom && custom.length ? custom : DEFAULT_KEYWORDS).slice();
  // shuffle
  for (let i = base.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  const out = [];
  for (let i = 0; i < n; i++) out.push(base[i % base.length]);
  return out;
}

async function doSearches({ count, isMobile, cookie }) {
  const ua = isMobile
    ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

  const waitMin = Math.max(1, Number($.getdata("BING_WEB_WAIT_MIN") || 4));
  const waitMax = Math.max(waitMin, Number($.getdata("BING_WEB_WAIT_MAX") || 8));

  const customRaw = $.getdata("BING_WEB_KEYWORDS") || "";
  const custom = customRaw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const keywords = pickKeywords(count, custom);
  let ok = 0;

  for (let i = 0; i < keywords.length; i++) {
    const q = keywords[i];
    const base = isMobile ? "https://m.bing.com/search" : "https://cn.bing.com/search";
    const url = `${base}?q=${encodeURIComponent(q)}&form=QBLH`;

    try {
      const res = await $.http.get({
        url,
        headers: {
          "User-Agent": ua,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          Cookie: cookie,
        },
      });
      const sc = res.status || res.statusCode || 0;
      if (sc >= 200 && sc < 400) ok++;
    } catch (_) {
      // ignore
    }

    if (i < keywords.length - 1) {
      await sleep(randInt(waitMin, waitMax) * 1000);
    }
  }

  return ok;
}

async function main() {
  const arg = typeof $argument !== "undefined" ? $argument : {};
  const searchEnabledRaw =
    arg.Bing_Search_Enable !== undefined ? arg.Bing_Search_Enable :
    (arg.BING_SEARCH_ENABLE !== undefined ? arg.BING_SEARCH_ENABLE : true);
  const searchEnabled = searchEnabledRaw !== false && String(searchEnabledRaw) !== "false";

  if (!searchEnabled) {
    $.log("⏭️ Bing 自动搜索开关已关闭，跳过执行");
    return;
  }

  const cookie = $.getdata("BING_COOKIES") || "";
  if (!cookie) {
    $.msg($.name, "缺少 Cookie", "请先通过抓包脚本获取并保存 BING_COOKIES。");
    return;
  }

  const pcCount = Math.max(0, Number($.getdata("BING_WEB_PC_COUNT") || 6));
  const mobileCount = Math.max(0, Number($.getdata("BING_WEB_MOBILE_COUNT") || 4));

  if (pcCount === 0 && mobileCount === 0) {
    $.msg($.name, "无需执行", "BING_WEB_PC_COUNT 与 BING_WEB_MOBILE_COUNT 均为 0。");
    return;
  }

  let pcOk = 0;
  let mOk = 0;
  const before = await fetchRewardsSnapshot(cookie);

  if (pcCount > 0) pcOk = await doSearches({ count: pcCount, isMobile: false, cookie });
  if (mobileCount > 0) mOk = await doSearches({ count: mobileCount, isMobile: true, cookie });
  const after = await fetchRewardsSnapshot(cookie);

  $.msg($.name, "执行完成", buildSearchSummary({ before, after, pcCount, mobileCount, pcOk, mOk }));
}

function Env(name) {
  this.name = name;
  this.getdata = (k) => $persistentStore.read(k);
  this.getArgument = (k) => {
    try { return $argument ? $argument : null; } catch (e) { return null; }
  };
  this.setdata = (v, k) => $persistentStore.write(v, k);
  this.msg = async (t, s, m, opts) => {
    // === 1. Loon 本地通知 (仅重要错误/Cookie失效时发送) ===
    const isUrgent = m.includes("Cookie") || m.includes("失效") || m.includes("401") || m.includes("异常") || m.includes("失败") || m.includes("Error") || m.includes("缺少");

    let action = {};
    if (typeof opts === "string") {
      action["open-url"] = opts;
    } else if (typeof opts === "object") {
      action = { ...action, ...opts };
    }

    const isCredentialIssue = m.includes("Cookie") || m.includes("失效") || m.includes("缺少") || m.includes("401");

    if (isCredentialIssue && !action["open-url"]) {
      action["open-url"] = resolveBingOpenUrl();
    }

    // Loon 通知点击跳转字段是 openUrl（camelCase）；open-url 仅作兼容，两个都写才能在各版本生效
    if (action["open-url"] && !action.openUrl) action.openUrl = action["open-url"];
    if (action.openUrl && !action["open-url"]) action["open-url"] = action.openUrl;

    // 用户要求: 平常不发Loon通知，只有Cookie失效/错误时才发
    if (isUrgent || (opts && opts.forceLoon)) {
      $notification.post(t, s, m, action);
      this.log(`🔔 Sent Loon Notification (Urgent/Forced)`);
    } else {
      this.log(`🔕 Skipped Loon Notification (Success/Normal)`);
    }

    this.log(`🔔 ${s}\n${m}`);

    // Loon 官方语法: argument=[{var1},{var2}] → 脚本中用 $argument.var1 读取
    const arg = typeof $argument !== "undefined" ? $argument : {};
    const tgUserId = arg.TG_USER_ID || this.getdata("TG_USER_ID");
    const rawTgToken = arg.TG_BOT_TOKEN;
    const tgBotToken = (rawTgToken && !rawTgToken.includes("***")) ? rawTgToken : this.getdata("TG_BOT_TOKEN");
    const barkPush = arg.BARK_PUSH || this.getdata("BARK_PUSH");
    const tgEnable = arg.TG_Notify_Enable !== undefined ? arg.TG_Notify_Enable : this.getdata("TG_Notify_Enable");
    const barkEnable = arg.Bark_Notify_Enable !== undefined ? arg.Bark_Notify_Enable : this.getdata("Bark_Notify_Enable");

    this.log(`[DEBUG] $argument type: ${typeof $argument}`);
    this.log(`[DEBUG] TG_USER_ID: ${tgUserId ? String(tgUserId).substring(0, 10) + "..." : "未设置"}`);
    this.log(`[DEBUG] TG_BOT_TOKEN: ${tgBotToken ? String(tgBotToken).substring(0, 15) + "..." : "未设置"}`);
    this.log(`[DEBUG] BARK_PUSH: ${barkPush ? String(barkPush).substring(0, 30) + "..." : "未设置"}`);
    this.log(`[DEBUG] TG_Enable: ${tgEnable}, Bark_Enable: ${barkEnable}`);

    const isTgOn = tgEnable !== false && String(tgEnable) !== "false";
    const isBarkOn = barkEnable !== false && String(barkEnable) !== "false";

    const promises = [];

    if (isTgOn) {
      if (tgUserId && tgBotToken) {
        const url = `https://api.telegram.org/bot${tgBotToken}/sendMessage`;
        const body = JSON.stringify({ chat_id: tgUserId, text: `${t}\n\n${s}\n${m}`, parse_mode: "Markdown" });
        promises.push(new Promise(resolve => {
          $httpClient.post({ url, body, headers: { "Content-Type": "application/json" } }, (e, r, b) => {
            if (e) this.log(`TG Error: ${e}`);
            else this.log(`TG 发送成功`);
            resolve();
          });
        }));
      } else {
        this.log("⚠️ TG 通知开启，但未找到 TG_USER_ID 或 TG_BOT_TOKEN");
      }
    } else {
      this.log(`🔕 TG 通知已关闭`);
    }

    if (isBarkOn) {
      if (barkPush) {
        let url = barkPush;
        if (!url.startsWith("http")) {
          url = `https://api.day.app/${url}`;
        }
        if (!url.endsWith("/")) {
          url += "/";
        }
        url += `${encodeURIComponent(t)}/${encodeURIComponent(s + "\n" + m)}`;
        promises.push(new Promise(resolve => {
          $httpClient.get({ url }, (e, r, b) => {
            if (e) this.log(`Bark Error: ${e}`);
            else this.log(`Bark 发送成功`);
            resolve();
          });
        }));
      } else {
        this.log("⚠️ Bark 通知开启，但未找到 BARK_PUSH");
      }
    } else {
      this.log(`🔕 Bark 通知已关闭`);
    }

    await Promise.all(promises);
  };
  this.log = (m) => console.log(m);
  this.http = {
    get: (opts) =>
      new Promise((resolve, reject) =>
        $httpClient.get(opts, (err, resp, body) =>
          err ? reject(err) : resolve({ status: resp.status, statusCode: resp.status, headers: resp.headers, body }),
        ),
      ),
  };
  this.done = () => $done({});
}

main()
  .catch((e) => $.msg($.name, "❌ 运行异常", String(e && e.message ? e.message : e)))
  .finally(() => $.done());
