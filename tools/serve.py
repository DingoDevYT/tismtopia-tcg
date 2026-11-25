# Serves the game to your home network with caching off, so phones always load the latest code. Run: py tools/serve.py
import functools, http.server, os, subprocess, threading
class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()
    def send_head(self):  # GET/HEAD: review/ holds the art key (review/asset-key.txt), so this PC only, never the LAN
        nc = lambda p: os.path.normcase(os.path.realpath(p)) + os.sep
        if nc(self.translate_path(self.path)).startswith(nc(os.path.join(root, 'review'))) and self.client_address[0] not in ('127.0.0.1', '::1'):
            self.send_error(403); return None
        return super().send_head()
    def do_PUT(self):  # card editor saves: only from this PC, only the overrides file or images in art/local/
        p = self.path.split('?')[0].lstrip('/')
        ok = p == 'js/card-overrides.js' or (p.startswith('art/local/') and '/' not in p[10:] and '..' not in p)
        if self.client_address[0] not in ('127.0.0.1', '::1') or not ok:
            self.send_error(403); return
        with open(os.path.join(root, p), 'wb') as f: f.write(self.rfile.read(int(self.headers['Content-Length'])))
        self.send_response(204); self.end_headers()
    def do_POST(self):  # card editor publish (after every Save): only from this PC, and only from this site's own pages (no other website can trigger it)
        if self.path != '/publish' or self.client_address[0] not in ('127.0.0.1', '::1') or self.headers.get('Origin') not in ('http://localhost:8123', 'http://127.0.0.1:8123'):
            self.send_error(403); return
        with busy: ok, log = publish()
        body = log.encode('utf-8', 'replace')
        self.send_response(200 if ok else 500); self.send_header('Content-Type', 'text/plain; charset=utf-8'); self.send_header('Content-Length', str(len(body)))
        self.end_headers(); self.wfile.write(body)

PUBLISH = ['js/card-overrides.js', 'assets']  # the ONLY paths ever committed here (never git add -A: private notes live in this folder)
def publish():  # encrypt new art, run the tests, commit the editor's file and assets/, push. Returns (ok, log); the log's last line says what happened.
    git_dirs = [os.path.join(os.environ.get('ProgramFiles', 'C:/Program Files'), 'Git', d) for d in ('bin', os.path.join('usr', 'bin'))]
    env = dict(os.environ, GIT_TERMINAL_PROMPT='0', PATH=os.pathsep.join(git_dirs + [os.environ.get('PATH', '')]))  # git's credential helper needs sh on PATH
    log = []
    def run(*cmd):
        r = subprocess.run(cmd, cwd=root, env=env, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=300)
        log.append((r.stdout + r.stderr).strip()); return r.returncode
    done = lambda ok, last: (ok, '\n'.join(x for x in log if x) + '\n' + last)
    for cmd in (('node', 'tools/encrypt-assets.js'), ('node', 'test/game.test.js'), ('git', 'add', '--', *PUBLISH)):
        if run(*cmd): return done(False, 'Stopped at: ' + ' '.join(cmd))
    if run('git', 'diff', '--cached', '--quiet', '--', *PUBLISH) and run('git', 'commit', '-q', '-m', 'Card editor: update cards', '--', *PUBLISH):
        return done(False, 'Commit failed')
    return done(False, 'Push failed') if run('git', 'push') else done(True, 'Published')

busy = threading.Lock()
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
if __name__ == '__main__':
    http.server.ThreadingHTTPServer(('', 8123), functools.partial(Handler, directory=root)).serve_forever()
