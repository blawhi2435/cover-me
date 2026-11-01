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


class RealisticLeakTest(unittest.TestCase):
    """Credential shapes found in real logs; each must not survive."""

    SECRET = "S3CR3TVALUE9"

    def assertGone(self, text):
        out, n = redact_text(text)
        self.assertNotIn(self.SECRET, out, out)
        self.assertGreaterEqual(n, 1)
        return out

    def test_header_mid_line(self):
        out = self.assertGone("curl -H 'Authorization: Bearer S3CR3TVALUE9' https://x")
        self.assertIn("https://x", out)

    def test_header_in_js_and_python_objects(self):
        self.assertGone("{ Authorization: 'Bearer S3CR3TVALUE9' }")
        self.assertGone("{'Authorization': 'Bearer S3CR3TVALUE9'}")

    def test_header_in_nested_json(self):
        self.assertGone('{"headers": {"Authorization": "Bearer S3CR3TVALUE9"}}')
        self.assertGone('{"headers": {"Cookie": "sid=S3CR3TVALUE9"}}')

    def test_custom_credential_headers(self):
        for name in ["X-CSRF-Token", "x-xsrf-token", "api-key", "X-Api-Key"]:
            with self.subTest(name=name):
                self.assertGone(name + ": S3CR3TVALUE9")

    def test_compound_and_camel_case_keys(self):
        for key in ["accessToken", "refreshToken", "id_token", "auth_token",
                    "session_token", "csrf_token", "AWS_SECRET_ACCESS_KEY",
                    "client-secret", "sessionId", "db_password"]:
            with self.subTest(key=key):
                self.assertGone('{"%s": "S3CR3TVALUE9"}' % key)
                self.assertGone("%s=S3CR3TVALUE9" % key)

    def test_quoted_values(self):
        self.assertGone('password="pass S3CR3TVALUE9 word"')
        self.assertGone("password: 'S3CR3TVALUE9'")

    def test_escaped_quote_in_json_value(self):
        out = self.assertGone('{"password": "abc\\"S3CR3TVALUE9", "user": "bob"}')
        self.assertIn('"user": "bob"', out)

    def test_url_secrets(self):
        self.assertGone("GET /cb?code=S3CR3TVALUE9&state=xyz")
        self.assertGone("https://b.s3.amazonaws.com/f?X-Amz-Signature=S3CR3TVALUE9")
        out = self.assertGone("https://admin:S3CR3TVALUE9@host/path")
        self.assertIn("admin", out)
        self.assertGone("postgres://u:S3CR3TVALUE9@db:5432/app")

    def test_private_key_block(self):
        self.assertGone(
            "-----BEGIN PRIVATE KEY-----\nMIIS3CR3TVALUE9\n-----END PRIVATE KEY-----")
        self.assertGone(
            "-----BEGIN RSA PRIVATE KEY-----\nS3CR3TVALUE9\n-----END RSA PRIVATE KEY-----")

    def test_unterminated_private_key_block(self):
        self.assertGone("-----BEGIN PRIVATE KEY-----\nMIIS3CR3TVALUE9\n(truncated)")

    def test_quoted_header_value_masked_once(self):
        out, n = redact_text("{ Authorization: 'Bearer S3CR3TVALUE9' }")
        self.assertEqual(out, "{ Authorization: '[REDACTED]' }")
        self.assertEqual(n, 1)

    def test_known_token_prefixes(self):
        for tok in ["ghp_S3CR3TVALUE9aaaaaaaaaaaaaaaa", "xoxb-S3CR3TVALUE9-aaaa",
                    "AKIAS3CR3TVALUE9AAAA", "sk-S3CR3TVALUE9aaaaaaaaaaaa"]:
            with self.subTest(tok=tok):
                self.assertGone("using " + tok + " now")

    def test_bearer_in_prose(self):
        self.assertGone("sent Bearer S3CR3TVALUE9 to the api")

    def test_ordinary_log_line_untouched(self):
        line = "INFO 200 GET /api/sessions took 12ms status code 200"
        out, n = redact_text(line)
        self.assertEqual(out, line)
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


class RedactHarLeakTest(unittest.TestCase):
    SECRET = "S3CR3TVALUE9"

    def assertHarClean(self, har):
        redact_har(har)
        self.assertNotIn(self.SECRET, json.dumps(har))

    def test_form_params(self):
        self.assertHarClean({"log": {"entries": [{"request": {"postData": {
            "params": [{"name": "password", "value": "S3CR3TVALUE9"}]}}}]}})

    def test_custom_header_and_camel_query(self):
        self.assertHarClean({"log": {"entries": [{"request": {
            "headers": [{"name": "x-csrf-token", "value": "S3CR3TVALUE9"}],
            "queryString": [{"name": "accessToken", "value": "S3CR3TVALUE9"}]}}]}})

    def test_redirect_url(self):
        self.assertHarClean({"log": {"entries": [{"response": {
            "redirectURL": "https://app/cb#id_token=S3CR3TVALUE9"}}]}})

    def test_websocket_messages(self):
        self.assertHarClean({"log": {"entries": [{"_webSocketMessages": [
            {"type": "send", "data": '{"token": "S3CR3TVALUE9"}'}]}]}})

    def test_base64_body_dropped(self):
        har = {"log": {"entries": [{"response": {"content": {
            "encoding": "base64", "text": "UzNDUjNUVkFMVUU5"}}}]}}
        redact_har(har)
        self.assertNotIn("UzNDUjNUVkFMVUU5", json.dumps(har))


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

    def test_cli_refuses_har_with_unexpected_shape(self):
        src = self.write("list.har", b"[1, 2]")
        res = run_cli(src, self.path("out.har"))
        self.assertEqual(res.returncode, 3)
        self.assertFalse(os.path.exists(self.path("out.har")))

    def test_cli_usage(self):
        res = run_cli("only-one-arg")
        self.assertEqual(res.returncode, 2)


if __name__ == "__main__":
    unittest.main()
