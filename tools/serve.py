# Serves the game to your home network with caching off, so phones always load the latest code. Run: py tools/serve.py
import functools, http.server, os
class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()
    def do_PUT(self):  # card editor saves: only from this PC, only the overrides file or images in art/local/
        p = self.path.split('?')[0].lstrip('/')
        ok = p == 'js/card-overrides.js' or (p.startswith('art/local/') and '/' not in p[10:] and '..' not in p)
        if self.client_address[0] not in ('127.0.0.1', '::1') or not ok:
            self.send_error(403); return
        with open(os.path.join(root, p), 'wb') as f: f.write(self.rfile.read(int(self.headers['Content-Length'])))
        self.send_response(204); self.end_headers()
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
http.server.ThreadingHTTPServer(('', 8123), functools.partial(Handler, directory=root)).serve_forever()
