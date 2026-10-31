/**
 * 必应通知跳转诊断 v2 (Loon Generic Script)
 *
 * 背景：
 * - 2026-10-31 真机测试：bingsearch:// 无反应；bing:// 与 bingapp:// 报「打不开网页」（scheme 未注册）。
 * - 官方线索 1：https://cn.bing.com/.well-known/apple-app-site-association 里
 *   明确列了中国区必应 App `com.microsoft.binga`，但通用链接只对 `/?iba=1` 和 `/search?iba=1` 生效；
 *   `/apps/rewards*` 被显式排除（奖励页一律走浏览器）。
 * - 官方线索 2：必应 App 内部代号 sapphire（bundle 名含 com.microsoft.sapphire-ios），
 *   社区（r/shortcuts）报告 iOS 上 `sapphire://` 可用。
 *
 * 用法：Loon 里运行本脚本，会弹 5 条通知，逐条点，记下哪条真正打开了必应 App。
 *
 * 可选：Argument 里设 BING_OPEN_URL 则只测这一条。
 */

const CANDIDATES = [
  { label: "① 通用链接 ?iba=1", url: "https://cn.bing.com/?iba=1", hint: "官方 AASA 声明可打开必应 App" },
  { label: "② sapphire://", url: "sapphire://", hint: "必应内部代号 scheme" },
  { label: "③ sapphire://search", url: "sapphire://search?query=bing", hint: "带搜索参数的 sapphire" },
  { label: "④ 搜索页 ?iba=1", url: "https://cn.bing.com/search?q=bing&iba=1", hint: "通用链接搜索页" },
  { label: "⑤ 对照 cn.bing.com", url: "https://cn.bing.com/", hint: "预期停在 Safari（用于确认通知点击链路）" },
];

function main() {
  const arg = typeof $argument !== "undefined" && $argument ? $argument : {};
  const custom = arg.BING_OPEN_URL || arg.Bing_Open_URL;
  const list = custom ? [{ label: "自定义 BING_OPEN_URL", url: custom, hint: "来自 Argument" }] : CANDIDATES;

  list.forEach((item, i) => {
    $notification.post(
      "必应跳转测试 " + item.label,
      "点我试试",
      `${item.hint}\n${item.url}\n能打开必应 App 请把编号告诉我`,
      { openUrl: item.url, "open-url": item.url },
      i * 2000
    );
  });

  console.log(`[必应跳转测试 v2] 已发送 ${list.length} 条通知，逐条点击并把结果告诉用户`);
  $done();
}

main();
