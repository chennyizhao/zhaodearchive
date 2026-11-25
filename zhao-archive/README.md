# Zhao Archive 案例更新与发布

每个案例由仓库根目录的一份 Markdown 文案和「档案库」下的一个图片文件夹组成。发布后，GitHub 根据这两份材料更新首页、建筑师索引、分类、搜索和详情页。

## 1. 准备新案例的文案和图片

例如，新增案例的文件名为 `new-case.md`，就把它放在「网站生成」根目录，再把 JPG、JPEG 或 PNG 原图放在 `档案库/new-case/`。文件名主干使用小写英文字母、数字和连字符。放进该文件夹的每张支持格式的图片都会进入详情页图库。

```text
网站生成/
├─ new-case.md
├─ 档案库/
│  └─ new-case/
│     ├─ 01-cover.jpg
│     └─ 02-plan.png
└─ zhao-archive/
```

复制一份现有案例文案作为起点，或使用下面的模板。把占位内容改成真实资料，删除没有资料的可选字段，并以 UTF-8 保存为 `.md`。

```markdown
## 项目基本信息

- 项目名称：中文项目名（English Project Name）
- 设计机构：中文机构名（English Studio Name）
- 项目地点：城市、地区
- 设计年份：填写已确认的设计年份
- 建成年份：填写已确认的建成年份
- 首页图片：01-cover.jpg

## 项目分类

- 光线
- 剖面

## 笔记

在这里写 200 字以内的学习笔记。

## 个人笔记

有已审核的个人笔记时再填写这一节。

## 源网站网址

[原项目名称](https://example.com/)

## 图库

- 01-cover.jpg｜建筑外观
- 02-plan.png｜平面图
```

- 「设计机构」也可以写为「建筑设计」或「建筑师」。名称后括号中的英文用于英文界面和搜索。英文版地点、学习笔记和图注可在 `zhao-archive/edits.json` 中参照现有案例补充。
- 分类可写多项，支持结构、光线、尺度、剖面、平面、构造、材料及对应的英文分类。
- 「个人笔记」可选。网站在学习笔记下方显示非空的个人笔记，原文按纯文本呈现并保留换行。
- 「首页图片」和「图库」可选。图库清单中的图片优先按所列顺序展示，其余图片按文件名追加。省略「首页图片」时使用图库第一张。写入文案的文件名需与图片文件完全一致，包括扩展名和大小写。
- 如果素材文件夹已经有自己的名字，可在「项目基本信息」里加 `- 素材目录：文件夹名称`，填写「档案库」下面实际的文件夹名。

## 2. 更新已有案例

修改该案例原有的 Markdown，新增图片时放入原案例的素材文件夹。保持文案文件名稳定，原有详情页链接就会继续使用。替换或重命名图片时，同步核对「首页图片」和「图库」中的引用。首批四个案例的优先图片、双语图注和预览裁切还记录在 `zhao-archive/edits.json`，改动这些已选图片的文件名时也要同步更新那里。

## 3. 用 GitHub Desktop 发布

1. 在 GitHub Desktop 选中 Zhao Archive 仓库，确认发布分支为 `main`。如果首次在这台电脑使用，先克隆 GitHub 上的仓库，再在克隆后的目录里编辑。
2. 在 **Changes** 确认新增或修改的 Markdown 与图片都已勾选。在 **Summary** 输入「新增某某案例」一类容易识别的说明。
3. 点击 **Commit to main** 保存这组修改，再点击 **Push origin** 上传到 GitHub。
4. 打开 GitHub 仓库的 **Actions** 页面，查看最近一次 **Publish Zhao Archive**。构建和发布都成功后，刷新线上首页，打开新案例检查标题、封面和详情图库。

线上构建由 GitHub 执行。日常提交案例 Markdown、原始图片和用到的内容配置，生成的 `zhao-archive/dist/` 由发布流程打包。

## 4. 本地预览与排查

可从「网站生成」目录运行以下命令，使用 Node.js 22 或更新版本。

```powershell
node zhao-archive/build.mjs
```

看到 `Built … cases at …` 后，打开 [本地首页](dist/index.html)，或在浏览器按 **Ctrl + R** 刷新。Windows 使用系统自带的 Windows PowerShell 生成预览图，Linux 发布流程使用 ImageMagick。

要按正式子路径检查导航和「个人笔记」编辑布局，从仓库根目录运行以下命令，再打开 [本地子路径预览](http://127.0.0.1:4173/zhaodearchive/?lang=zh)。

```powershell
node zhao-archive/build.mjs --preview
node zhao-archive/serve-preview.mjs
```

详情页的「保存本机草稿」将内容保存在当前浏览器，并在本机预览中显示。已保存的草稿在刷新后恢复。预览产物位于 `zhao-archive/preview-dist/`，正式构建产物位于 `zhao-archive/dist/`。将审核后的个人笔记写入案例 Markdown 的「个人笔记」一节，再使用正式构建检查访客页面。

| 遇到的情况 | 检查位置 |
| --- | --- |
| 首页没有新案例 | 确认 Markdown 在仓库根目录，扩展名为 `.md`，文件名为小写英文字母、数字或连字符，并有「项目基本信息」标题。 |
| 构建报告找不到文件 | 核对素材文件夹、首页图或图库中的完整文件名，含大小写及扩展名。 |
| 本地有变化，线上没有 | 确认已经推送到 `main`，并在 GitHub **Actions** 打开最近一次运行查看构建与发布状态。 |

首次配置时，在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。发布工作流位于 [pages.yml](../.github/workflows/pages.yml)，也可以在 **Actions → Publish Zhao Archive** 手动运行。
