/**
 * 必应 App 签到 (Loon Task)
 * 依赖抓包得到的 BING_APP_TOKEN (Bearer ...)
 *
 * 运行方式:
 * - Loon -> 脚本 -> 定时任务 (cron) 或手动运行
 *
 * 可选配置 (persistent store / BoxJS):
 * - BING_APP_TOKEN: Bearer ...
 * - BING_UA_MOBILE / BING_APP_UA
 * - BING_APP_ID (默认 SAIOS/32.6.431215001)
 * - BING_APP_PARTNER_ID (默认 startapp)
 * - BING_APP_COUNTRY (默认 CN)
 */

const $ = new Env("必应 App 签到");
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

const DEFAULTS = {
  ua: "BingChina/32.6.431215001 (com.microsoft.binga; build:431215001; iOS 27.2.0) Alamofire/5.10.2",
  appId: "SAIOS/32.6.431215001",
  partnerId: "startapp",
  country: "CN",
  authority: "prod.rewardsplatform.microsoft.com",
};

function uuidv4() {
  const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
  // Good enough for request id; rewards API doesn't require crypto UUID
  return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
}

function safeJsonParse(text) {
  if (!text || typeof text !== "string") return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

async function main() {
  const arg = typeof $argument !== "undefined" ? $argument : {};
  const checkinEnabledRaw =
    arg.Bing_Checkin_Enable !== undefined ? arg.Bing_Checkin_Enable :
    (arg.BING_CHECKIN_ENABLE !== undefined ? arg.BING_CHECKIN_ENABLE : true);
  const checkinEnabled = checkinEnabledRaw !== false && String(checkinEnabledRaw) !== "false";

  if (!checkinEnabled) {
    $.log("⏭️ Bing App 签到开关已关闭，跳过执行");
    return;
  }

  const DEFAULT_TOKEN = "Bearer EwDYAzyFBAAUVD0Ln4oP8rsRh+kUrZnF9kveuK8AAfOn8BRfNED+FWCsUb/mnIuuiyg8BdwsuKnUZlXtGvr+Y1C6Xgu5u6ZBXyBcOJeRdrLP6DTE9F4XFSmyQFJKxAqvX1606pLV/K90OEAL1P/MYxrPNf9/HEsIeLXibuEA6cDo2fQ9QUMbLghfOVnkCOCFB6tj3Ttvk1MZZSsbdZdL5vx6od3PK67d3rS3gbEB01ZL80rybCDpILxTxbePkj0tiRLCIAS2RWjh8BZn9/H25DT4xofyfXsA+ft5NClEh0BFCShsRR3c9guG7NuJRj66C++rVrQAp7/D8piUioPOfPTaLAY4Bq78e5k595DKrI4cR6tmbBNrxjiSLQWbFwgQZgAAEMT6WB9T/HjutF+XcjnyNPGgAs4/u+8AxNYMkiSYfrLCE5ahkLPcefpqAEtLHY9np5b2aI2ic0xfE9cbemyBMZz1o6zRZ/Nt7+0YT0qC8Bs4veu0RpH+W/dpm9eWGAmns3FW8zFopEJosTG8Iq0fDdHjkjtMpSRwDkbQy7HFovnL7durckzSnwMRqw4Swa0RvKz2t2eX12twnhhPmyfVd5K9RXFcwOyFR8aeXCAdw98wgrEjx0GvCIgVHac5pF+oywV09mrQTucB3/Zmi3y41I5rn2DTA0dur5opGM4XRwiZwZ+5EzSTkJXpGEAcercfyEVQEdRj8weJTZtd6CC6sd+k0Fh7SN3IjEzrCkBkcy82R//uBSLFQ5JfpwYVoLClIumKCgGqmlgJ5vlqu4hiqomyo+44NXgxIUp4tdyKLF+RjDyZBIxj2DXYQh9W+QbCZNuQLnZmB3Y2BrsUHFaEqJ16KbkqER9xV7UV1++seWWtdPfmxMwAQzaAX+avExeDkS8XOLCb4kt7PP8IJvvaZUj5uWl4Uk5uxJ7s271NoZ6dR+UDpBl7RwOkt3qBR7fYk1VU3zjyvrW6z+fAQdoKaGeLFOnhPARp3RUyTcj28aa8C7Hk9zI83fBierqc5nZ54iD5pHUpuKMzRJn+qaLao5p/o2nESonxeSWwhwjhzCBwNvT0mbfxvdtLTMPcFXKfQLJQAJMBoR34JMK5z0fS7k6KT098ivFvxU20cNZ4ILu3h2EiIRqQdkpLfq5YuMCRoWqgJRgk7I/syVqJJVzFzBZf7YrkNR7dvGLV5iwk/+KVkYw/GPVHmPkp2Juu7sAw1PJo/Vp/sdV4tOU0kvfYDIx4XHPVoU0QHOLqq7V5ulDbPQONJdetnsbnW19SvX9Wo3V+Ale3JvWpkz2BIO/szoNGdc0C";
  let token = $.getdata("BING_APP_TOKEN") || DEFAULT_TOKEN;
  if (!token || !token.startsWith("Bearer ")) {
    await $.msg($.name, "缺少 BING_APP_TOKEN", "请先通过必应 App 访问积分中心自动抓包获取。");
    return;
  }

  let ua = $.getdata("BING_APP_UA") || $.getdata("BING_UA_MOBILE") || DEFAULTS.ua;
  if (!ua || ua.includes("iOS 26") || ua.includes("iOS 25") || !ua.includes("Alamofire")) {
    ua = DEFAULTS.ua;
    $.setdata(DEFAULTS.ua, "BING_APP_UA");
    $.setdata(DEFAULTS.ua, "BING_UA_MOBILE");
  }
  const appId = $.getdata("BING_APP_ID") || DEFAULTS.appId;
  const partnerId = $.getdata("BING_APP_PARTNER_ID") || DEFAULTS.partnerId;
  const country = $.getdata("BING_APP_COUNTRY") || DEFAULTS.country;

  const url = `https://${DEFAULTS.authority}/dapi/me/activities`;
  const body = {
    id: uuidv4(),
    channel: "SAIOS",
    attributes: {},
    type: 103,
    risk_context: {},
    country: "cn",
    amount: 1,
  };

  let activeToken = token;
  let res = await $.http.post({
    url,
    headers: {
      "User-Agent": ua,
      "Content-Type": "application/json",
      Authorization: activeToken,
      "x-rewards-appid": appId,
      "x-rewards-country": country,
      "x-rewards-partnerid": partnerId,
      "x-rewards-language": "zh-hans",
      "x-rewards-flights": "rwgobig",
      "x-rewards-ismobile": "true",
    },
    body: JSON.stringify(body),
  });

  let sc = res.status || res.statusCode || 0;

  // 如果本地保存的 Token 返回 401，且不等于内置最新 Token，自动切换最新内置 Token 重试自愈
  if ((sc === 401 || (res.body && String(res.body).includes("Unauthorized"))) && activeToken !== DEFAULT_TOKEN) {
    $.log("⚠️ 本地存储的 BING_APP_TOKEN 已失效(401)，正在尝试使用内置最新 Token 重试自愈...");
    activeToken = DEFAULT_TOKEN;
    res = await $.http.post({
      url,
      headers: {
        "User-Agent": ua,
        "Content-Type": "application/json",
        Authorization: activeToken,
        "x-rewards-appid": appId,
        "x-rewards-country": country,
        "x-rewards-partnerid": partnerId,
        "x-rewards-language": "zh-hans",
        "x-rewards-flights": "rwgobig",
        "x-rewards-ismobile": "true",
      },
      body: JSON.stringify(body),
    });
    sc = res.status || res.statusCode || 0;
    if (sc === 200) {
      $.log("✅ 内置最新 Token 验证成功，已自动更新本地存储 BING_APP_TOKEN！");
      $.setdata(activeToken, "BING_APP_TOKEN");
    }
  }

  const data = safeJsonParse(res.body);

  if (sc === 401 || (res.body && String(res.body).includes("Unauthorized"))) {
    await $.msg($.name, "❌ Token 失效 (401)", "接口返回 401/Unauthorized。点本通知可直接唤起必应 App，进入「我 -> 积分中心」，Loon 将自动截获最新 Token。");
    return;
  }

  if (!data) {
    await $.msg($.name, "❌ 返回异常", `status=${sc}\n${String(res.body || "").slice(0, 200)}`);
    return;
  }

  const activity = data.response && data.response.activity ? data.response.activity : {};
  const points = Number(activity.p || 0);
  const balance = data.response && data.response.balance ? data.response.balance : "未知";

  if (points > 0) {
    await $.msg($.name, "✅ 签到成功", `获得 +${points} pts\n余额: ${balance}`);
    return;
  }

  if (activity.c === 1) {
    await $.msg($.name, "ℹ️ 今日已签到", `余额: ${balance}`);
    return;
  }

  // 成功但 0 分：通常也是已完成/封顶
  await $.msg($.name, "ℹ️ 请求成功(0分)", `余额: ${balance}`);
}

// --- minimal Env for Loon ---
// --- minimal Env for Loon ---
function Env(name) {
  this.name = name;
  this.getdata = (k) => $persistentStore.read(k);
  this.setdata = (v, k) => $persistentStore.write(v, k);
  this.log = (m) => console.log(`[${name}] ${m}`);

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

    // === 2. 读取通知凭据 (通过 $argument.varname 访问) ===
    // Loon 官方语法: argument=[{var1},{var2}] → 脚本中用 $argument.var1 读取
    const arg = typeof $argument !== "undefined" ? $argument : {};
    const tgUserId = arg.TG_USER_ID || this.getdata("TG_USER_ID");
    const rawTgToken = arg.TG_BOT_TOKEN;
    const tgBotToken = (rawTgToken && !rawTgToken.includes("***")) ? rawTgToken : this.getdata("TG_BOT_TOKEN");
    const barkPush = arg.BARK_PUSH || this.getdata("BARK_PUSH");
    const tgEnable = arg.TG_Notify_Enable !== undefined ? arg.TG_Notify_Enable : this.getdata("TG_Notify_Enable");
    const barkEnable = arg.Bark_Notify_Enable !== undefined ? arg.Bark_Notify_Enable : this.getdata("Bark_Notify_Enable");

    // 调试输出
    this.log(`[DEBUG] $argument type: ${typeof $argument}`);
    this.log(`[DEBUG] TG_USER_ID: ${tgUserId ? String(tgUserId).substring(0, 10) + "..." : "未设置"}`);
    this.log(`[DEBUG] TG_BOT_TOKEN: ${tgBotToken ? String(tgBotToken).substring(0, 15) + "..." : "未设置"}`);
    this.log(`[DEBUG] BARK_PUSH: ${barkPush ? String(barkPush).substring(0, 30) + "..." : "未设置"}`);
    this.log(`[DEBUG] TG_Enable: ${tgEnable}, Bark_Enable: ${barkEnable}`);

    // switch 类型在 Loon 中返回 true/false 布尔值
    const isTgOn = tgEnable !== false && String(tgEnable) !== "false";
    const isBarkOn = barkEnable !== false && String(barkEnable) !== "false";

    const promises = [];

    // === 4. Telegram 通知 ===
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

    // === 5. Bark 通知 ===
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

  this.http = {
    get: (opts) =>
      new Promise((resolve, reject) =>
        $httpClient.get(opts, (err, resp, body) =>
          err ? reject(err) : resolve({ status: resp.status, statusCode: resp.status, headers: resp.headers, body }),
        ),
      ),
    post: (opts) =>
      new Promise((resolve, reject) =>
        $httpClient.post(opts, (err, resp, body) =>
          err ? reject(err) : resolve({ status: resp.status, statusCode: resp.status, headers: resp.headers, body }),
        ),
      ),
  };
  this.done = () => $done({});
}

main()
  .catch((e) => $.msg($.name, "❌ 运行异常", String(e && e.message ? e.message : e)))
  .finally(() => $.done());
