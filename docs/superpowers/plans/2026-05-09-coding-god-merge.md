# coding-god Plugin 合併 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `cover-me` marketplace 中的 `git-workflow`、`code-review`、`standard-coding-style`、`dev-flow` 四個 plugin 合併成單一 `coding-god` plugin，原四個從 marketplace 下架。

**Architecture:** 用 `git mv` 把所有 skill 與 agent 搬到新的 `plugins/coding-god/` 目錄，保留檔案歷史；改寫 SKILL.md / agent 檔案中的 `<plugin>:<skill>` 限定引用為 `coding-god:<skill>`；更新 `marketplace.json`、`README.md`、`CLAUDE.md`；刪除舊 plugin 殘留資料夾。

**Tech Stack:** Bash, git, Markdown, JSON

**Spec:** `docs/superpowers/specs/2026-05-09-coding-god-merge-design.md`

---

## File Structure

合併後的目錄狀態：

```
plugins/coding-god/
  .claude-plugin/plugin.json       # 新建
  agents/
    dev-flow-implement.md          # 從 plugins/dev-flow/agents/ 搬遷
  skills/
    dev-flow/                      # 從 plugins/dev-flow/skills/ 搬遷
    code-review/                   # 從 plugins/code-review/skills/ 搬遷
    standard-coding-style/         # 從 plugins/standard-coding-style/skills/ 搬遷
    git-commit/                    # 從 plugins/git-workflow/skills/ 搬遷
    git-push/                      # 從 plugins/git-workflow/skills/ 搬遷
```

修改的檔案：

- `.claude-plugin/marketplace.json`
- `README.md`
- `CLAUDE.md`
- `plugins/coding-god/skills/dev-flow/SKILL.md`（搬遷後改寫引用）
- `plugins/coding-god/agents/dev-flow-implement.md`（搬遷後改寫引用）

刪除的檔案：

- `plugins/git-workflow/.claude-plugin/plugin.json` 及空資料夾
- `plugins/code-review/.claude-plugin/plugin.json` 及空資料夾
- `plugins/standard-coding-style/.claude-plugin/plugin.json` 及空資料夾
- `plugins/dev-flow/.claude-plugin/plugin.json` 及空資料夾

---

### Task 1: 建立 coding-god plugin 骨架

**Files:**
- Create: `plugins/coding-god/.claude-plugin/plugin.json`

- [ ] **Step 1: 建立目錄結構**

```bash
mkdir -p plugins/coding-god/.claude-plugin
mkdir -p plugins/coding-god/skills
mkdir -p plugins/coding-god/agents
```

- [ ] **Step 2: 寫入 plugin.json**

寫入 `plugins/coding-god/.claude-plugin/plugin.json`：

```json
{
  "name": "coding-god",
  "description": "Full-stack coding workflow — dev-flow, code review, coding style, and git",
  "version": "1.0.0"
}
```

- [ ] **Step 3: 驗證 JSON 格式**

Run: `python3 -m json.tool plugins/coding-god/.claude-plugin/plugin.json`
Expected: 印出格式化的 JSON，沒有錯誤。

- [ ] **Step 4: Commit**

```bash
git add plugins/coding-god/.claude-plugin/plugin.json
git commit -m "feat(coding-god): scaffold plugin manifest"
```

---

### Task 2: 用 git mv 搬遷五個 skill 與 agent

**Files:**
- Move: `plugins/git-workflow/skills/git-commit` → `plugins/coding-god/skills/git-commit`
- Move: `plugins/git-workflow/skills/git-push` → `plugins/coding-god/skills/git-push`
- Move: `plugins/code-review/skills/code-review` → `plugins/coding-god/skills/code-review`
- Move: `plugins/standard-coding-style/skills/standard-coding-style` → `plugins/coding-god/skills/standard-coding-style`
- Move: `plugins/dev-flow/skills/dev-flow` → `plugins/coding-god/skills/dev-flow`
- Move: `plugins/dev-flow/agents/dev-flow-implement.md` → `plugins/coding-god/agents/dev-flow-implement.md`

- [ ] **Step 1: 搬遷 skill 與 agent**

```bash
git mv plugins/git-workflow/skills/git-commit plugins/coding-god/skills/git-commit
git mv plugins/git-workflow/skills/git-push plugins/coding-god/skills/git-push
git mv plugins/code-review/skills/code-review plugins/coding-god/skills/code-review
git mv plugins/standard-coding-style/skills/standard-coding-style plugins/coding-god/skills/standard-coding-style
git mv plugins/dev-flow/skills/dev-flow plugins/coding-god/skills/dev-flow
git mv plugins/dev-flow/agents/dev-flow-implement.md plugins/coding-god/agents/dev-flow-implement.md
```

- [ ] **Step 2: 驗證搬遷結果**

Run: `ls plugins/coding-god/skills/ && ls plugins/coding-god/agents/`
Expected:
```
code-review
dev-flow
git-commit
git-push
standard-coding-style

dev-flow-implement.md
```

- [ ] **Step 3: 確認 SKILL.md frontmatter 完整**

Run: `for f in plugins/coding-god/skills/*/SKILL.md; do echo "=== $f ==="; head -5 "$f"; done`
Expected: 每個 SKILL.md 都顯示包含 `name:` 與 `description:` 的 frontmatter。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(coding-god): move skills and agent into unified plugin"
```

---

### Task 3: 改寫 dev-flow SKILL.md 中的限定引用

**Files:**
- Modify: `plugins/coding-god/skills/dev-flow/SKILL.md`

引用點（從 spec 階段 grep 確認）：
- L120: `git-workflow:git-commit` → `coding-god:git-commit`
- L128: `code-review:code-review` → `coding-god:code-review`
- L172: `code-review:code-review` → `coding-god:code-review`
- L179: `code-review:code-review` → `coding-god:code-review`
- L189: `git-workflow:git-commit` → `coding-god:git-commit`
- L191: `git-workflow:git-commit` → `coding-god:git-commit`

注意 L128 同行還有 `opsx:apply`，那是另一個 plugin 的引用，**不要動**。

- [ ] **Step 1: 替換 `code-review:code-review`**

```bash
sed -i '' 's/code-review:code-review/coding-god:code-review/g' plugins/coding-god/skills/dev-flow/SKILL.md
```

- [ ] **Step 2: 替換 `git-workflow:git-commit`**

```bash
sed -i '' 's/git-workflow:git-commit/coding-god:git-commit/g' plugins/coding-god/skills/dev-flow/SKILL.md
```

- [ ] **Step 3: 驗證沒有殘留舊引用**

Run: `grep -nE 'git-workflow:|code-review:code-review|standard-coding-style:standard-coding-style' plugins/coding-god/skills/dev-flow/SKILL.md`
Expected: 沒有任何輸出（exit 1）。

- [ ] **Step 4: 驗證新引用已生效**

Run: `grep -nE 'coding-god:(code-review|git-commit)' plugins/coding-god/skills/dev-flow/SKILL.md`
Expected: 至少 6 行命中。

- [ ] **Step 5: Commit**

```bash
git add plugins/coding-god/skills/dev-flow/SKILL.md
git commit -m "refactor(coding-god): rewrite skill refs in dev-flow SKILL.md"
```

---

### Task 4: 改寫 dev-flow-implement agent 中的限定引用

**Files:**
- Modify: `plugins/coding-god/agents/dev-flow-implement.md`

引用點：
- L57: `standard-coding-style:standard-coding-style` → `coding-god:standard-coding-style`
- L79, L81, L88, L158: `code-review:code-review` → `coding-god:code-review`

- [ ] **Step 1: 替換 `standard-coding-style:standard-coding-style`**

```bash
sed -i '' 's/standard-coding-style:standard-coding-style/coding-god:standard-coding-style/g' plugins/coding-god/agents/dev-flow-implement.md
```

- [ ] **Step 2: 替換 `code-review:code-review`**

```bash
sed -i '' 's/code-review:code-review/coding-god:code-review/g' plugins/coding-god/agents/dev-flow-implement.md
```

- [ ] **Step 3: 驗證沒有殘留舊引用**

Run: `grep -nE 'git-workflow:|code-review:code-review|standard-coding-style:standard-coding-style' plugins/coding-god/agents/dev-flow-implement.md`
Expected: 沒有任何輸出。

- [ ] **Step 4: 驗證新引用已生效**

Run: `grep -nE 'coding-god:(code-review|standard-coding-style)' plugins/coding-god/agents/dev-flow-implement.md`
Expected: 至少 5 行命中。

- [ ] **Step 5: Commit**

```bash
git add plugins/coding-god/agents/dev-flow-implement.md
git commit -m "refactor(coding-god): rewrite skill refs in dev-flow-implement agent"
```

---

### Task 5: 全域 grep 確認沒有殘留舊引用

**Files:** （驗證任務、無修改）

- [ ] **Step 1: 在 plugins/coding-god/ 全範圍 grep**

Run:
```bash
grep -rnE 'git-workflow:|code-review:code-review|standard-coding-style:standard-coding-style' plugins/coding-god/
```
Expected: 沒有任何輸出。

如果有殘留，回 Task 3 / Task 4 對應檔案補上替換。

- [ ] **Step 2: 確認 dev-flow 自身的非限定提及未被誤動**

Run: `grep -nE '\bdev-flow\b' plugins/coding-god/skills/dev-flow/SKILL.md | head -20`
Expected: 仍然看得到敘述性的 "dev-flow" 字串（skill 名稱、流程描述等），這些是預期保留的。

---

### Task 6: 刪除四個舊 plugin 資料夾

**Files:**
- Delete: `plugins/git-workflow/`
- Delete: `plugins/code-review/`
- Delete: `plugins/standard-coding-style/`
- Delete: `plugins/dev-flow/`

搬遷後這些資料夾應該只剩下 `.claude-plugin/plugin.json` 與空的 `skills/`、`agents/`。

- [ ] **Step 1: 確認四個舊資料夾只剩殘留**

Run: `find plugins/git-workflow plugins/code-review plugins/standard-coding-style plugins/dev-flow -type f`
Expected: 只看到四個 `.claude-plugin/plugin.json`，沒有其他檔案。

- [ ] **Step 2: 刪除四個舊資料夾**

```bash
git rm -r plugins/git-workflow plugins/code-review plugins/standard-coding-style plugins/dev-flow
```

- [ ] **Step 3: 驗證 plugins/ 下只剩 coding-god**

Run: `ls plugins/`
Expected:
```
coding-god
```

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove legacy plugin folders superseded by coding-god"
```

---

### Task 7: 更新 marketplace.json

**Files:**
- Modify: `.claude-plugin/marketplace.json`

- [ ] **Step 1: 改寫 plugins 陣列**

把 `plugins` 陣列整段替換成單一 entry。完成後 `.claude-plugin/marketplace.json` 完整內容應為：

```json
{
  "name": "cover-me",
  "owner": {
    "name": "Jerry Chang"
  },
  "metadata": {
    "description": "AI coding workflow tools — skills for git, code review, and coding standards"
  },
  "plugins": [
    {
      "name": "coding-god",
      "source": "./plugins/coding-god",
      "description": "Full-stack coding workflow — dev-flow, code review, coding style, and git",
      "category": "development"
    }
  ]
}
```

- [ ] **Step 2: 驗證 JSON 格式**

Run: `python3 -m json.tool .claude-plugin/marketplace.json`
Expected: 印出格式化的 JSON，沒有錯誤。

- [ ] **Step 3: 驗證只剩一個 plugin entry**

Run: `python3 -c "import json; d = json.load(open('.claude-plugin/marketplace.json')); print(len(d['plugins']), d['plugins'][0]['name'])"`
Expected: `1 coding-god`

- [ ] **Step 4: Commit**

```bash
git add .claude-plugin/marketplace.json
git commit -m "feat(marketplace): replace four plugins with unified coding-god entry"
```

---

### Task 8: 更新 README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 改寫 Available Plugins 表格與安裝指令**

替換 README.md 中的 `## Available Plugins` 表格與 `## Usage` 內的 `/plugin install ...` 區塊。完成後對應段落應為：

```markdown
## Available Plugins

| Plugin | Description |
|--------|-------------|
| `coding-god` | Full-stack coding workflow — dev-flow, code review, coding style, and git |

## Usage

After adding the marketplace, install the plugin:

```
/plugin install coding-god@cover-me
```

Update to latest versions:

```
/plugin marketplace update cover-me
```
```

- [ ] **Step 2: 驗證沒有殘留舊 plugin 名**

Run: `grep -nE 'git-workflow|standard-coding-style|dev-flow' README.md; grep -nE '\bcode-review\b' README.md`
Expected: 沒有任何輸出。

- [ ] **Step 3: 驗證 coding-god 出現於安裝指令**

Run: `grep -n 'coding-god@cover-me' README.md`
Expected: 至少一行命中。

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(readme): update for unified coding-god plugin"
```

---

### Task 9: 更新 CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

CLAUDE.md 目前在 `## What this repo is` 段落列出四條 `/plugin install ...` 範例（`git-workflow@cover-me`、`code-review@cover-me`、`standard-coding-style@cover-me`、`dev-flow@cover-me`），需要替換成單一指令。

- [ ] **Step 1: 用 Edit 工具替換四條安裝指令**

把這段：

```
/plugin install git-workflow@cover-me
/plugin install code-review@cover-me
/plugin install standard-coding-style@cover-me
/plugin install dev-flow@cover-me
```

替換成：

```
/plugin install coding-god@cover-me
```

- [ ] **Step 2: 驗證沒有殘留舊 plugin 安裝指令**

Run: `grep -nE 'plugin install (git-workflow|code-review|standard-coding-style|dev-flow)@' CLAUDE.md`
Expected: 沒有任何輸出。

- [ ] **Step 3: 驗證 coding-god 安裝指令存在**

Run: `grep -n 'plugin install coding-god@cover-me' CLAUDE.md`
Expected: 至少一行命中。

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): update install example for coding-god"
```

---

### Task 10: 最終驗證

**Files:** （驗證任務、無修改）

- [ ] **Step 1: 全 repo grep 確認沒有殘留限定引用**

Run:
```bash
grep -rnE 'git-workflow:|code-review:code-review|standard-coding-style:standard-coding-style' plugins/ README.md CLAUDE.md .claude-plugin/marketplace.json
```
Expected: 沒有任何輸出。

注意：`docs/superpowers/specs/` 與 `docs/superpowers/plans/` 下保留歷史紀錄，不在驗證範圍。

- [ ] **Step 2: 確認 plugins/ 結構**

Run: `find plugins -maxdepth 4 -type d | sort`
Expected:
```
plugins
plugins/coding-god
plugins/coding-god/.claude-plugin
plugins/coding-god/agents
plugins/coding-god/skills
plugins/coding-god/skills/code-review
plugins/coding-god/skills/dev-flow
plugins/coding-god/skills/git-commit
plugins/coding-god/skills/git-push
plugins/coding-god/skills/standard-coding-style
```

- [ ] **Step 3: 確認 git status 乾淨**

Run: `git status`
Expected: `nothing to commit, working tree clean`

- [ ] **Step 4: 看一下 commit 列**

Run: `git log --oneline -10`
Expected: 看到 Task 1–9 的所有 commit 都在。

---

## 驗證清單對照（spec → plan）

- ✅ Spec §「合併後結構」 → Task 1, 2
- ✅ Spec §「`plugin.json`」 → Task 1
- ✅ Spec §「Skill 限定引用改寫」 → Task 3, 4, 5
- ✅ Spec §「`marketplace.json`」 → Task 7
- ✅ Spec §「`README.md`」 → Task 8
- ✅ Spec §「`CLAUDE.md`」 → Task 9
- ✅ Spec §「執行步驟概要」 → Task 1–9（步驟順序一致）
- ✅ Spec §「驗證」 → Task 5, 10
