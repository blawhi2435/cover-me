#!/usr/bin/env python3
"""Redact credentials from a text file before it leaves this machine.

Usage: python3 redact.py <input> <output>

Exit codes:
  0  output written (stderr: "redacted <n> value(s)")
  2  usage error
  3  refused: the input is binary, not UTF-8, or a .har that is not JSON.
     No output file is created. Do not send the file; send a text summary.

Scope: text logs, HTTP dumps and HAR files. Images are out of scope (the
skill sends screenshots as-is by policy). Archives such as Playwright trace
zips and any other binary are refused, never passed through.

Standard library only (Python >= 3.8).
"""

import json
import os
import re
import sys

MASK = "[REDACTED]"
JWT_MASK = "[REDACTED_JWT]"

SENSITIVE_HEADERS = {
    "authorization", "proxy-authorization", "cookie", "set-cookie",
    "x-api-key", "x-auth-token",
}
SECRET_KEYS = [
    "password", "passwd", "token", "access_token", "refresh_token",
    "client_secret", "secret", "api_key", "apikey",
]
_KEYS = "|".join(sorted(SECRET_KEYS, key=len, reverse=True))
_NOT_MASKED = r"(?!\[REDACTED)"

_HEADER_LINE = re.compile(
    r"^(\s*(?:" + "|".join(sorted(SENSITIVE_HEADERS)) + r")\s*:\s*)" + _NOT_MASKED + r"(\S.*)$",
    re.IGNORECASE | re.MULTILINE,
)
_JWT = re.compile(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")
_JSON_PAIR = re.compile(
    r'("(?:' + _KEYS + r')"\s*:\s*")' + _NOT_MASKED + r'([^"]*)(")', re.IGNORECASE
)
_PLAIN_PAIR = re.compile(
    r"(\b(?:" + _KEYS + r")\b\s*[=:]\s*)" + _NOT_MASKED + r"""([^\s&;,"']+)""",
    re.IGNORECASE,
)

SCAN_BYTES = 8192


def redact_text(text):
    """Return (redacted_text, number_of_values_redacted)."""
    total = 0
    text, n = _HEADER_LINE.subn(lambda m: m.group(1) + MASK, text)
    total += n
    text, n = _JWT.subn(JWT_MASK, text)
    total += n
    text, n = _JSON_PAIR.subn(lambda m: m.group(1) + MASK + m.group(3), text)
    total += n
    text, n = _PLAIN_PAIR.subn(lambda m: m.group(1) + MASK, text)
    total += n
    return text, total


def _redact_field(obj, key):
    value = obj.get(key)
    if not isinstance(value, str):
        return 0
    obj[key], n = redact_text(value)
    return n


def _redact_message(msg):
    count = 0
    for header in msg.get("headers") or []:
        if str(header.get("name", "")).lower() in SENSITIVE_HEADERS:
            header["value"] = MASK
            count += 1
        else:
            count += _redact_field(header, "value")
    for cookie in msg.get("cookies") or []:
        cookie["value"] = MASK
        count += 1
    for param in msg.get("queryString") or []:
        if str(param.get("name", "")).lower() in SECRET_KEYS:
            param["value"] = MASK
            count += 1
    count += _redact_field(msg, "url")
    count += _redact_field(msg.get("postData") or {}, "text")
    count += _redact_field(msg.get("content") or {}, "text")
    return count


def redact_har(obj):
    """Redact a parsed HAR in place; return the number of values redacted."""
    count = 0
    for entry in (obj.get("log") or {}).get("entries") or []:
        for side in ("request", "response"):
            if isinstance(entry.get(side), dict):
                count += _redact_message(entry[side])
    return count


def _refuse(reason):
    sys.stderr.write("refused: " + reason + "\n")
    return 3


def main(argv):
    if len(argv) != 3:
        sys.stderr.write("usage: redact.py <input> <output>\n")
        return 2
    src, dst = argv[1], argv[2]
    with open(src, "rb") as f:
        data = f.read()
    if b"\x00" in data[:SCAN_BYTES]:
        return _refuse("binary file; send a text summary instead")
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        return _refuse("not UTF-8 text; send a text summary instead")

    if src.lower().endswith(".har"):
        try:
            obj = json.loads(text)
        except ValueError:
            return _refuse(".har file is not valid JSON")
        count = redact_har(obj)
        out = json.dumps(obj, indent=2, ensure_ascii=False)
    else:
        out, count = redact_text(text)

    tmp = dst + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(out)
    os.replace(tmp, dst)
    sys.stderr.write("redacted %d value(s)\n" % count)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
