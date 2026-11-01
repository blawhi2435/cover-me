#!/usr/bin/env python3
"""Redact credentials from a text file before it leaves this machine.

Usage: python3 redact.py <input> <output>

Exit codes:
  0  output written (stderr: "redacted <n> value(s)")
  2  usage error
  3  refused: binary, not UTF-8, a .har that is not a JSON object, or any
     error while processing. No output file is created.
Anything other than 0 means: do not send the file; send a text summary.

Exit 0 is NOT a guarantee. This is a pattern-based redactor: it catches the
common shapes (credential headers, *token*/*secret*/*password*/*session*
keys, URL userinfo, OAuth codes, signatures, private keys, well-known token
prefixes, JWTs, Bearer values) but cannot know every secret format. Skim the
output before sending it.

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
SCAN_BYTES = 8192

SENSITIVE_HEADERS = {
    "authorization", "proxy-authorization", "cookie", "set-cookie",
    "x-api-key", "api-key", "x-auth-token", "x-csrf-token", "x-xsrf-token",
}
SENSITIVE_PARAMS = {"code", "sig", "sid"}

_NOT_MASKED = r"(?!\[REDACTED)"
_SEP = r"""(["']?\s*[:=]\s*)"""
# Groups 3-5 after a key (1) and separator (2): opening quote, the value
# (honouring backslash escapes), closing quote.
_QUOTED = r"""(["'])""" + _NOT_MASKED + r"""((?:\\.|(?!\3)[^\\\r\n])*)(\3)"""

_HEADER_NAMES = "|".join(sorted((re.escape(h) for h in SENSITIVE_HEADERS),
                                key=len, reverse=True))
_HEADER_KEY = r"(?<![A-Za-z0-9_-])(" + _HEADER_NAMES + r")"
_SECRET_IDENT = (
    r"[A-Za-z0-9_.-]*?"
    r"(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|"
    r"private[_-]?key|session|credential|signature)"
    r"[A-Za-z0-9_.-]*"
)
_SECRET_KEY = r"(?<![A-Za-z0-9_.-])(" + _SECRET_IDENT + r")"
_SECRET_NAME = re.compile(_SECRET_IDENT, re.IGNORECASE)


def _quoted_pair(key):
    return re.compile(key + _SEP + _QUOTED, re.IGNORECASE)


_RULES = [
    # (pattern, replacement function)
    (re.compile(r"-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?"
                r"(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|\Z)"),
     lambda m: "[REDACTED_PRIVATE_KEY]"),
    (re.compile(r"""([A-Za-z][A-Za-z0-9+.-]*://[^/\s:@'"]+:)""" + _NOT_MASKED +
                r"""([^/\s@'"]+)(@)"""),
     lambda m: m.group(1) + MASK + m.group(3)),
    (_quoted_pair(_HEADER_KEY),
     lambda m: m.group(1) + m.group(2) + m.group(3) + MASK + m.group(5)),
    (re.compile(_HEADER_KEY + _SEP + _NOT_MASKED + r"""(?!["'\s])([^"'\r\n]+)""",
                re.IGNORECASE),
     lambda m: m.group(1) + m.group(2) + MASK),
    (_quoted_pair(_SECRET_KEY),
     lambda m: m.group(1) + m.group(2) + m.group(3) + MASK + m.group(5)),
    (re.compile(_SECRET_KEY + _SEP + _NOT_MASKED + r"""(?!["'\s])([^\s&;,"'<>]+)""",
                re.IGNORECASE),
     lambda m: m.group(1) + m.group(2) + MASK),
    (re.compile(r"""([?&#;](?:code|sig)=)""" + _NOT_MASKED + r"""([^&#\s"']+)""",
                re.IGNORECASE),
     lambda m: m.group(1) + MASK),
    (re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|"
                r"xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|"
                r"sk-[A-Za-z0-9_-]{20,})"),
     lambda m: "[REDACTED_TOKEN]"),
    (re.compile(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"),
     lambda m: "[REDACTED_JWT]"),
    (re.compile(r"(\bBearer\s+)" + _NOT_MASKED + r"([A-Za-z0-9._~+/=-]+)",
                re.IGNORECASE),
     lambda m: m.group(1) + MASK),
]


def redact_text(text):
    """Return (redacted_text, number_of_values_redacted)."""
    total = 0
    for pattern, repl in _RULES:
        text, n = pattern.subn(repl, text)
        total += n
    return text, total


def _is_secret_name(name):
    name = str(name)
    lower = name.lower()
    return (lower in SENSITIVE_HEADERS or lower in SENSITIVE_PARAMS
            or _SECRET_NAME.fullmatch(name) is not None)


def _redact_field(obj, key):
    value = obj.get(key) if isinstance(obj, dict) else None
    if not isinstance(value, str):
        return 0
    obj[key], n = redact_text(value)
    return n


def _redact_pairs(pairs):
    count = 0
    for pair in pairs or []:
        if _is_secret_name(pair.get("name", "")):
            pair["value"] = MASK
            count += 1
        else:
            count += _redact_field(pair, "value")
    return count


def _redact_message(msg):
    count = _redact_pairs(msg.get("headers"))
    count += _redact_pairs(msg.get("queryString"))
    for cookie in msg.get("cookies") or []:
        cookie["value"] = MASK
        count += 1
    count += _redact_field(msg, "url")
    count += _redact_field(msg, "redirectURL")
    post = msg.get("postData") or {}
    count += _redact_pairs(post.get("params"))
    count += _redact_field(post, "text")
    content = msg.get("content") or {}
    if str(content.get("encoding", "")).lower() == "base64" and content.get("text"):
        content["text"] = "[REDACTED_BASE64_BODY]"
        count += 1
    else:
        count += _redact_field(content, "text")
    return count


def redact_har(obj):
    """Redact a parsed HAR in place; return the number of values redacted.

    Raises ValueError when the input is not a HAR-shaped JSON object.
    """
    if not isinstance(obj, dict):
        raise ValueError("HAR top level is not a JSON object")
    count = 0
    for entry in (obj.get("log") or {}).get("entries") or []:
        for side in ("request", "response"):
            if isinstance(entry.get(side), dict):
                count += _redact_message(entry[side])
        for message in entry.get("_webSocketMessages") or []:
            count += _redact_field(message, "data")
    return count


def _refuse(reason):
    sys.stderr.write("refused: " + reason + "\n")
    return 3


def main(argv):
    if len(argv) != 3:
        sys.stderr.write("usage: redact.py <input> <output>\n")
        return 2
    src, dst = argv[1], argv[2]
    try:
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
                count = redact_har(obj)
            except (ValueError, AttributeError, TypeError) as exc:
                return _refuse(".har file could not be processed: %s" % exc)
            out = json.dumps(obj, indent=2, ensure_ascii=False)
        else:
            out, count = redact_text(text)

        tmp = dst + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(out)
        os.replace(tmp, dst)
    except OSError as exc:
        return _refuse("could not read or write: %s" % exc)
    sys.stderr.write("redacted %d value(s)\n" % count)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
