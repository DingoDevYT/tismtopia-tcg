# Serves the game to your home network with caching off, so phones always load the latest code. Run: py tools/serve.py
import functools, http.server, os
class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
http.server.ThreadingHTTPServer(('', 8123), functools.partial(Handler, directory=root)).serve_forever()
