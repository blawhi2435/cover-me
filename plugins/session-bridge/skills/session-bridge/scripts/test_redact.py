import json
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from redact import redact_har, redact_text  # noqa: E402

SCRIPT = os.path.join(HERE, "redact.py")


def run_cli(*args):
    return subprocess.run(
        [sys.executable, SCRIPT, *args], capture_output=True, text=True
    )


class RedactTextTest(unittest.TestCase):
    def test_authorization_header(self):
        out, n = redact_text("Authorization: Bearer abc.def")
        self.assertEqual(out, "Authorization: [REDACTED]")
        self.assertEqual(n, 1)
        out, _ = redact_text("authorization: Basic xyz")
        self.assertEqual(out, "authorization: [REDACTED]")

    def test_cookie_and_set_cookie(self):
        out, _ = redact_text("Cookie: a=1; b=2")
        self.assertEqual(out, "Cookie: [REDACTED]")
        out, _ = redact_text("Set-Cookie: sid=9; HttpOnly")
        self.assertEqual(out, "Set-Cookie: [REDACTED]")

    def test_jwt_anywhere(self):
        text = "got eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl from login"
        out, n = redact_text(text)
        self.assertEqual(out, "got [REDACTED_JWT] from login")
        self.assertEqual(n, 1)

    def test_key_value_secrets(self):
        keys = ["password", "passwd", "token", "access_token", "refresh_token",
                "client_secret", "secret", "api_key", "apikey"]
        for key in keys:
            with self.subTest(key=key):
                out, _ = redact_text(f"{key}=v4lue rest")
                self.assertEqual(out, f"{key}=[REDACTED] rest")
                out, _ = redact_text(f"{key}: v4lue")
                self.assertEqual(out, f"{key}: [REDACTED]")
                out, _ = redact_text(f'{{"{key}": "v4lue", "a": 1}}')
                self.assertEqual(out, f'{{"{key}": "[REDACTED]", "a": 1}}')

    def test_plain_text_untouched(self):
        out, n = redact_text("GET /api/health 200")
        self.assertEqual(out, "GET /api/health 200")
        self.assertEqual(n, 0)


class RedactHarTest(unittest.TestCase):
    def har(self):
        return {"log": {"entries": [{
            "request": {
                "headers": [{"name": "authorization", "value": "Bearer x"},
                            {"name": "Accept", "value": "*/*"}],
                "cookies": [{"name": "sid", "value": "9"}],
                "postData": {"text": "password=hunter2"},
            },
            "response": {
                "headers": [{"name": "set-cookie", "value": "sid=9"}],
                "cookies": [],
            },
        }]}}

    def test_har_headers_and_cookies(self):
        obj = self.har()
        n = redact_har(obj)
        entry = obj["log"]["entries"][0]
        req, resp = entry["request"], entry["response"]
        self.assertEqual(req["headers"][0]["value"], "[REDACTED]")
        self.assertEqual(req["headers"][1]["value"], "*/*")
        self.assertEqual(req["cookies"][0]["value"], "[REDACTED]")
        self.assertEqual(req["postData"]["text"], "password=[REDACTED]")
        self.assertEqual(resp["headers"][0]["value"], "[REDACTED]")
        self.assertEqual(n, 4)

    def test_har_header_names_case_insensitive(self):
        obj = {"log": {"entries": [{"request": {"headers": [
            {"name": "X-Api-Key", "value": "k"},
            {"name": "Proxy-Authorization", "value": "p"},
            {"name": "x-auth-token", "value": "t"}]}}]}}
        redact_har(obj)
        values = [h["value"] for h in obj["log"]["entries"][0]["request"]["headers"]]
        self.assertEqual(values, ["[REDACTED]"] * 3)


class CliTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()

    def path(self, name):
        return os.path.join(self.dir, name)

    def write(self, name, data):
        with open(self.path(name), "wb") as f:
            f.write(data)
        return self.path(name)

    def test_cli_redacts_text(self):
        src = self.write("in.log", b"Cookie: a=1\nok line\n")
        res = run_cli(src, self.path("out.log"))
        self.assertEqual(res.returncode, 0, res.stderr)
        with open(self.path("out.log")) as f:
            self.assertEqual(f.read(), "Cookie: [REDACTED]\nok line\n")
        self.assertIn("redacted 1 value(s)", res.stderr)

    def test_cli_refuses_binary(self):
        src = self.write("trace.zip", b"PK\x03\x04\x00\x00binary")
        res = run_cli(src, self.path("out"))
        self.assertEqual(res.returncode, 3)
        self.assertTrue(res.stderr.startswith("refused:"))
        self.assertFalse(os.path.exists(self.path("out")))

    def test_cli_refuses_invalid_utf8(self):
        src = self.write("in.txt", b"\xff\xfe abc")
        res = run_cli(src, self.path("out"))
        self.assertEqual(res.returncode, 3)
        self.assertFalse(os.path.exists(self.path("out")))

    def test_cli_har_by_extension(self):
        har = {"log": {"entries": [{"request": {"headers": [
            {"name": "Cookie", "value": "sid=1"}]}}]}}
        src = self.write("net.har", json.dumps(har).encode())
        res = run_cli(src, self.path("out.har"))
        self.assertEqual(res.returncode, 0, res.stderr)
        with open(self.path("out.har")) as f:
            out = json.load(f)
        self.assertEqual(
            out["log"]["entries"][0]["request"]["headers"][0]["value"], "[REDACTED]")

    def test_cli_refuses_invalid_har(self):
        src = self.write("bad.har", b"{not json")
        res = run_cli(src, self.path("out.har"))
        self.assertEqual(res.returncode, 3)
        self.assertFalse(os.path.exists(self.path("out.har")))

    def test_cli_usage(self):
        res = run_cli("only-one-arg")
        self.assertEqual(res.returncode, 2)


if __name__ == "__main__":
    unittest.main()
