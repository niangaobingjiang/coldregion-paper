# 冰川信使

河冰与寒区水文论文的每日追踪网页。期刊列表已按 `工作簿(79).xlsx` 导入，共 64 本。

## 本地启动

在此目录运行：

```powershell
npm start
```

然后打开 `http://localhost:4173`。

## 使用方式

- 点击“获取最新文献”，从 OpenAlex 检索近 120 天发布的河冰、冰塞、降雪、积雪、冰川、海冰、冻土、冻融、冰冻圈水文，以及祁连山和青藏高原寒区水文相关文章；结果只保留已启用期刊。
- 文献板块分类综合使用论文标题、摘要、OpenAlex 关键词与主题标签，而不是只依赖标题。
- 每日结果不设篇数上限。初始结果后可点击“加载更多匹配文章”继续检索下一批。
- 在“期刊来源”中启用或暂停任意期刊，修改会保存在当前浏览器。
- 在“推送设置”中设定每日时间，并点击“开启浏览器提醒”。浏览器保持打开时，网页会在该时间检查最新文献并发出通知。

## 公开部署

这是纯静态网站，可直接部署到 GitHub Pages、Cloudflare Pages、Vercel 或 Netlify。项目目前没有连接任何远程仓库或托管账户；连接后即可获得公开网址。

## 每日邮件推送（个人网易邮箱）

仓库已包含每日 08:30（北京时间）运行的 GitHub Actions 任务，并在 08:45 运行一次备用检查；同一天只会发送一封邮件。请先登录 [网易邮箱](https://mail.163.com/)，在 **设置 → POP3/SMTP/IMAP** 中开启 SMTP 服务并生成客户端授权码；然后在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 中添加以下三个 Secrets：

- `SMTP_FROM_EMAIL`：`19975912758@163.com`
- `SMTP_TO_EMAIL`：`19975912758@163.com`
- `NETEASE_SMTP_AUTH_CODE`：网易 SMTP 客户端授权码（不是邮箱登录密码）

添加后可在 Actions 中运行 **Send daily literature digest** 的 `Run workflow` 立即发送一封测试邮件。任务通过 `smtp.163.com:465` 的 SSL/TLS 连接发送。

## 关于真正的后台推送

浏览器在完全关闭后，静态网页无法自行运行。若需要在关闭网页后仍每天推送，需要部署一个定时后端（例如 GitHub Actions、Cloudflare Workers 或 Vercel Cron）并配置 Web Push 或电子邮件服务；前端已经将期刊、主题和时间设置好，可作为该部署的界面。
