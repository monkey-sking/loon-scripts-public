/**
 * Bing Rewards 每日活动简单点击 (Loon Task)
 *
 * 说明：
 * - 仅处理 Rewards API 中可直接打开 destinationUrl 的简单点击类 offer。
 * - quiz / poll / punchcard / search 等需要浏览器交互的任务会跳过。
 *
 * 依赖：
 * - BING_COOKIES（抓包脚本 bing.js 会保存）
 *
 * 可选配置（persistent store / BoxJS）：
 * - BING_ACTIVITY_MAX：默认 8
 * - BING_ACTIVITY_WAIT_MIN：默认 4（秒）
 * - BING_ACTIVITY_WAIT_MAX：默认 7（秒）
 */

const $ = new Env("Bing每日活动");
// 必应 App 自定义 scheme（2026-10-31 真机验证：sapphire:// 可唤起必应 App）
const BING_APP_SCHEME = "sapphire://";
const getBingShortcutUrl = () => {
  try {
    const arg = typeof $argument !== "undefined" && $argument ? $argument : {};
    return arg.Bing_Open_URL || arg.BING_OPEN_URL || $.getdata("BING_OPEN_URL") || $.getdata("BING_SHORTCUT_URL") || BING_APP_SCHEME;
  } catch (e) {
    return BING_APP_SCHEME;
  }
};

const REWARDS_USERINFO_URLS = [
  "https://rewards.bing.com/api/getuserinfo",
  "https://cn.bing.com/rewards/panelflyout/getuserinfo",
];

const DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const SKIP_PROMOTION_TYPES = ["search", "urlreward", "quiz", "poll", "punchcard"];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object") {
    const out = [];
    Object.keys(value).forEach((key) => {
      const item = value[key];
      if (Array.isArray(item)) out.push.apply(out, item);
      else if (item && typeof item === "object") out.push(item);
    });
    return out;
  }
  return [];
}

function firstDefined(values) {
  for (let i = 0; i < values.length; i++) {
    if (values[i] !== undefined && values[i] !== null && values[i] !== "") return values[i];
  }
  return "";
}

function boolTrue(value) {
  return value === true || String(value).toLowerCase() === "true";
}

function boolFalse(value) {
  return value === false || String(value).toLowerCase() === "false";
}

function toInt(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

function normalizeUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.charAt(0) === "/") return `https://rewards.bing.com${raw}`;
  return "";
}

function normalizeOffer(offer) {
  const attrs = offer && offer.attributes ? offer.attributes : {};
  const url = normalizeUrl(firstDefined([
    offer && offer.destinationUrl,
    offer && offer.destination,
    attrs.destinationUrl,
    attrs.destination,
  ]));
  const title = String(firstDefined([
    offer && offer.title,
    attrs.title,
    offer && offer.name,
    attrs.name,
    "未命名活动",
  ]));
  const id = String(firstDefined([
    offer && offer.offerId,
    offer && offer.id,
    offer && offer.promotionId,
    attrs.offerid,
    attrs.offerId,
    attrs.id,
    attrs.promotionId,
    title,
    url,
  ]));
  const completeRaw = firstDefined([offer && offer.complete, attrs.complete]);
  const lockedRaw = firstDefined([offer && offer.locked, attrs.locked]);
  const pointProgress = toInt(firstDefined([
    offer && offer.pointProgress,
    attrs.pointProgress,
    offer && offer.progress,
    attrs.progress,
  ]));
  const pointProgressMax = toInt(firstDefined([
    offer && offer.pointProgressMax,
    attrs.pointProgressMax,
    offer && offer.max,
    attrs.max,
  ]));
  const promotionType = String(firstDefined([
    offer && offer.promotionType,
    attrs.promotionType,
    offer && offer.type,
    attrs.type,
  ])).toLowerCase();

  return {
    id,
    title,
    url,
    completeRaw,
    lockedRaw,
    pointProgress,
    pointProgressMax,
    promotionType,
    isIncomplete: boolFalse(completeRaw),
    isComplete: boolTrue(completeRaw),
    isLocked: boolTrue(lockedRaw),
  };
}

function collectDailyActivityOffers(data) {
  const flyout = (data && (data.flyoutResult || data.dashboard)) || {};
  const roots = [
    data || {},
    flyout,
    flyout.userStatus || {},
    (data && data.userInfo) || {},
  ];
  const offers = [];

  roots.forEach((root) => {
    offers.push.apply(offers, toArray(root.dailySetPromotions));
    offers.push.apply(offers, toArray(root.morePromotions));
  });

  const seen = {};
  return offers
    .map(normalizeOffer)
    .filter((offer) => {
      const key = offer.id || offer.url || offer.title;
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
}

function isSimpleClickOffer(offer) {
  if (!offer.isIncomplete) return false;
  if (offer.isLocked) return false;
  if (offer.pointProgressMax <= 0) return false;
  if (!offer.url) return false;
  for (let i = 0; i < SKIP_PROMOTION_TYPES.length; i++) {
    if (offer.promotionType.indexOf(SKIP_PROMOTION_TYPES[i]) !== -1) return false;
  }
  return true;
}

function extractSimpleClickOffers(data) {
  return collectDailyActivityOffers(data).filter(isSimpleClickOffer);
}

function findOfferStatus(data, target) {
  const offers = collectDailyActivityOffers(data);
  for (let i = 0; i < offers.length; i++) {
    const offer = offers[i];
    if ((target.id && offer.id === target.id) || (target.url && offer.url === target.url)) {
      return offer;
    }
  }
  return null;
}

async function fetchRewardsSnapshot(cookie) {
  for (let i = 0; i < REWARDS_USERINFO_URLS.length; i++) {
    const url = `${REWARDS_USERINFO_URLS[i]}?t=${Date.now()}`;
    try {
      const res = await $.http.get({
        url,
        headers: {
          "User-Agent": DESKTOP_UA,
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          "Cache-Control": "no-cache",
          "X-Requested-With": "XMLHttpRequest",
          Cookie: cookie,
        },
      });
      const sc = res.status || res.statusCode || 0;
      const data = safeJsonParse(res.body);
      if (sc === 401 || sc === 403 || String(res.body || "").indexOf("Unauthorized") !== -1) {
        throw new Error(`Cookie失效: HTTP ${sc}`);
      }
      if (data && typeof data === "object") return data;
    } catch (e) {
      if (i === REWARDS_USERINFO_URLS.length - 1) throw e;
    }
  }
  return null;
}

async function openOfferDestination(offer, cookie) {
  const res = await $.http.get({
    url: offer.url,
    headers: {
      "User-Agent": DESKTOP_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      Referer: "https://rewards.bing.com/",
      Cookie: cookie,
    },
  });
  const sc = res.status || res.statusCode || 0;
  if (sc && (sc < 200 || sc >= 400)) throw new Error(`HTTP ${sc}`);
}

function buildSummary(total, attempted, completed, failed, stillPending, unknown) {
  const lines = [
    `识别活动: ${total}`,
    `已请求: ${attempted}/${total}`,
    `确认完成: ${completed}`,
  ];
  if (failed > 0) lines.push(`请求失败: ${failed}`);
  if (stillPending.length) {
    lines.push(`仍未完成: ${stillPending.slice(0, 3).join("、")}${stillPending.length > 3 ? "..." : ""}`);
  }
  if (unknown.length) {
    lines.push(`无法确认: ${unknown.slice(0, 3).join("、")}${unknown.length > 3 ? "..." : ""}`);
  }
  return lines.join("\n");
}

async function main() {
  const cookie = $.getdata("BING_COOKIES") || "";
  if (!cookie) {
    await $.msg($.name, "缺少 Cookie", "请先通过抓包脚本获取并保存 BING_COOKIES。");
    return;
  }

  const maxTasks = Math.max(1, Number($.getdata("BING_ACTIVITY_MAX") || 8));
  const waitMin = Math.max(1, Number($.getdata("BING_ACTIVITY_WAIT_MIN") || 4));
  const waitMax = Math.max(waitMin, Number($.getdata("BING_ACTIVITY_WAIT_MAX") || 7));

  const before = await fetchRewardsSnapshot(cookie);
  const offers = extractSimpleClickOffers(before).slice(0, maxTasks);
  if (!offers.length) {
    await $.msg($.name, "无需执行", "未发现可用的简单点击类每日活动。");
    return;
  }

  let attempted = 0;
  let completed = 0;
  let failed = 0;
  const stillPending = [];
  const unknown = [];

  for (let i = 0; i < offers.length; i++) {
    const offer = offers[i];
    try {
      $.log(`打开活动: ${offer.title} (${offer.pointProgressMax} pts)`);
      await openOfferDestination(offer, cookie);
      attempted++;
      await sleep(randInt(waitMin, waitMax) * 1000);

      const after = await fetchRewardsSnapshot(cookie);
      const status = findOfferStatus(after, offer);
      if (status && (status.isComplete || (status.pointProgressMax > 0 && status.pointProgress >= status.pointProgressMax))) {
        completed++;
      } else if (status && status.isIncomplete) {
        stillPending.push(offer.title);
      } else {
        unknown.push(offer.title);
      }
    } catch (e) {
      failed++;
      $.log(`活动失败: ${offer.title} - ${e && e.message ? e.message : e}`);
    }
  }

  await $.msg($.name, "执行完成", buildSummary(offers.length, attempted, completed, failed, stillPending, unknown));
}

function Env(name) {
  this.name = name;
  this.getdata = (k) => $persistentStore.read(k);
  this.setdata = (v, k) => $persistentStore.write(v, k);
  this.log = (m) => console.log(`[${name}] ${m}`);
  this.msg = async (t, s, m, opts) => {
    const isUrgent = m.includes("Cookie") || m.includes("失效") || m.includes("401") || m.includes("异常") || m.includes("失败") || m.includes("Error") || m.includes("缺少");
    let action = {};
    if (typeof opts === "string") {
      action["open-url"] = opts;
    } else if (opts && typeof opts === "object") {
      action = { ...action, ...opts };
    }

    const isCredentialIssue = m.includes("Cookie") || m.includes("失效") || m.includes("缺少") || m.includes("401");
    if (isCredentialIssue && !action["open-url"]) action["open-url"] = getBingShortcutUrl();

    // Loon 通知点击跳转字段是 openUrl（camelCase）；open-url 仅作兼容，两个都写才能在各版本生效
    if (action["open-url"] && !action.openUrl) action.openUrl = action["open-url"];
    if (action.openUrl && !action["open-url"]) action["open-url"] = action.openUrl;

    if (isUrgent || (opts && opts.forceLoon)) {
      $notification.post(t, s, m, action);
      this.log("Sent Loon Notification");
    }
    this.log(`${s}\n${m}`);

    const arg = typeof $argument !== "undefined" ? $argument : {};
    const tgUserId = arg.TG_USER_ID || this.getdata("TG_USER_ID");
    const tgBotToken = arg.TG_BOT_TOKEN || this.getdata("TG_BOT_TOKEN");
    const barkPush = arg.BARK_PUSH || this.getdata("BARK_PUSH");
    const tgEnable = arg.TG_Notify_Enable !== undefined ? arg.TG_Notify_Enable : this.getdata("TG_Notify_Enable");
    const barkEnable = arg.Bark_Notify_Enable !== undefined ? arg.Bark_Notify_Enable : this.getdata("Bark_Notify_Enable");
    const isTgOn = tgEnable !== false && String(tgEnable) !== "false";
    const isBarkOn = barkEnable !== false && String(barkEnable) !== "false";
    const promises = [];

    if (isTgOn && tgUserId && tgBotToken) {
      const url = `https://api.telegram.org/bot${tgBotToken}/sendMessage`;
      const body = JSON.stringify({ chat_id: tgUserId, text: `${t}\n\n${s}\n${m}`, parse_mode: "Markdown" });
      promises.push(new Promise((resolve) => {
        $httpClient.post({ url, body, headers: { "Content-Type": "application/json" } }, () => resolve());
      }));
    }

    if (isBarkOn && barkPush) {
      let url = barkPush;
      if (!url.startsWith("http")) url = `https://api.day.app/${url}`;
      if (!url.endsWith("/")) url += "/";
      url += `${encodeURIComponent(t)}/${encodeURIComponent(s + "\n" + m)}`;
      promises.push(new Promise((resolve) => {
        $httpClient.get({ url }, () => resolve());
      }));
    }

    await Promise.all(promises);
  };
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

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    collectDailyActivityOffers,
    extractSimpleClickOffers,
    isSimpleClickOffer,
    normalizeOffer,
  };
} else {
  main()
    .catch((e) => $.msg($.name, "运行异常", String(e && e.message ? e.message : e)))
    .finally(() => $.done());
}
