# Install cover-me for opencode

> 這份文件是寫給 AI coding agent 看的。使用者只要說「幫我把 cover-me 裝到 opencode」，AI 照著以下步驟執行即可。

## 前提

- opencode 會自動載入 `~/.config/opencode/skills/<name>/SKILL.md`，無需修改任何設定檔。
- 本 repo 的 plugin commands/hooks 僅 Claude Code 支援；opencode 端只能使用 `skills/`。
- 所有指令在使用者本機執行（Linux / macOS）。Windows 使用者請改用 WSL 或 Git Bash。

## Step 1 — Clone 或更新 repo

放在固定位置 `~/.cover-me`，後續更新只需 `git pull`：

```bash
test -d ~/.cover-me || git clone https://github.com/blawhi2435/cover-me ~/.cover-me
git -C ~/.cover-me pull --ff-only
```

## Step 2 — 確認要安裝哪些 plugin

列出可用 plugin：

```bash
ls ~/.cover-me/plugins/
```

詢問使用者要安裝哪些（預設全部）。目前提供：

| Plugin | 說明 |
|--------|------|
| `coding-god` | dev-flow、code review、coding style、git skills |

> `claude-notify` 是 Claude Code 專用 hook plugin，opencode 不支援，會自動跳過。

## Step 3 — Symlink skills 到 opencode skills 目錄

對每個選定的 plugin，把它底下的 `skills/*` symlink 到 `~/.config/opencode/skills/`：

```bash
mkdir -p ~/.config/opencode/skills
PLUGIN=coding-god   # 換成使用者選的 plugin
for skill in ~/.cover-me/plugins/$PLUGIN/skills/*/; do
  name=$(basename "$skill")
  ln -sfn "$skill" ~/.config/opencode/skills/"$name"
done
```

說明：

- `ln -sfn` 會覆蓋既有 symlink，可重複執行不會出錯。
- 若使用者選多個 plugin，對每個 plugin 各跑一次上方迴圈。
- 若不同 plugin 出現同名 skill，後執行的會覆蓋前者，請提醒使用者。

## Step 4 — 驗證安裝

```bash
ls -l ~/.config/opencode/skills/
```

每個項目應為 symlink，指向 `~/.cover-me/plugins/<plugin>/skills/<name>`，且該目錄下存在 `SKILL.md`：

```bash
for d in ~/.config/opencode/skills/*/; do
  test -f "$d/SKILL.md" && echo "OK   $d" || echo "MISS $d"
done
```

全部 `OK` 即完成。重啟 opencode 後 skills 即可使用。

## Step 5 — 提醒第三方 dependency

`coding-god` 內部會呼叫以下第三方 skills：

- `superpowers:brainstorming`、`superpowers:test-driven-development`
- `opsx:new`、`opsx:ff`、`opsx:apply`、`opsx:archive`

這些 **不在本 repo 中**。若使用者要使用 `dev-flow`，必須另外取得對應 skill 並放到 `~/.config/opencode/skills/` 底下，或請使用者改用不需要這些 dependency 的 skills（如 `code-review`、`git-commit`、`git-push`、`standard-coding-style`）。

## 更新

```bash
git -C ~/.cover-me pull --ff-only
```

Symlink 會自動指向新版本，無需重跑 Step 3。

## 解除安裝

```bash
find ~/.config/opencode/skills/ -maxdepth 1 -type l -lname '*/.cover-me/*' -delete
rm -rf ~/.cover-me   # 視需要
```
