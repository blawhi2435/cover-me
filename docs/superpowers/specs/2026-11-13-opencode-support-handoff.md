# 交接文件：coding-god 支援 opencode

日期：2026-11-13
分支：`feat/opencode-host-support`（從 `main` 的 `b1e9a80` 開出）
狀態：**設計已核准，實作尚未開始**（還沒有任何功能程式碼）

## 要做什麼

讓 opencode 2.x 的使用者也能安裝並完整使用 coding-god（dev-graph、dev-flow、code-review、git-commit、git-push、standard-coding-style 與五個 agent），Claude Code 使用者的行為不變。另外順帶調整 dev-graph 流程：使用者核准 spec 之後到 G7 總結之前，不再問使用者任何確認。

## 先讀這兩份

| 檔案 | 內容 |
|---|---|
| `docs/superpowers/specs/2026-11-13-opencode-support-graph-design.md` | 完整設計：調查結果、三種做法比較、各節設計、留給實作者決定的項目 |
| `docs/superpowers/specs/2026-11-13-opencode-support-design.md` | dev-flow 格式的實作 spec（Problem / Goal / Design / Affected files / Requirements / References），可直接給 `/dev-flow` 用。兩份有出入時以 graph design 為準 |

注意：`docs/` 在 `.gitignore` 裡，這三份文件（含本文件）是用 `git add -f` 強制加入這個分支的。

## 已經定案的決定（使用者親自決定）

1. **做法 A**：在 repo 根目錄 `opencode/` 做一個 opencode plugin（TypeScript，id `coding-god`）。它註冊現有的 `SKILL.md`（不複製）、提供轉換後的 agent、並提供跨 session 傳訊工具（`list_agents`、`send_message`、`launch_child`、`dispatch_anchor`）。
2. **範圍**：整條流程都要能在 opencode 上跑；只支援 opencode 2.x（`@opencode/cli`，≥ 2.2.7），不支援 1.x（`opencode-ai`）。
3. **權限**：opencode 子 session 用一般權限模式；`--auto` 等同 `bypassPermissions`，一律拒絕。
4. **安裝**：改寫 `.opencode/INSTALL.md` 與 README 的 opencode 段落為安裝新 plugin，並加遷移步驟刪除舊的 symlink（`~/.config/opencode/skills/` 裡指向 `~/.cover-me` 的）。安裝方式只留一種。
5. **dev-graph 流程調整（graph design 6b）**：G2 不再請使用者確認 repo／啟動指令，也不再請使用者說出權限模式；主 session 自行判斷。**G7（commit／PR 前的總結確認）保留**，G6 的兩個使用者例外也保留。

## 我（前一位）自己做的判斷，接手者可以推翻

- plugin 放 `opencode/`；模型用 `fast`／`strong` 兩個 plugin 選項對應 Claude 的 `sonnet`／`opus`，沒設定就沿用主 session 的模型。
- opencode 上用「plugin 在啟動子 session 時記錄的綁定」取代 `DEV_GRAPH_DISPATCHER` 環境變數（opencode 的 session 跑在共用背景服務裡，無法每個 session 各設環境變數）。
- 子 session 卡在權限詢問時，plugin 只通知主 session，由使用者到該子 session 裡核准。
- Claude Code 路徑不加任何偵測指令；只有 `**On opencode:**` 段落才判斷（看得到 plugin 的工具就走 opencode）。
- 版本 1.12.0 → 1.13.0；這次不發佈 npm。

## 目前進度

- [x] 調查 opencode 2.x 的能力
- [x] 設計文件寫完、經 reviewer 檢查、使用者核准
- [x] 實作 spec 寫完
- [x] 開分支 `feat/opencode-host-support`
- [x] dev-flow 跑到 Node 4：已產生 OpenSpec change `opencode-host-support`（proposal、design、specs、42 項 tasks）——**只存在原機器上**，見下方
- [ ] 實作（dev-flow Node 5 之後全部未做）
- [ ] 在 opencode 2.2.7 上實際驗證
- [ ] commit、PR

## 沒有進 git 的東西（只在原機器 `/home/jerry/my-project/cover-me`）

- `openspec/changes/opencode-host-support/`（`openspec` 被 `.gitignore` 忽略）。接手者重新跑 `/dev-flow` 時 Node 3 會從 spec 重新產生，不需要搬。
- `.devgraph-state.json`、`.devflow-repos.json`、`.devflow-state.json`：這次 dev-graph／dev-flow 執行的狀態檔，綁定原本的 session 名稱（dispatcher `cover-me-72`），**換 session 後不能沿用**。

## 怎麼接手

最簡單的方式是不要試著恢復原本的 dev-graph 執行，直接重新開始實作：

1. `git fetch && git checkout feat/opencode-host-support`
2. 確認前置條件：Claude Code ≥ 2.1.224、OpenSpec CLI（原機器是 2.0.0）、superpowers plugin、coding-god plugin。
3. 安裝 opencode 2.x 供驗證：`npm i -g @opencode/cli@latest`（**不是** `opencode-ai`，那是舊的 1.x）。
4. 在 repo 裡跑 `/dev-flow`，告訴它 spec 已經寫好並核准，路徑是 `docs/superpowers/specs/2026-11-13-opencode-support-design.md`，分支已經存在。或者想用 dev-graph 的話，重新跑 `/dev-graph` 並指向 graph design。
5. 如果在原機器上接手：先刪掉上面三個狀態檔，再開始。

## 已驗證的事實

- opencode 2.2.7 會替自己的 shell 設 `OPENCODE=1`、`AGENT=1`、`AI_AGENT=opencode`（從 binary 字串確認）。
- opencode 2.x 會讀 `.claude/skills` 等位置的 skill，但**不會**讀 Claude Code plugin 裡的 skill 與 agent。
- opencode 2.x 沒有跨 session 傳訊；session 預設跑在共用背景服務（`opencode service`）。
- CLI：`opencode run`（`--session`、`--title`、`--model`、`--agent`、`--auto`）、`opencode plugin add`、`opencode api`、`opencode service`。

## 還沒驗證、實作時要先確認的（都來自文件，沒有實測）

- plugin API 的實際用法：`ctx.tool.transform`、`ctx.skill.transform`、`ctx.session.create/prompt/synthetic`、`ctx.event.subscribe`、`ctx.storage`；tool 的 `execute` 是否真的拿得到呼叫者的 `sessionID`。
- 訊息要怎麼送進另一個 session，才能跟使用者輸入、工具輸出區分開（`synthetic` 或其他）。這是信任模型的關鍵。
- 有沒有「session 閒置」和「等待權限核准」的事件可訂閱。
- 能不能以指定的 cwd 建立 session。
- agent 能不能由 plugin 註冊（文件只看到 `update`／`remove`，沒有 `add`），不行的話要改用檔案或設定。
- `opencode plugin add` 能不能從 Git repo 的子目錄安裝；不行就用「clone + `plugins` 設定指向 `<clone>/opencode`」。
- opencode 有沒有 workspace trust 機制；skill id 能不能含 `:`。
- superpowers 與 OpenSpec 在 opencode 上的安裝方式與呼叫名稱。

## 注意事項

- 在 Claude Code 的 auto 權限模式下，執行 `opencode run --auto ...` 會被擋（理由：Create Unsafe Agents）。驗證時不要用 `--auto`（設計本來就禁止），必要時請使用者核准指令。
- 原機器上 opencode 沒有設定任何 provider 憑證，只有免費模型可用（例如 `opencode/big-pickle`）。
- 執行 `opencode api` 之類的指令會啟動背景服務，用完記得 `opencode service stop`。
- 現行安裝的 dev-graph 是 1.12.0，仍會在 G2 問確認；6b 的新流程要等這次改動合併、plugin 更新後才生效。
