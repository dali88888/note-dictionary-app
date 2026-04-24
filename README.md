# 课堂中文速查 · note.neooccidental.com

> 面向中文非母语学习者的"课堂速查词典"。教师在课堂上即时查词，课后一键导出本节课所有查询为 PPT 供学生复习。

## 功能

- 输入任意中文词 → 选定目标语言（8 种预设 + 任意自由输入）→ 返回分点的多义释义
- 每个义项包含词性、释义、中文例句及例句翻译
- 全局拼音开关：开启时拼音显示在每个汉字正上方
- 查询自动按当天日期归档，并可手动开始/结束"课程"进一步分组
- 一键导出为 `.pptx`，每词一张幻灯片

## 技术栈

React 18 · Vite 5 · TypeScript 5 · Tailwind v4 · Zustand 5 · pptxgenjs 3 · Vercel Edge Function

## 本地开发

### 1. 安装

```bash
cd note-dictionary-app
npm install
```

### 2. 配置 AI 凭证

```bash
cp .env.local.example .env.local
# 编辑 .env.local，填入 GEMINI_API_KEY 或切换到 AI_PROVIDER=claude + ANTHROPIC_API_KEY
```

Gemini 免费 key：<https://aistudio.google.com/apikey>
Claude key：<https://console.anthropic.com/settings/keys>

### 3. 运行

纯前端开发（API 不可用）：

```bash
npm run dev
```

**要测试 `/api/translate`，必须使用 Vercel CLI：**

```bash
npm i -g vercel
vercel dev
```

`vercel dev` 会同时跑 Vite + Edge Function，并自动注入 `.env.local` 中的环境变量。

### 4. 构建

```bash
npm run build
npm run preview  # 本地预览构建后的静态产物
```

## 部署到 Vercel + 绑定 note.neooccidental.com

1. 将此文件夹推送到一个新的 GitHub repo（例如 `note-dictionary-app`）。
2. 登录 <https://vercel.com> → **Add New… → Project** → 导入该 repo。Vercel 会自动识别为 Vite 项目。
3. 在 Vercel 项目 **Settings → Environment Variables** 添加：
   - `AI_PROVIDER` = `gemini`
   - `GEMINI_API_KEY` = 您的 Gemini key
4. **Settings → Domains → Add Domain** 输入 `note.neooccidental.com`。Vercel 会显示需要添加的 DNS 记录（一般是 CNAME → `cname.vercel-dns.com`）。
5. 在您 `neooccidental.com` 的 DNS 服务商（如 Cloudflare）添加该 CNAME。
6. 等待 DNS 生效（通常 1-10 分钟）+ HTTPS 证书自动签发。

之后每次 `git push` 到 main 分支都会自动重新部署。

## 项目结构

```
api/
└── translate.ts              # Vercel Edge Function，Gemini/Claude 代理
src/
├── main.tsx
├── App.tsx                   # 两视图 tab 切换
├── index.css                 # Tailwind + ruby-style hanzi clusters
├── types/dictionary.ts       # Syllable / Meaning / DictionaryEntry / ClassSession
├── store/dictStore.ts        # Zustand persist（entries, sessions, prefs）
├── api/translateClient.ts    # 前端 fetch 封装
├── export/exportPptx.ts      # pptxgenjs 生成 .pptx（含 ruby 表格）
└── components/
    ├── Common/ChineseLine.tsx    # 拼音+汉字 ruby 渲染
    ├── Header/TopBar.tsx         # 顶部：拼音开关 / 语言 / 课程控制 / tab
    ├── Search/{SearchBox,ResultCard,SearchView}.tsx
    ├── Session/SessionBar.tsx    # 开始/结束手动课程
    ├── History/HistoryView.tsx   # 全部/按日期/按课程 + 选择导出
    └── UI/{Button,Toggle}.tsx
```

## 添加更多语言

`src/types/dictionary.ts` 中的 `PRESET_LANGUAGES` 常量。添加后下拉框自动包含。任何语言用户都可以通过"其他…"自由输入。

## 切换 AI Provider

- **Gemini**（推荐线上）：`AI_PROVIDER=gemini`，模型 `gemini-2.5-flash`，支持结构化 JSON 输出，速度快。
- **Claude**（推荐本地）：`AI_PROVIDER=claude`，模型 `claude-haiku-4-5-20251001`，质量稍高，成本略高。

切换后无需重启——`api/translate.ts` 每次请求都重新读取环境变量。

## Roadmap

- [ ] 导出为 Word / Markdown
- [ ] 收藏夹（标记重点词）
- [ ] 例句朗读（TTS）
- [ ] 多 provider 时自动 fallback
- [ ] 服务端限流（防滥用）
