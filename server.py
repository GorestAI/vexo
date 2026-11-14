# The project's small web server: the pages, plus /speak, which turns a phrase into speech
# with ElevenLabs. The key stays here (read from .env); the page never sees it.
#   python3 server.py            then open http://localhost:3000/gesture-speak/
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
API = "https://api.elevenlabs.io/v1"
MODELS = ("eleven_flash_v2_5", "eleven_turbo_v2_5", "eleven_multilingual_v2")
MAX_TEXT = 200
cache = {}          # phrase -> mp3 bytes: a phrase is paid for once
voice = {}          # the voice in use, found on the first call
# This Python may come without the list of trusted web certificates: use the one macOS has.
TRUST = ssl.create_default_context(cafile="/etc/ssl/cert.pem" if os.path.exists("/etc/ssl/cert.pem") else None)


def env(name):
    try:
        with open(os.path.join(ROOT, ".env")) as f:
            for line in f:
                key, _, value = line.strip().partition("=")
                if key == name:
                    return value.strip()
    except OSError:
        pass
    return os.environ.get(name, "")


def call(path, body=None):
    request = urllib.request.Request(API + path, data=None if body is None else json.dumps(body).encode(),
                                     headers={"xi-api-key": env("ELEVENLABS_API_KEY"), "Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=20, context=TRUST) as answer:
        return answer.read()


def speak(text):
    if text in cache:
        return cache[text]
    if "id" not in voice:
        wanted = env("ELEVENLABS_VOICE_ID")
        voice["id"] = wanted or json.loads(call("/voices"))["voices"][0]["voice_id"]
    problem = None
    for model in ([voice["model"]] if "model" in voice else MODELS):
        try:
            sound = call("/text-to-speech/%s?output_format=mp3_44100_128" % voice["id"], {"text": text, "model_id": model})
            voice["model"] = model
            if len(cache) < 500:
                cache[text] = sound
            return sound
        except urllib.error.HTTPError as e:
            problem = "ElevenLabs said %s: %s" % (e.code, e.read()[:300].decode("utf-8", "replace"))
    raise RuntimeError(problem)


SENTENCE_MODEL = "gpt-4.1-mini"
SENTENCE_RULES = (
    "A person who cannot speak makes hand gestures; each gesture stands for a word or short phrase. "
    "You get the phrases in the order they were made. Join them into what the person means to say, as one "
    "short, natural spoken utterance in the first person. Keep every phrase's meaning and their order, add only "
    "the small words and punctuation that natural speech needs, never add new ideas, never explain. "
    "Answer with the utterance only.")
sentences = {}      # the phrases, joined -> the sentence: the same run is paid for once


def sentence(phrases):
    key = " | ".join(phrases)
    if key in sentences:
        return sentences[key]
    body = {"model": SENTENCE_MODEL, "temperature": 0.2, "max_tokens": 80,
            "messages": [{"role": "system", "content": SENTENCE_RULES},
                         {"role": "user", "content": json.dumps(phrases)}]}
    request = urllib.request.Request("https://api.openai.com/v1/chat/completions", data=json.dumps(body).encode(),
                                     headers={"Authorization": "Bearer " + env("OPENAI_API_KEY"), "Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=15, context=TRUST) as answer:
        text = json.loads(answer.read())["choices"][0]["message"]["content"].strip().strip('"')[:MAX_TEXT]
    if len(sentences) < 500:
        sentences[key] = text
    return text


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def hidden(self):
        """.env, .git, .venv and every other dot file are never served."""
        return any(part.startswith(".") for part in self.path.split("?")[0].split("/") if part)

    def do_GET(self):
        if self.hidden():
            return self.send_error(404)
        return super().do_GET()

    def do_HEAD(self):
        if self.hidden():
            return self.send_error(404)
        return super().do_HEAD()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        if self.path not in ("/speak", "/sentence"):
            return self.send_error(404)
        # Only this computer's own pages may ask: a web site open in another tab may not.
        origin = self.headers.get("Origin", "")
        if origin not in ("http://localhost:%d" % PORT, "http://127.0.0.1:%d" % PORT):
            return self.send_error(403)
        try:
            length = int(self.headers.get("Content-Length", "0"))
            asked = json.loads(self.rfile.read(min(length, 4096)))
            if self.path == "/sentence":
                return self.do_sentence(asked)
            text = str(asked["text"]).strip()
        except (ValueError, KeyError, TypeError):
            return self.send_error(400)
        if not text or len(text) > MAX_TEXT:
            return self.send_error(400)
        if not env("ELEVENLABS_API_KEY"):
            return self.send_error(503, "No ELEVENLABS_API_KEY in .env")
        try:
            sound = speak(text)
        except Exception as e:                      # the page falls back to the browser's own voice
            print("speak failed:", e, file=sys.stderr)
            return self.send_error(502, "ElevenLabs did not answer")
        self.send_response(200)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Content-Length", str(len(sound)))
        self.end_headers()
        self.wfile.write(sound)

    def do_sentence(self, asked):
        """{"phrases": ["Hello", "How are you?"]} -> {"text": "Hello, how are you?"}"""
        phrases = asked["phrases"]
        if not isinstance(phrases, list) or not 1 <= len(phrases) <= 12:
            return self.send_error(400)
        phrases = [str(one).strip()[:60] for one in phrases]
        if not all(phrases):
            return self.send_error(400)
        if not env("OPENAI_API_KEY"):
            return self.send_error(503, "No OPENAI_API_KEY in .env")
        try:
            answer = json.dumps({"text": sentence(phrases)}).encode()
        except Exception as e:                      # the page then says the phrases as they are
            print("sentence failed:", e, file=sys.stderr)
            return self.send_error(502, "OpenAI did not answer")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(answer)))
        self.end_headers()
        self.wfile.write(answer)


if __name__ == "__main__":
    print("http://localhost:%d/gesture-speak/" % PORT)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
