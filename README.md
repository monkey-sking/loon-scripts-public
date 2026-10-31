# loon-scripts-public

公开分发用的 Loon 脚本镜像。

私有主仓库 `monkey-sking/loon-scripts` 的 raw 地址对匿名请求返回 404，Loon 无法下载脚本，
因此可用的脚本都从这里取。

## 安装（Loon）

插件地址（装一次，之后脚本跟着更新）：

```
https://raw.githubusercontent.com/monkey-sking/loon-scripts-public/main/_data/loon/BingTasks.plugin
```

或 jsDelivr 镜像（国内更稳）：

```
https://cdn.jsdelivr.net/gh/monkey-sking/loon-scripts-public@main/_data/loon/BingTasks.plugin
```

插件里的 TG / Bark 参数默认留空，需要自己在 Loon 的插件参数里填。

## 内容

- `_data/loon/bing_app_checkin_task.js` — 必应 App 签到
- `_data/loon/bing_app_read_task.js` — 必应自动阅读
- `_data/loon/bing_web_search_task.js` — 必应自动搜索
- `_data/loon/bing_daily_activity_task.js` — 必应每日活动
- `_data/loon/bing_notify_test.js` — 通知跳转诊断脚本（5 条候选）
- `_data/loon/BingTasks.plugin` — 上面任务的 Loon 插件收口
