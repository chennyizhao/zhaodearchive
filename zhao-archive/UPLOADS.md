# 审美积累图纸上传

## 本地预览

从仓库根目录启动预览。已运行的旧预览服务需要重启才能接收上传请求。

```powershell
node zhao-archive/build.mjs --preview
node zhao-archive/serve-preview.mjs
```

打开 [上传图纸](http://127.0.0.1:4173/zhaodearchive/aesthetic/upload/)，选文件、拖入或粘贴 JPG、PNG。单张上限 20 MB。补齐条目时，从「收藏条目」选择对应图片，名称、分类和原帖会自动带入。保存草稿后，可以刷新查看并下载原图。

本地服务只监听 `127.0.0.1`。每份草稿的原图和资料保存在 `zhao-archive/.aesthetic-drafts/`，这个目录在 Git 跟踪及站点产物之外。换浏览器但仍使用同一个服务时，已保存的草稿仍可查看。

## 从草稿到公开档案

确认图序、来源、署名和公开展示许可后，维护者将原图从草稿复制到 `档案库/审美积累/`，并更新 `aesthetic-collection.json` 的文件名、来源和许可状态。运行预览构建，在 `dev` 核对缩略图、原图放大、分类和来源。收到发布确认后，按原工作流合并到 `main`。保存草稿和正式发布是两项操作。

## 线上管理员服务

将同一服务部署到支持 Node.js 22 或以上、HTTPS 和持久磁盘的环境。启动命令为 `node zhao-archive/serve-upload.mjs`，站点的公开浏览继续使用 GitHub Pages。

| 服务端环境变量 | 值 |
|---|---|
| `ZHAO_ARCHIVE_UPLOAD_ORIGIN` | 管理服务的 HTTPS 来源，例如 `https://archive-admin.example.com`，只填域名部分 |
| `ZHAO_ARCHIVE_UPLOAD_PASSWORD` | 管理员账号 `admin` 的随机长密码，至少 24 字符，由托管平台的密钥设置保存 |
| `ZHAO_ARCHIVE_UPLOAD_DRAFT_DIR` | 用于保存草稿的持久磁盘绝对路径，位于站点产物目录之外 |
| `ZHAO_ARCHIVE_UPLOAD_PORT` | 可选。默认使用平台提供的 `PORT`，否则用 4174 |

对外只提供 HTTPS，代理保持请求的 Host。管理员先登录，再访问 `/zhaodearchive/aesthetic/upload/`。服务验证同源上传，请求和凭据通过同一个 HTTPS 地址传送。部署验证完成后，可在站点正式构建环境设置 `ZHAO_ARCHIVE_AESTHETIC_UPLOAD_URL` 为管理员页面的完整 HTTPS 地址，向审美积累页添加入口。该值只包含网址。
