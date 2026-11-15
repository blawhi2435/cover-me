#!/bin/sh
# devflow-gate.sh - plan / red / check gate for dev-flow.
# POSIX sh; uses only awk, sed, grep and coreutils.
#
#   devflow-gate.sh plan  [--root DIR] <spec>
#   devflow-gate.sh red   [--root DIR] <N> -- <command...>
#   devflow-gate.sh check [--root DIR] <spec>
#
# --root DIR is the repository root (default: the current directory). A relative
# <spec> resolves against it. <N> is a task group number, digits only.
#
# Working files, all under the root:
#   .devflow/tasks.md     the task list, validated by plan and check
#   .devflow/red/<N>.txt  red evidence for group N, written only by red
#
# Exit codes: 0 success; 1 the gate failed (the output lists "ERROR:" lines, or
# red refused or could not record); 2 usage error.

REQUIRED_HEADINGS="Problem|Goal|Design|Affected files|Requirements|References"
RED_TAIL_LINES=40   # lines of output a red evidence file keeps

usage() {
  echo "usage: devflow-gate.sh plan|check [--root DIR] <spec> | red [--root DIR] <N> -- <command...>" >&2
  exit 2
}

report_error() {
  printf '%s\n' "ERROR: $1"
}

# The one place the code-fence rule lives (CommonMark style), spliced in front of
# every awk program that must skip fenced lines. in_fence() is called once per
# line and returns 1 when the line is a fence marker or inside a fence. A fence
# opens with a run of 3+ backticks or tildes preceded by at most 3 spaces (4 or
# more spaces, or a tab, make the line plain content) and may carry an info
# string, except that a backtick opener whose rest of line contains a backtick
# is plain text. It closes only on a run of the same character, at least as
# long, preceded by at most 3 spaces and followed by nothing but whitespace;
# every other line inside is content. A fence opened at 1-3 spaces of indentation
# belongs to a list item: it ends at the first non-blank line that starts in
# column 0, which is then read as normal content, and the fence counts as unclosed
# (fence_broken is set to the line where it opened). After the last line
# fence_char is non-empty when a fence is unclosed, and fence_opened is the line
# where it opened.
FENCE_AWK='
  function in_fence(   marker, ch, len, tail) {
    if (fence_char != "" && fence_indented && $0 ~ /^[^ \t]/) { fence_broken = fence_opened; fence_char = "" }
    if (match($0, /^(   |  | )?(```+|~~~+)/)) {
      marker = substr($0, RSTART, RLENGTH); sub(/^ +/, "", marker)
      ch = substr(marker, 1, 1); len = length(marker)
      tail = substr($0, RSTART + RLENGTH)
      if (fence_char == "") {
        if (ch == "`" && index(tail, "`")) return 0
        fence_char = ch; fence_len = len; fence_opened = NR; fence_indented = (RSTART + RLENGTH - 1 > len)
      } else if (ch == fence_char && len >= fence_len && tail ~ /^[ \t]*$/) fence_char = ""
      return 1
    }
    return fence_char != ""
  }
'

# Print a file without the lines inside fenced code blocks (fence lines included).
strip_fences() {
  awk "$FENCE_AWK"'!in_fence()' "$1"
}

# Report a code fence that is opened and never closed: everything after it would
# be silently ignored. $1 is the file, $2 the label used in the message.
check_fences() {
  awk -v label="$2" "$FENCE_AWK"'
    { in_fence(); if (fence_broken) { print "ERROR: " label " line " fence_broken ": unclosed code fence"; fence_broken = 0 } }
    END { if (fence_char != "") print "ERROR: " label " line " fence_opened ": unclosed code fence" }
  ' "$1"
}

check_headings() {
  missing=
  body=$(strip_fences "$1")
  old_ifs=$IFS
  IFS='|'
  for heading in $REQUIRED_HEADINGS; do
    printf '%s\n' "$body" | grep -q "^## $heading[[:space:]]*\$" || { report_error "spec is missing heading: ## $heading"; missing=1; }
  done
  IFS=$old_ifs
  [ -z "$missing" ] || return
  found=$(printf '%s\n' "$body" | awk -v wanted="$REQUIRED_HEADINGS" '
    BEGIN { n = split(wanted, names, "|"); for (i = 1; i <= n; i++) want[names[i]] = 1 }
    /^## / { heading = substr($0, 4); sub(/[ \t]+$/, "", heading); if ((heading in want) && !(heading in seen)) { seen[heading] = 1; printf "%s|", heading } }')
  [ "$found" = "$REQUIRED_HEADINGS|" ] || report_error "spec headings are not in the required order: $REQUIRED_HEADINGS"
}

# Print the ids of the scenarios the spec declares, one per line.
spec_scenario_ids() {
  strip_fences "$1" | sed -n 's/^####[[:space:]][[:space:]]*Scenario:\{0,1\}[[:space:]][[:space:]]*\(S[0-9][0-9]*\).*/\1/p'
}

# Print the lines of the "## Requirements" section.
requirements_section() {
  strip_fences "$1" | awk '/^## / { inside = ($0 ~ /^## Requirements[ \t]*$/); next } inside'
}

# Print an error for each scenario heading that carries no S<n> id.
check_scenario_headings() {
  strip_fences "$1" | grep '^####[[:space:]][[:space:]]*Scenario' | grep -v '^####[[:space:]][[:space:]]*Scenario:\{0,1\}[[:space:]][[:space:]]*S[0-9]' | while IFS= read -r heading; do
    report_error "scenario heading without an S<n> id: $heading"
  done
}

# Report headings that look like a scenario heading but are not the exact
# "#### Scenario S<n>: ..." form, which would otherwise be silently ignored:
# any heading level, 1-3 spaces of indentation, a lower-case "scenario", or a
# bare "#### S<n>:". Uses the fence-stripped spec, so fenced examples are fine.
check_near_miss_headings() {
  awk -v label="$2" "$FENCE_AWK"'
    in_fence() { next }
    /^####[ \t]+Scenario:?[ \t]+/ { next }   # exact form, checked by check_scenario_headings
    {
      text = tolower($0)
      if (text ~ /^(   |  | )?#+[ \t]+scenario([^a-z]|$)/ || $0 ~ /^(   |  | )?####[ \t]+S[0-9]+:/)
        print "ERROR: " label " line " NR ": near-miss scenario heading, use exactly #### Scenario S<n>: <name>"
    }
  ' "$1"
}

check_requirements() {
  [ -n "$(spec_scenario_ids "$1")" ] && return
  requirements_section "$1" | grep -q '^No behavior change\.[[:space:]]*$' \
    || report_error "## Requirements has no scenarios and not the line: No behavior change."
}

# Turn tasks.md into tab-separated records (lines inside code fences are skipped,
# line numbers are those of the file):
#   G <group> tdd|skip <skip reason>     a group heading
#   L <group> <text after "Scenarios:">  a Scenarios line
#   M <group> <scenario id>              a scenario the group names
#   C <task id> <mark>                   a checkbox, mark is "x" or " "
#   X <message>                          a layout violation
parse_tasks() {
  awk "$FENCE_AWK"'
    BEGIN { OFS = "\t"; current = 0 }
    function violation(message) { print "X", "tasks.md line " NR ": " message }
    in_fence() { next }
    /^## [0-9]+\./ {
      number = $2; sub(/\.$/, "", number); number += 0
      if (number in seen) violation("duplicate group heading " number)
      else if (number != current + 1) violation("groups must be numbered from 1 in order, expected " current + 1 " but found " number)
      seen[number] = 1
      current = number
      group = number
      if (match($0, /<!-- TDD skipped:/)) {
        reason = substr($0, RSTART + RLENGTH); sub(/-->.*/, "", reason); gsub(/^[ \t]+|[ \t]+$/, "", reason)
        if (reason == "") violation("TDD skipped marker has no reason")
        print "G", group, "skip", reason
      } else {
        print "G", group, "tdd", ""
      }
      next
    }
    /^Scenarios:/ {
      if (current == 0) { violation("Scenarios line before the first group"); next }
      rest = $0; sub(/^Scenarios:[ \t]*/, "", rest)
      print "L", group, rest
      if (rest ~ /^none([^A-Za-z0-9]|$)/) next
      count = split(rest, tokens, /[ ,\t]+/)
      for (i = 1; i <= count; i++) if (tokens[i] ~ /^S[0-9]+$/) print "M", group, tokens[i]
      next
    }
    # Any line that looks like a checkbox is validated strictly below; near misses become violations.
    /^[ \t]*(>[ \t]*)*(([-*+]|[0-9]+[.)])[ \t]*\[|\[[ xX~-]?\])/ {
      if ($0 !~ /^- \[[ x]\] /) {
        if ($0 ~ /^[ \t]+/) violation("checkbox must start at column 0")
        else violation("checkbox must be exactly - [ ] or - [x] followed by a space")
        next
      }
      mark = substr($0, 4, 1)
      split(substr($0, 7), words, " ")
      id = words[1]
      if (id !~ /^[0-9]+\.[0-9]+$/) { violation("checkbox has no task id like N.M"); next }
      if (current == 0) { violation("checkbox before the first group"); next }
      split(id, parts, ".")
      if (parts[1] + 0 != current) { violation("checkbox id " id " does not belong to group " current); next }
      if (id in seenId) { violation("duplicate checkbox id " id); next }
      seenId[id] = 1
      print "C", id, mark
      next
    }
    # Anything else that shows an unticked box could hide unfinished work.
    /\[ \]|\[\]/ { violation("an unticked box (including a bare []) that is not a task checkbox: use exactly - [ ] N.M") }
  ' "$1"
}

# Read the records below on stdin and print the findings. Every finding that
# fails the gate starts with "ERROR:"; the other lines are the report.
#   P <id>                      a scenario the spec declares (from spec_scenario_ids)
#   G L M C X                   tasks.md records, see parse_tasks
#   E <group>                   red evidence that passes the format check
#   B <group>                   red evidence that exists but is malformed
analyze() {
  awk -v mode="$1" '
    BEGIN { FS = "\t" }

    # ---- phase 1: record collection ----
    $1 == "X" { print "ERROR: " $2 }
    $1 == "G" { groups[++groupCount] = $2; kind[$2] = $3; reason[$2] = $4 }
    $1 == "L" {
      hasLine[$2] = 1; lineText[$2] = $3
      if ($3 ~ /^none([^A-Za-z0-9]|$)/) { noneReason[$2] = $3; sub(/^none[^A-Za-z0-9]*/, "", noneReason[$2]); noneGroups[++noneCount] = $2 }
    }
    $1 == "C" { split($2, idParts, "."); boxes[idParts[1] + 0]++; total++; if ($3 != "x") { remaining++; unticked = unticked " " $2 } }
    $1 == "E" { hasRed[$2] = 1 }
    $1 == "B" { badRed[$2] = 1 }
    $1 == "P" {
      if ($2 in spec) { if (!(duplicated[$2]++)) print "ERROR: duplicate scenario id " $2 }
      else { spec[$2] = 1; order[++count] = $2 }
    }
    $1 == "M" {
      mapped[$3] = mapped[$3] " " $2
      if (kind[$2] == "tdd") unitTested[$3] = 1; else skipNamed[$3] = skipNamed[$3] " " $2
      named[++namedCount] = $2 FS $3; namesId[$2] = 1
    }

    # ---- phase 2: shared checks, run by plan and by check ----
    function check_boxes(   i) {
      for (i = 1; i <= groupCount; i++)
        if (!boxes[groups[i] + 0]) print "ERROR: group " groups[i] " has no checkboxes"
    }
    function check_scenarios_lines(   i, g) {
      for (i = 1; i <= groupCount; i++) {
        g = groups[i]
        if (!hasLine[g]) {
          if (kind[g] == "tdd") print "ERROR: group " g " has no Scenarios line"
        } else if (lineText[g] ~ /^[ \t]*$/) {
          print "ERROR: group " g " has an empty Scenarios line"
        } else if (lineText[g] ~ /^none([^A-Za-z0-9]|$)/) {
          if (noneReason[g] == "") print "ERROR: group " g " has Scenarios: none without a reason"
        } else if (!(g in namesId)) {
          print "ERROR: group " g " names no scenario id"
        }
      }
    }
    function check_mapping(   i, pair) {
      for (i = 1; i <= namedCount; i++) {
        split(named[i], pair, FS)
        if (!spec[pair[2]]) print "ERROR: group " pair[1] " names unknown scenario " pair[2]
      }
      for (i = 1; i <= count; i++)
        if (!mapped[order[i]]) print "ERROR: scenario " order[i] " is not mapped by any group"
    }
    function report_without_unit_test(   i, scenario, skippers) {
      for (i = 1; i <= count; i++) {
        scenario = order[i]
        if (!mapped[scenario] || unitTested[scenario]) continue
        split(skipNamed[scenario], skippers, " ")
        print "without unit test: " scenario " (group " skippers[1] ": " reason[skippers[1]] ")"
      }
    }

    # ---- phase 3: check-only reports and completion checks ----
    function report_tasks() {
      print "tasks: " total + 0 " total, " remaining + 0 " remaining"
      if (remaining) print "ERROR: unticked:" unticked
    }
    function report_mapping(   i, j, owners, line) {
      for (i = 1; i <= count; i++) {
        split(mapped[order[i]], owners, " ")
        line = ""
        for (j = 1; j in owners; j++) line = line (j > 1 ? ", " : "") "group " owners[j]
        if (line != "") print "scenario " order[i] ": " line
      }
      for (i = 1; i <= groupCount; i++)
        if (kind[groups[i]] == "skip") print "skipped group " groups[i] ": " reason[groups[i]]
      for (i = 1; i <= noneCount; i++) print "no scenario group " noneGroups[i] ": " noneReason[noneGroups[i]]
    }
    function check_evidence(   i, g) {
      for (i = 1; i <= groupCount; i++) {
        g = groups[i]
        if (kind[g] != "tdd") continue
        if (badRed[g]) print "ERROR: group " g " has invalid red evidence"
        else if (!hasRed[g]) print "ERROR: group " g " has no red evidence"
      }
    }

    END {
      if (groupCount == 0) print "ERROR: tasks.md has no task groups"
      check_boxes()
      check_scenarios_lines()
      check_mapping()
      report_without_unit_test()
      if (mode == "check") { report_tasks(); report_mapping(); check_evidence() }
    }
  '
}

# plan and check. Uses the globals set by the argument loop below: root and spec.
cmd_plan_check() {
  mode=$1
  tasks=$root/.devflow/tasks.md
  [ -n "$spec" ] || usage
  for required in "$spec" "$tasks"; do
    if [ ! -f "$required" ]; then
      printf '%s\n' "ERROR: file not found: ${required#"$root"/}"
      printf '%s\n' "$mode: FAIL"
      exit 1
    fi
  done
  report=$(
    check_fences "$spec" "${spec##*/}"
    check_fences "$tasks" tasks.md
    check_headings "$spec"
    check_requirements "$spec"
    check_scenario_headings "$spec"
    check_near_miss_headings "$spec" "${spec##*/}"
    {
      spec_scenario_ids "$spec" | awk '{ print "P\t" $0 }'
      parse_tasks "$tasks"
      for evidence in "$root"/.devflow/red/*.txt; do
        [ -f "$evidence" ] || continue
        name=${evidence##*/}
        if grep -q '^command: ' "$evidence" && grep -q '^exit code: [1-9][0-9]*$' "$evidence"; then
          printf 'E\t%s\n' "${name%.txt}"
        else
          printf 'B\t%s\n' "${name%.txt}"
        fi
      done
    } | analyze "$mode"
  )
  [ -z "$report" ] || printf '%s\n' "$report"
  # Decide with shell built-ins only, so the verdict never depends on an external tool.
  newline='
'
  case "$report" in
    "ERROR:"* | *"${newline}ERROR:"*)
      printf '%s\n' "$mode: FAIL"
      exit 1 ;;
  esac
  printf '%s\n' "$mode: ok"
}

# Exit when a path red writes through is a symlink, or the evidence file exists and is not
# a regular file. Called before the command, and again before and after mkdir -p, so a
# swap made while the command runs is caught before anything is written. Uses root and red_id.
refuse_unsafe_targets() {
  for guarded in "$root/.devflow" "$root/.devflow/red" "$root/.devflow/red/$red_id.txt"; do
    if [ -L "$guarded" ]; then
      printf '%s\n' "red: refusing to write through the symlink $guarded"
      exit 1
    fi
  done
  target=$root/.devflow/red/$red_id.txt
  if [ -e "$target" ] && [ ! -f "$target" ]; then
    printf '%s\n' "red: $target exists and is not a regular file"
    exit 1
  fi
}

# red: run the command that follows "--"; keep evidence of the run when it fails.
# Uses the globals set by the argument loop below: root and red_id.
cmd_red() {
  case $red_id in
    "" | *[!0-9]*) usage ;;
  esac
  [ $# -gt 0 ] || usage
  red_id=$(printf '%s' "$red_id" | sed 's/^0*\([0-9]\)/\1/')
  refuse_unsafe_targets
  output=$(mktemp) || exit 1
  evidence_tmp=
  trap 'rm -f "$output" "$evidence_tmp"' EXIT
  trap 'exit 130' INT TERM HUP
  "$@" >"$output" 2>&1
  code=$?
  if [ "$code" -eq 0 ]; then
    printf '%s\n' "red: the command exited 0, the run is not red; no evidence written"
    exit 1
  fi
  red_dir=$root/.devflow/red
  refuse_unsafe_targets
  mkdir -p "$red_dir" || exit 1
  refuse_unsafe_targets
  evidence_tmp=$(mktemp "$red_dir/.red.XXXXXX") || exit 1
  {
    printf '%s\n' "command: $*"
    for word in "$@"; do printf '%s\n' "argument: $word"; done
    printf '%s\n' "exit code: $code"
    printf '%s\n' "output (last $RED_TAIL_LINES lines):"
    tail -n "$RED_TAIL_LINES" "$output"
  } >"$evidence_tmp" || { printf '%s\n' "red: could not write the evidence"; exit 1; }
  mv -f "$evidence_tmp" "$red_dir/$red_id.txt" || { printf '%s\n' "red: could not write the evidence"; exit 1; }
  evidence_tmp=
  printf '%s\n' "red: recorded .devflow/red/$red_id.txt (exit code $code)"
}

[ $# -ge 1 ] || usage
subcommand=$1
shift

root=.
spec=
red_id=
while [ $# -gt 0 ]; do
  case $1 in
    --root) [ $# -ge 2 ] || usage; root=$2; shift 2 ;;
    --) shift; break ;;
    *)
      if [ "$subcommand" = red ]; then
        [ -z "$red_id" ] || usage
        red_id=$1
      else
        spec=$1
      fi
      shift ;;
  esac
done

case $spec in
  /*|"") ;;
  *) spec=$root/$spec ;;
esac

case $subcommand in
  plan|check) cmd_plan_check "$subcommand" ;;
  red) cmd_red "$@" ;;
  *) usage ;;
esac
