# ✦ 生日贺卡 · 蒙昊

一个不需要构建的小网页：

- 背景是动态的像素烟花、星空和月亮；
- 标题会显示寿星的名字，并带一块像素风 `HAPPY BIRTHDAY`；
- 访客可以留下祝福，留言会变成弹幕在夜空中滚动；
- 「祝福墙」可以集中查看所有留言；
- 支持手机端、减少动态效果偏好，以及离线预览模式。

## 线上地址

**https://elevenx-1.github.io/birthday-card/**

当前有两套运行方式：

- **GitHub Pages + Supabase**：线上正式版，静态页面在 `docs/`，共享留言在 Supabase；
- **Node.js 本地版**：`public/` + `server.js`，留言保存在本地 `data/messages.json`。

## 快速开始（本地 Node 版）

需要 [Node.js](https://nodejs.org/) 18 或更高版本（使用内置模块，无需 `npm install`）。

```bash
cd birthday-fireworks
npm start
# 或者：node server.js
```

打开 <http://localhost:3000>。

终端还会打印局域网地址。把那个地址发给朋友（同一 Wi-Fi 下），或者部署到公网，大家就能一起留言了。

环境变量：

```bash
PORT=8080 HOST=0.0.0.0 DATA_DIR=./data node server.js
```

## 改成你想祝福的人

编辑 `public/config.js`：

```js
window.BIRTHDAY_CONFIG = {
  name: '小美',
  subtitle: '生日快乐，愿你的每一天都像烟花一样闪闪发光'
};
```

也可以不改文件，在链接里带参数：

```text
http://localhost:3000/?to=小美
```

`?to=` 的优先级高于 `config.js`，更适合把链接直接发给不同的人。链接参数会自动做 URL 编码。

## 留言数据

- 首次启动会自动创建 `data/messages.json`，并放入 6 条示例祝福；
- 新留言写入这个文件，最多保留最新 500 条；
- 想清空重来：停止服务，删除 `data/messages.json`，再启动即可；
- 想删掉某条留言：停止服务，编辑该 JSON 文件，再启动；
- 写入使用临时文件 + rename，避免写到一半损坏数据；单进程部署即可。

> 如果部署在会随时重置磁盘的免费容器里，请挂载持久卷到 `DATA_DIR`，否则留言会随重启消失。

## GitHub Pages + Supabase

线上版不需要 Node 服务：

- 前端静态文件在 `docs/`，由 GitHub Pages 托管；
- 配置在 `docs/config.js`，其中 `backend: 'supabase'`，并填写 Project URL 与 **anon public** key；
- 数据表结构在 `supabase/schema.sql`，匿名用户只能读取和新增，不能修改/删除；
- `anon public` key 可以公开在静态页面里，**不要**把 `service_role` key 写进前端。

更换 Supabase 项目时，只需要更新 `docs/config.js` 中的两项并重新推送。

## 接口

本地 Node 版接口：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/health` | 健康检查，返回留言数量 |
| `GET` | `/api/messages` | 获取全部留言 |
| `POST` | `/api/messages` | 新增留言，JSON：`{ "name": "...", "text": "..." }` |

线上 Supabase 版直接使用 REST：

```text
GET  {Project URL}/rest/v1/messages
POST {Project URL}/rest/v1/messages
```

服务端/数据库限制：

- 名字最多 16 个字符，不填则为「匿名旅人」；
- 留言最多 80 个字符，纯文本展示；
- 只输出纯文本，不解析 HTML/Markdown。

## 离线预览

直接用浏览器打开 `public/index.html` 也能看到完整效果。此时没有共享后端：

- 会显示示例祝福；
- 自己写的祝福只保存在本机 `localStorage`；
- 页面会明确提示「本地预览 / 离线预览」。

这只是预览方式，正式分享请运行 Node 服务。

## 部署到公网

这是一个普通 Node HTTP 服务，可以放在任何支持 Node 的服务器或容器平台：

```bash
PORT=3000 HOST=0.0.0.0 node server.js
```

### 临时分享（最快）

本机已经运行着服务时，可以用 SSH 反向隧道开一个临时公网地址：

```bash
ssh -T -R 80:127.0.0.1:3000 nokey@localhost.run
```

终端会打印一个 `https://….lhr.life` 地址，手机和电脑都能直接打开。

注意：

- 这个地址只在命令运行期间有效；关闭终端、电脑休眠或退出程序后就会失效；
- 每次重新连接通常会得到不同的地址；
- 免费隧道有带宽和连接数限制，适合临时分享，不适合长期对外服务。

### Docker / 长期部署

仓库自带 `Dockerfile`，留言目录通过 volume 持久化：

```bash
docker build -t birthday-fireworks .
docker run -d --name birthday-fireworks \
  -p 3000:3000 \
  -v birthday-data:/app/data \
  birthday-fireworks
```

部署到 Render、Railway、Fly.io 或 VPS 时，务必把持久卷挂载到 `/app/data`（或通过 `DATA_DIR` 指定其他目录），否则容器重启后留言会丢失。公网部署建议配好 HTTPS。

前面套 Nginx / Caddy 反向代理时：

- 把持久卷挂到 `data/`；
- 如果代理会改写来源 IP，请确认 `X-Forwarded-For` 的信任边界（限流只是防刷，不承担安全职责）；
- 站点没有后台和删除接口，删除留言需要直接编辑数据文件。

## 项目结构

```text
birthday-fireworks/
├── server.js            # 内置模块实现的静态服务 + 留言 API
├── package.json
├── Dockerfile           # 长期部署用，挂载 /app/data
├── README.md
├── public/
│   ├── index.html       # 页面结构
│   ├── style.css        # 像素风、夜空、弹幕、移动端样式
│   ├── app.js           # 烟花引擎、弹幕、留言交互（Node/Supabase 双后端）
│   ├── config.js        # 寿星名字和祝福语
│   └── favicon.svg
├── docs/                # GitHub Pages 静态站点
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   ├── config.js        # 线上 Supabase 配置
│   └── favicon.svg
├── supabase/
│   └── schema.sql       # 留言表 + RLS 策略
└── data/
    └── messages.json    # 本地 Node 版留言
```

## 小细节

- 右上角的 `+` 按钮会放一场更盛大的烟花；
- 右上角可以开关声音（默认关闭，需要点击后才启用）；
- 按 `Esc` 可以关闭祝福墙；
- 如果系统开启了「减少动态效果」，烟花和星星会相应收敛。

祝你生日快乐，也祝每一句祝福都能被看见。 ✦
