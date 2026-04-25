# 课堂中文速查 · note.neooccidental.com

> 面向中文非母语学习者的"课堂速查词典"。教师在课堂上即时查词，课后一键导出本节课所有查询为 PPT 供学生复习。

## 功能

- 输入任意中文词 → 选定目标语言（8 种预设 + 任意自由输入）→ 返回分点的多义释义
- 每个义项包含词性、释义、中文例句及例句翻译
- 全局拼音开关：开启时拼音显示在每个汉字正上方
- **匿名即用**：进入网站即可立即查词，**无需登录**。注册是推荐项而非门槛
- 查询自动按当天日期归档，并可手动开始/结束"课程"进一步分组（仅注册用户）
- 一键导出为 `.pptx`，每词一张幻灯片（仅注册用户，需要历史记录）
- **可选登录**：邮箱+密码 / Google / GitHub；注册后获得云端私有词库
- **教师子账号**：教师角色可为不同学生建立子文件夹，分别管理各自的查词记录
- 所有用户数据云端持久化（Supabase）+ 行级安全（RLS）隔离

### 匿名 vs 注册用户

| 能力 | 匿名访客 | 注册用户 |
|---|---|---|
| 查词翻译 | ✅ | ✅ |
| 拼音开关 / 语言切换 | ✅ | ✅ |
| 查询历史持久化 | ❌（仅当前查询） | ✅ |
| 按日期/课程归档 | ❌ | ✅ |
| 导出 PPT | ❌（无历史可导） | ✅ |
| 教师管理学生 | — | ✅（teacher 角色） |

匿名用户每次新查询会替换上一条结果（无 localStorage 持久化）。顶部"登录 / 注册"按钮以及搜索框上方的可关闭横幅都会引导用户注册——横幅一次关闭后通过 localStorage 记住选择，不会反复打扰回访用户。

## 技术栈

React 18 · Vite 5 · TypeScript 5 · Tailwind v4 · Zustand 5 · pptxgenjs 3 · Vercel Edge Function · Supabase（Auth + Postgres + RLS）

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

### 3. 配置 Supabase（认证 + 数据库）

应用所有数据（用户、词库、课程、子账号）都存在 Supabase。本地与线上必须共用同一个 Supabase project，否则注册的账号在另一边登录不进去。

1. 注册 / 登录 <https://supabase.com> → **New Project**
2. 项目创建完成后，进入 **SQL Editor** → 新建 query → 把仓库里 `supabase/schema.sql` 全文粘贴进去 → Run。这会建好 5 张表（profiles / managed_students / entries / class_sessions / session_entries）+ 所有 RLS 策略 + 注册触发器。脚本是幂等的，重复运行无副作用。
3. 在 **Project Settings → API** 里复制两个值：
   - `Project URL`
   - `anon public`（也叫 publishable key）
4. 写到 `.env.local`：
   ```env
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGc...
   ```
5. **Authentication → Providers**：
   - **Email**：默认开启即可。生产环境建议保留 "Confirm email" 以防垃圾注册；开发时可临时关闭以便快速测试。
   - **Google / GitHub**：见下文 [OAuth 配置](#oauth-配置googlegithub)。

### 4. 运行

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

### 5. 构建

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
   - `VITE_SUPABASE_URL` = 您的 Supabase Project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = 您的 Supabase anon key
   - 服务端 `/api/translate` 在请求**带** Bearer token 时会校验 JWT（默认复用 `VITE_*` 两个变量，无需重复添加；如需分开管理可再加 `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`）。匿名请求不带 token，跳过校验直接放行——这是 v2 改为"注册可选"后的预期行为。
4. **Settings → Domains → Add Domain** 输入 `note.neooccidental.com`。Vercel 会显示需要添加的 DNS 记录（一般是 CNAME → `cname.vercel-dns.com`）。
5. 在您 `neooccidental.com` 的 DNS 服务商（如 Cloudflare）添加该 CNAME。
6. 等待 DNS 生效（通常 1-10 分钟）+ HTTPS 证书自动签发。
7. **回到 Supabase**：**Authentication → URL Configuration**，把 `Site URL` 设为 `https://note.neooccidental.com`，并在 `Redirect URLs` 里追加：
   ```
   https://note.neooccidental.com
   https://note.neooccidental.com/**
   http://localhost:5173        # 本地开发用
   http://localhost:5173/**
   ```
   不加这一步的话，OAuth/邮箱确认链接回跳时会被 Supabase 拒绝。

之后每次 `git push` 到 main 分支都会自动重新部署。

## OAuth 配置（Google / GitHub）

邮箱/密码注册不需要任何额外配置；只有想开启 Google 或 GitHub 一键登录时才需要做下面这套。两家流程类似——在第三方建一个 OAuth client，把 Client ID + Secret 填回 Supabase 的 Provider 设置即可。

**Supabase 给您的回调地址**（两边都要用到）：

打开 Supabase **Authentication → Providers → Google**（或 GitHub），页面上会显示一个 `Callback URL (for OAuth)`，形如：

```
https://<your-project-ref>.supabase.co/auth/v1/callback
```

复制下来备用。**这是写到 Google/GitHub 那边的回调，不是 note.neooccidental.com。**

### Google

1. 打开 <https://console.cloud.google.com/> → 新建 / 选择一个项目。
2. **APIs & Services → OAuth consent screen**：
   - User Type 选 `External` → Create。
   - 填 App name（如 `note.neooccidental.com`）、support email、developer email。
   - Scopes 步骤直接 Save（默认的 email + profile 够用）。
   - Test users 阶段：发布前只有这里列出的邮箱能登录，所以先把您自己加进去。**全部填完点 Save and continue → Back to dashboard**。如果想公开发布，点 `Publish App`。
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**：
   - Application type: `Web application`
   - Authorized JavaScript origins:
     - `https://note.neooccidental.com`
     - `http://localhost:5173`（本地开发用）
   - Authorized redirect URIs:
     - 粘贴前面从 Supabase 复制的 `https://<ref>.supabase.co/auth/v1/callback`
   - Create → 弹窗里显示 **Client ID** 和 **Client secret**，复制下来。
4. 回到 Supabase **Authentication → Providers → Google**：
   - 打开开关
   - 把 Client ID + Client secret 填进去
   - Save

### GitHub

1. 打开 <https://github.com/settings/developers> → **OAuth Apps → New OAuth App**。
2. 填表：
   - **Application name**: `note.neooccidental.com`
   - **Homepage URL**: `https://note.neooccidental.com`
   - **Authorization callback URL**: 粘贴前面从 Supabase 复制的 `https://<ref>.supabase.co/auth/v1/callback`
3. Register application → 进入应用页 → **Generate a new client secret**，把 Client ID + Secret 复制下来。
4. 回到 Supabase **Authentication → Providers → GitHub**：打开开关 → 填 Client ID + Secret → Save。

### 验证

1. 打开 `https://note.neooccidental.com`（或本地 `http://localhost:5173`）
2. 登录页面点 "用 Google 登录" / "用 GitHub 登录"
3. 走完 OAuth 流程后应自动回到首页且顶部显示已登录头像
4. 在 Supabase **Authentication → Users** 应能看到新用户

### 已知行为

- **OAuth 用户的 role 默认是 `student`**：邮箱/密码注册时会带 `role` 元数据，触发器读到后写进 `profiles`；OAuth 没有这个元数据，触发器 fallback 成 `student`。如果您本人想用 OAuth 登录又需要教师权限，可以在 Supabase **Table Editor → profiles** 里手动把自己那行的 `role` 改成 `teacher`，刷新页面即可看到学生切换器。
- **OAuth 用户的 display_name** 取邮箱 `@` 之前的部分。后续若要加"修改昵称"功能，只需写到 `profiles.display_name`。

## 项目结构

```
api/
└── translate.ts              # Vercel Edge Function；JWT 可选（匿名也允许）；带 token 时严格校验
supabase/
└── schema.sql                # 表 + RLS + on_auth_user_created 触发器（在 SQL Editor 跑一次）
src/
├── main.tsx
├── App.tsx                   # AuthGate + AuthModal + 两视图 tab + 数据云端 hydration
├── index.css                 # Tailwind + ruby-style hanzi clusters
├── types/dictionary.ts       # Syllable / Meaning / DictionaryEntry / ClassSession
├── auth/
│   ├── supabaseClient.ts     # createClient + detectSessionInUrl
│   ├── AuthContext.tsx       # 全局会话 + 登录弹窗状态（openAuthModal / closeAuthModal）
│   ├── passwordRules.ts      # 强密码校验
│   └── types.ts              # Profile / UserRole
├── store/dictStore.ts        # Zustand：匿名走内存、注册走云端 entries/sessions/managedStudents
├── api/translateClient.ts    # fetch /api/translate；有 session 时附带 Bearer，否则匿名调用
├── export/exportPptx.ts      # pptxgenjs 生成 .pptx（含 ruby 表格）
└── components/
    ├── Auth/
    │   ├── AuthGate.tsx              # 仅在 loading / config 缺失时阻塞；anon 与 authed 都直通
    │   ├── AuthModal.tsx             # 浮层登录/注册弹窗（任意位置 openAuthModal 触发）
    │   ├── LoginForm.tsx
    │   ├── SignupForm.tsx            # 强密码 + 角色选择
    │   ├── SignupPromptBanner.tsx    # 匿名访客的可关闭注册推荐横幅（搜索框上方）
    │   ├── OAuthButtons.tsx          # Google / GitHub 一键登录
    │   ├── PasswordStrengthIndicator.tsx
    │   └── LegacyImportDialog.tsx    # 旧 localStorage 数据一次性迁移到云端
    ├── Common/ChineseLine.tsx        # 拼音+汉字 ruby 渲染
    ├── Header/
    │   ├── TopBar.tsx                # 注册：拼音/语言/课程/学生切换/用户菜单；匿名：登录/注册按钮
    │   ├── UserMenu.tsx              # 当前账号 + 角色徽章 + 登出
    │   ├── StudentSwitcher.tsx       # 教师专用：当前是"自己"还是某子学生
    │   └── StudentManager.tsx        # 教师增删改子学生
    ├── Search/{SearchBox,ResultCard,SearchView}.tsx  # SearchView 顶部嵌入 SignupPromptBanner
    ├── Session/SessionBar.tsx        # 开始/结束手动课程
    ├── History/HistoryView.tsx       # 注册：全部/按日期/按课程 + 选择导出；匿名：引导注册的空状态
    └── UI/{Button,Toggle}.tsx
```

## 添加更多语言

`src/types/dictionary.ts` 中的 `PRESET_LANGUAGES` 常量。添加后下拉框自动包含。任何语言用户都可以通过"其他…"自由输入。

## 切换 AI Provider

- **Gemini**（推荐线上）：`AI_PROVIDER=gemini`，模型 `gemini-2.5-flash`，支持结构化 JSON 输出，速度快。
- **Claude**（推荐本地）：`AI_PROVIDER=claude`，模型 `claude-haiku-4-5-20251001`，质量稍高，成本略高。

切换后无需重启——`api/translate.ts` 每次请求都重新读取环境变量。

## Roadmap

- [ ] **服务端限流（重要，防匿名滥用）**：开放匿名后，per-user JWT 不再是滥用闸门。计划用 Vercel KV / Upstash 做 IP 级 rate-limit，或在前端加 Cloudflare Turnstile
- [ ] 自动出题 / 错题本 / 间隔复习（注册功能扩展）
- [ ] 导出为 Word / Markdown
- [ ] 收藏夹（标记重点词）
- [ ] 例句朗读（TTS）
- [ ] 多 provider 时自动 fallback
- [ ] OAuth 首次登录时弹窗让用户选择 teacher / student（避免手动改库）
- [ ] 个人资料编辑（昵称 / 角色 / 头像）
- [ ] 学生子账号也能直接登录（v1 仅由教师代管）
