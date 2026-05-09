# `claude-notify` Plugin 設計

**Date:** 2026-05-09
**Status:** Approved (brainstorming phase)

## 目標

在 `cover-me` marketplace 新增獨立 plugin `claude-notify`。安裝後，Claude Code 在以下兩種情況會於使用者桌面右上角彈系統通知：

1. Claude 需要使用者輸入（權限請求、idle 等）— 對應 `Notification` hook event
2. Claude 任務跑完 — 對應 `Stop` hook event

支援平台：macOS、Linux 桌面。Hook 與 wrapper script 隨 plugin 安裝同步部署，使用者不需手動 `~/.local/bin/` 之類處理。

## 不在範圍內

- 互動式通知（在通知 UI 上回答問題） — 技術上 Claude Code TUI 沒有把答案注回 prompt 的官方管道。
- Linux SSH / headless 場景 — 沒有桌面就沒有彈窗，會 silent no-op。
- WSL / Windows 原生 — 不在使用者目前用機範圍。
- 涵蓋非 Claude 的 coding agent（Cursor、Codex 等） — hooks 是 Claude Code 專屬機制。
- 終端機已聚焦時抑制通知 — YAGNI，未來再加。
- 通知訊息節流（連發抑制） — YAGNI。

## 目錄結構

```
plugins/claude-notify/
  .claude-plugin/plugin.json
  hooks/hooks.json
  scripts/claude-notify.sh        # chmod +x，repo 直接帶執行權
```

## `plugin.json`

```json
{
  "name": "claude-notify",
  "description": "Desktop notifications when Claude Code needs your input or finishes a task (macOS / Linux)",
  "version": "1.0.0"
}
```

## `hooks/hooks.json`

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

`${CLAUDE_PLUGIN_ROOT}` 由 Claude Code 在 hook 執行時注入，指向 plugin 安裝後的根目錄。檔案位置與 schema 對齊 [Claude Code plugins reference](https://code.claude.com/docs/en/plugins-reference)。

## `scripts/claude-notify.sh`

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

設計重點：
- `set -eu`：抓出未定義變數，避免 silent corruption。
- 永遠 `exit 0`：通知工具失敗（無權限、缺 `notify-send`）不影響 Claude Code 流程。
- 未知 OS / 工具缺失 → silent no-op。
- 預設系統音效（macOS `default`；Linux 由桌面環境決定）。
- Title 帶上 `$CLAUDE_PROJECT_DIR` basename，多 session 時可一眼分辨來源。

## `marketplace.json` 改動

在現有 `plugins` 陣列尾端追加一筆，`coding-god` 維持原樣：

```json
{
  "name": "claude-notify",
  "source": "./plugins/claude-notify",
  "description": "Desktop notifications when Claude Code needs your input or finishes a task",
  "category": "development"
}
```

## `README.md` 改動

`Available Plugins` 表格新增一列；`Usage` 區段補一條 `/plugin install claude-notify@cover-me`。`Dependencies` 段不需要改動 — `claude-notify` 不依賴第三方 plugin。

## 安裝後使用者體驗

1. `/plugin install claude-notify@cover-me`
2. plugin 內 `hooks/hooks.json` 自動註冊兩個 hook
3. Claude Code 觸發 `Notification` 或 `Stop` event → 呼叫 `${CLAUDE_PLUGIN_ROOT}/scripts/claude-notify.sh` → 桌面通知
4. 不想要 → `/plugin uninstall claude-notify@cover-me` 或 `/plugin disable`

## 驗證

- 手動跑 `bash plugins/claude-notify/scripts/claude-notify.sh need-input` 在 macOS 應彈出標題為「<repo> · Claude 在等你」的通知。
- 同上指令在裝有 `notify-send` 的 Linux 桌面應彈出對應通知。
- 同上指令在沒有 `notify-send` 的 Linux 應 silent exit 0、無 stderr。
- `marketplace.json` JSON 格式正確、含兩個 plugin entry。
- 在已安裝 plugin 的 Claude Code session 觸發權限請求 → 收到通知。
- Claude Code 任務結束 → 收到通知。
