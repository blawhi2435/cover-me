# `claude-notify` Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `cover-me` marketplace 新增獨立 plugin `claude-notify`，使用者安裝後 Claude Code 在等待輸入或任務完成時會在 macOS / Linux 桌面彈出系統通知。

**Architecture:** 新增 `plugins/claude-notify/` 目錄，內含 `plugin.json`、`hooks/hooks.json` 註冊 `Notification` 與 `Stop` 兩個 hook，以及一支跨平台 bash wrapper `scripts/claude-notify.sh`（內部 `case "$(uname)"` 分 macOS `osascript` / Linux `notify-send`）。`marketplace.json` 與 `README.md` 同步追加新 entry。

**Tech Stack:** Bash, JSON, Markdown, `osascript`, `notify-send`

**Spec:** `docs/superpowers/specs/2026-05-09-claude-notify-plugin-design.md`

---

## File Structure

```
plugins/claude-notify/
  .claude-plugin/plugin.json     # 新建 — plugin metadata
  hooks/hooks.json               # 新建 — 註冊 Notification + Stop hooks
  scripts/claude-notify.sh       # 新建 — 跨平台 wrapper (chmod +x)
```

修改：

- `.claude-plugin/marketplace.json` — `plugins` 陣列追加 `claude-notify` entry
- `README.md` — 表格追加列 + Usage 段補安裝指令

---

### Task 1: scaffold claude-notify 目錄 + plugin.json

**Files:**
- Create: `plugins/claude-notify/.claude-plugin/plugin.json`

- [ ] **Step 1: 建立目錄**

```bash
mkdir -p plugins/claude-notify/.claude-plugin
mkdir -p plugins/claude-notify/hooks
mkdir -p plugins/claude-notify/scripts
```

- [ ] **Step 2: 寫入 plugin.json**

寫入 `plugins/claude-notify/.claude-plugin/plugin.json`：

```json
{
  "name": "claude-notify",
  "description": "Desktop notifications when Claude Code needs your input or finishes a task (macOS / Linux)",
  "version": "1.0.0"
}
```

- [ ] **Step 3: 驗證 JSON 格式**

Run: `python3 -m json.tool plugins/claude-notify/.claude-plugin/plugin.json`
Expected: 印出格式化的 JSON，沒有錯誤。

- [ ] **Step 4: Commit**

```bash
git add plugins/claude-notify/.claude-plugin/plugin.json
git commit -m "feat(claude-notify): scaffold plugin manifest"
```

---

### Task 2: 寫 wrapper script `claude-notify.sh`

**Files:**
- Create: `plugins/claude-notify/scripts/claude-notify.sh`

- [ ] **Step 1: 寫入 script**

寫入 `plugins/claude-notify/scripts/claude-notify.sh`：

```bash
#!/usr/bin/env bash
# Cross-platform notifier for Claude Code Notification / Stop hooks.
# Always exits 0 so hook failures never block Claude Code.
set -eu

mode="${1:-need-input}"
project="${CLAUDE_PROJECT_DIR:-$PWD}"
project_name="$(basename "$project")"

case "$mode" in
  need-input) title="${project_name} · Claude 在等你"; body="Claude needs your input" ;;
  done)       title="${project_name} · Claude 任務完成"; body="Task finished" ;;
  *) exit 0 ;;
esac

case "$(uname)" in
  Darwin)
    osascript -e "display notification \"${body}\" with title \"${title}\" sound name \"default\"" >/dev/null 2>&1 || true
    ;;
  Linux)
    command -v notify-send >/dev/null 2>&1 && notify-send "${title}" "${body}" || true
    ;;
esac
exit 0
```

- [ ] **Step 2: 給執行權限**

```bash
chmod +x plugins/claude-notify/scripts/claude-notify.sh
```

- [ ] **Step 3: 驗證 shellcheck 過（如果有裝）**

Run: `command -v shellcheck >/dev/null && shellcheck plugins/claude-notify/scripts/claude-notify.sh || echo "shellcheck not installed, skipping"`
Expected: 沒有錯誤輸出，或印出 skip 訊息。

- [ ] **Step 4: 驗證 mode=need-input 在 macOS 能跑**

Run（只在 macOS 上會看到通知，Linux 上若有桌面也會）：

```bash
plugins/claude-notify/scripts/claude-notify.sh need-input
echo "exit=$?"
```

Expected: `exit=0`，並在 macOS 看到右上角通知標題「<repo basename> · Claude 在等你」。

- [ ] **Step 5: 驗證 mode=done**

```bash
plugins/claude-notify/scripts/claude-notify.sh done
echo "exit=$?"
```

Expected: `exit=0`，看到通知「<repo basename> · Claude 任務完成」。

- [ ] **Step 6: 驗證未知 mode silent no-op**

```bash
plugins/claude-notify/scripts/claude-notify.sh garbage
echo "exit=$?"
```

Expected: `exit=0`，沒有任何通知、沒有 stderr 輸出。

- [ ] **Step 7: 驗證 chmod 已寫入 git**

Run: `git ls-files --stage plugins/claude-notify/scripts/claude-notify.sh`
Expected: 輸出第一欄為 `100755`（執行權限）。

- [ ] **Step 8: Commit**

```bash
git add plugins/claude-notify/scripts/claude-notify.sh
git commit -m "feat(claude-notify): add cross-platform notification wrapper"
```

---

### Task 3: 寫 `hooks/hooks.json`

**Files:**
- Create: `plugins/claude-notify/hooks/hooks.json`

- [ ] **Step 1: 寫入 hooks.json**

寫入 `plugins/claude-notify/hooks/hooks.json`：

```json
{
  "hooks": {
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/claude-notify.sh need-input"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/claude-notify.sh done"
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: 驗證 JSON 格式**

Run: `python3 -m json.tool plugins/claude-notify/hooks/hooks.json`
Expected: 印出格式化 JSON，沒有錯誤。

- [ ] **Step 3: 驗證 hook event 名與 script 路徑一致**

Run:

```bash
python3 -c "
import json
d = json.load(open('plugins/claude-notify/hooks/hooks.json'))
events = list(d['hooks'].keys())
print('events:', events)
for ev, entries in d['hooks'].items():
    for entry in entries:
        for h in entry['hooks']:
            print(ev, '->', h['command'])
"
```

Expected：

```
events: ['Notification', 'Stop']
Notification -> ${CLAUDE_PLUGIN_ROOT}/scripts/claude-notify.sh need-input
Stop -> ${CLAUDE_PLUGIN_ROOT}/scripts/claude-notify.sh done
```

- [ ] **Step 4: Commit**

```bash
git add plugins/claude-notify/hooks/hooks.json
git commit -m "feat(claude-notify): register Notification and Stop hooks"
```

---

### Task 4: 把 `claude-notify` 加進 marketplace.json

**Files:**
- Modify: `.claude-plugin/marketplace.json`

- [ ] **Step 1: 讀取現有檔案確認當前 plugins 陣列只有 coding-god**

Run: `python3 -c "import json; d = json.load(open('.claude-plugin/marketplace.json')); print([p['name'] for p in d['plugins']])"`
Expected: `['coding-god']`

- [ ] **Step 2: 用 Edit 工具在 plugins 陣列末尾追加 entry**

`.claude-plugin/marketplace.json` 完成後完整內容應為：

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
    },
    {
      "name": "claude-notify",
      "source": "./plugins/claude-notify",
      "description": "Desktop notifications when Claude Code needs your input or finishes a task",
      "category": "development"
    }
  ]
}
```

- [ ] **Step 3: 驗證 JSON 格式**

Run: `python3 -m json.tool .claude-plugin/marketplace.json`
Expected: 印出格式化 JSON，沒有錯誤。

- [ ] **Step 4: 驗證 plugins 陣列現在有兩筆且名稱正確**

Run: `python3 -c "import json; d = json.load(open('.claude-plugin/marketplace.json')); print(len(d['plugins']), [p['name'] for p in d['plugins']])"`
Expected: `2 ['coding-god', 'claude-notify']`

- [ ] **Step 5: Commit**

```bash
git add .claude-plugin/marketplace.json
git commit -m "feat(marketplace): register claude-notify plugin"
```

---

### Task 5: 更新 README.md

**Files:**
- Modify: `README.md`

`Available Plugins` 表格目前只有 `coding-god` 一列，要新增 `claude-notify` 一列。`Usage` 段目前只有 `coding-god` 安裝指令，要再補一條 `claude-notify` 安裝指令。

- [ ] **Step 1: Edit Available Plugins 表格**

把：

```
| `coding-god` | Full-stack coding workflow — dev-flow, code review, coding style, and git |
```

替換成：

```
| `coding-god` | Full-stack coding workflow — dev-flow, code review, coding style, and git |
| `claude-notify` | Desktop notifications when Claude Code needs your input or finishes a task |
```

- [ ] **Step 2: Edit Usage 段安裝指令**

把：

````
After adding the marketplace, install the plugin:

```
/plugin install coding-god@cover-me
```
````

替換成：

````
After adding the marketplace, install the plugins you want:

```
/plugin install coding-god@cover-me
/plugin install claude-notify@cover-me
```
````

- [ ] **Step 3: 驗證新內容已生效**

Run: `grep -n 'claude-notify' README.md`
Expected: 至少 2 行命中（表格列 + 安裝指令）。

- [ ] **Step 4: 驗證原本 coding-god 行還在**

Run: `grep -n 'coding-god@cover-me' README.md`
Expected: 至少 1 行命中。

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs(readme): document claude-notify plugin"
```

---

### Task 6: 整體驗證

**Files:** （驗證任務、無修改）

- [ ] **Step 1: 確認 plugins/ 結構**

Run: `find plugins/claude-notify -type f | sort`
Expected:

```
plugins/claude-notify/.claude-plugin/plugin.json
plugins/claude-notify/hooks/hooks.json
plugins/claude-notify/scripts/claude-notify.sh
```

- [ ] **Step 2: 確認 wrapper 仍可執行**

Run: `[ -x plugins/claude-notify/scripts/claude-notify.sh ] && echo OK || echo MISSING_EXEC`
Expected: `OK`

- [ ] **Step 3: 端到端 smoke test（macOS）**

Run（只在 macOS 上）:

```bash
CLAUDE_PROJECT_DIR=/tmp/foo plugins/claude-notify/scripts/claude-notify.sh need-input
echo "exit=$?"
```

Expected: `exit=0`，看到通知 title 為「foo · Claude 在等你」。

- [ ] **Step 4: 確認 git status 乾淨**

Run: `git status`
Expected: `nothing to commit, working tree clean`

- [ ] **Step 5: 看一下 commit 列**

Run: `git log --oneline -8`
Expected: 看到 Task 1–5 的 5 個 feat/docs commit 都在。

---

## 驗證清單對照（spec → plan）

- ✅ Spec §「目錄結構」 → Task 1, 2, 3
- ✅ Spec §「`plugin.json`」 → Task 1
- ✅ Spec §「`hooks/hooks.json`」 → Task 3
- ✅ Spec §「`scripts/claude-notify.sh`」 → Task 2
- ✅ Spec §「`marketplace.json` 改動」 → Task 4
- ✅ Spec §「`README.md` 改動」 → Task 5
- ✅ Spec §「驗證」 → Task 2 (steps 4–6), Task 6
