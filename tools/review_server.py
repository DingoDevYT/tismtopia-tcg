# Local card-review server. Serves the game folder, the art folder under /arte/, and saves your review decisions.
# Run:  py tools/review_server.py      then open http://localhost:8130/review.html
# Only listens on this computer (127.0.0.1). Decisions go to review/decisions.json (git-ignored).
import json
import os
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.environ.get('TCG_ART', os.path.join(os.path.expanduser('~'), 'Downloads', 'arte TismTopia'))
REVIEW = os.path.join(ROOT, 'review')
IMAGES = ('.png', '.jpg', '.jpeg', '.gif', '.webp')
PORT = int(os.environ.get('TCG_REVIEW_PORT', '8130'))


def inside(base, rel):
    """Resolve rel under base, refusing anything that escapes it (../ tricks)."""
    real_base = os.path.realpath(base)
    p = os.path.realpath(os.path.join(real_base, rel))
    if os.path.commonpath([p, real_base]) != real_base:
        raise PermissionError(rel)
    return p


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = urllib.parse.unquote(urllib.parse.urlsplit(path).path)
        if path.startswith('/arte/'):
            return inside(ART, path[len('/arte/'):])
        return inside(ROOT, path.lstrip('/'))

    def send_json(self, data, code=200):
        body = json.dumps(data).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        try:
            if url.path == '/api/drafts':
                out, folder = [], os.path.join(REVIEW, 'drafts')
                for name in sorted(os.listdir(folder)) if os.path.isdir(folder) else []:
                    if not name.endswith('.json'):
                        continue
                    try:
                        with open(os.path.join(folder, name), encoding='utf-8') as f:
                            out += [dict(c, source=name) for c in json.load(f) if isinstance(c, dict)]
                    except (ValueError, OSError) as e:
                        out.append({'id': 'broken_' + name, 'error': f'{name}: {e}', 'source': name})
                return self.send_json(out)
            if url.path == '/api/review':
                path = os.path.join(REVIEW, 'decisions.json')
                if not os.path.exists(path):
                    return self.send_json({})
                with open(path, encoding='utf-8') as f:
                    return self.send_json(json.load(f))
            if url.path == '/api/art':
                folder = urllib.parse.parse_qs(url.query).get('folder', [''])[0]
                base = inside(ART, folder)
                files = []
                for dirpath, _, names in os.walk(base):
                    for n in names:
                        if n.lower().endswith(IMAGES):
                            files.append(os.path.relpath(os.path.join(dirpath, n), base).replace(os.sep, '/'))
                return self.send_json(sorted(files, key=str.lower))
            return super().do_GET()
        except PermissionError:
            return self.send_error(403)
        except FileNotFoundError:
            return self.send_error(404)

    def do_POST(self):
        if urllib.parse.urlsplit(self.path).path != '/api/review':
            return self.send_error(404)
        size = int(self.headers.get('Content-Length', 0))
        if size <= 0 or size > 20_000_000:
            return self.send_error(413)
        try:
            data = json.loads(self.rfile.read(size))
        except ValueError:
            return self.send_error(400, 'Not JSON')
        if not isinstance(data, dict):
            return self.send_error(400, 'Expected an object')
        os.makedirs(REVIEW, exist_ok=True)
        path = os.path.join(REVIEW, 'decisions.json')
        with open(path + '.tmp', 'w', encoding='utf-8') as f:  # write then swap, so a crash can't leave half a file
            json.dump(data, f, indent=1, ensure_ascii=False)
        os.replace(path + '.tmp', path)
        return self.send_json({'ok': True, 'count': len(data)})

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    print(f'Card review: http://localhost:{PORT}/review.html   (art from {ART})')
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
