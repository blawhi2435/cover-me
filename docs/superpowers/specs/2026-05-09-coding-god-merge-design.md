# coding-god Plugin 合併設計

**Date:** 2026-05-09
**Status:** Approved (brainstorming phase)

## 目標

把 `cover-me` marketplace 中四個開發相關 plugin 合併成單一 plugin `coding-god`，原四個 plugin 從 marketplace 下架。

合併對象：

- `git-workflow`（含 `git-commit`、`git-push` 兩個 skill）
- `code-review`
- `standard-coding-style`
- `dev-flow`（含 `dev-flow-implement` agent）

## 不在範圍內

- 不修改任何 skill 的內部邏輯／流程。
- 不對 OpenSpec 工作流做變動。
- 不為已安裝舊 plugin 的使用者提供自動遷移工具。

## 合併後結構

```
plugins/coding-god/
  .claude-plugin/plugin.json       # name: coding-god, version: 1.0.0
  skills/
    dev-flow/
    code-review/
    standard-coding-style/
    git-commit/
    git-push/
  agents/
    dev-flow-implement.md
```

各 skill 內部檔案（`SKILL.md`、`references/`、子文件）原樣搬遷，不重新組織。

## `plugin.json`

```json
{
  "name": "coding-god",
  "description": "Full-stack coding workflow — dev-flow, code review, coding style, and git",
  "version": "1.0.0"
}
```

Version 從 `1.0.0` 起算（合併後的 plugin 視為新產品，不沿用 `dev-flow` 的 1.4.0）。

## Skill 限定引用改寫

所有 `<plugin>:<skill>` 形式的限定名都要改寫成 `coding-god:<skill>`：

| 原引用 | 新引用 |
|---|---|
| `standard-coding-style:standard-coding-style` | `coding-god:standard-coding-style` |
| `code-review:code-review` | `coding-god:code-review` |
| `git-workflow:git-commit` | `coding-god:git-commit` |
| `git-workflow:git-push` | `coding-god:git-push` |

主要受影響檔案（從 grep 確認）：

- `plugins/dev-flow/skills/dev-flow/SKILL.md`
- `plugins/dev-flow/agents/dev-flow-implement.md`

實作時要在搬遷後對 `plugins/coding-god/` 整棵目錄再 grep 一次，確保沒有遺漏。

Skill 自身的 `name:` frontmatter 不變（`dev-flow`、`code-review`、`standard-coding-style`、`git-commit`、`git-push` 本來就唯一）。

## `marketplace.json`

四個 plugin entry 換成單一 entry：

```json
{
  "name": "coding-god",
  "source": "./plugins/coding-god",
  "description": "Full-stack coding workflow — dev-flow, code review, coding style, and git",
  "category": "development"
}
```

## `README.md`

- 「Available Plugins」表格改為單列 `coding-god`。
- 安裝指令改為：
  ```
  /plugin install coding-god@cover-me
  ```

## `CLAUDE.md`

`## What this repo is` 段落中四條 `/plugin install ...` 範例改為單一 `coding-god` 安裝指令；其他結構性敘述（plugin 目錄結構說明）保持不變，因為新結構仍符合既有規格。

## 執行步驟概要

1. 建立 `plugins/coding-god/{skills,agents,.claude-plugin}` 三個目錄。
2. 用 `git mv` 把五個 skill 資料夾、`dev-flow-implement.md` agent 搬到新位置（保留檔案歷史）。
3. 新增 `plugins/coding-god/.claude-plugin/plugin.json`。
4. 改寫 `SKILL.md` / `dev-flow-implement.md` 中的限定引用。
5. 更新 `marketplace.json`、`README.md`、`CLAUDE.md`。
6. `git rm -r` 清掉原四個 plugin 殘留資料夾（特別是 `.claude-plugin/plugin.json`）。
7. 全域 grep 確認沒有殘留的 `git-workflow:`、`code-review:`、`standard-coding-style:`、`dev-flow:` 限定引用（dev-flow 的「skill 名」自身使用例外，例如 `name: dev-flow` 自身定義或敘述性文字中的 `dev-flow` 不算）。

## 驗證

- `marketplace.json` JSON 格式正確、僅含 `coding-god` 一個 entry。
- `plugins/coding-god/.claude-plugin/plugin.json` 存在且欄位齊全。
- `plugins/coding-god/skills/` 下五個 skill 各自的 `SKILL.md` 都還能載入（frontmatter 完整）。
- grep `git-workflow:|code-review:|standard-coding-style:` 在合併後不再出現於 plugin 引用語境。
- README 安裝指令可正確被使用者複製貼上。

## 已知影響

- 已安裝舊 plugin 的使用者下次 `/plugin marketplace update cover-me` 後會發現舊 plugin 不再存在，需要手動 `/plugin install coding-god@cover-me` 並移除舊安裝。此遷移痛點接受、不做緩解。
