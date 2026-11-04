import http from "node:http";
const routes = [["/auth/v1", 9999], ["/rest/v1", 3001]];
http.createServer((req, res) => {
  const r = routes.find(([p]) => req.url.startsWith(p));
  if (!r) { res.writeHead(404); return res.end(); }
  const path = req.url.slice(r[0].length) || "/";
  const headers = { ...req.headers, host: "127.0.0.1:" + r[1] };
  const p = http.request({ host: "127.0.0.1", port: r[1], path, method: req.method, headers }, (pr) => { res.writeHead(pr.statusCode, pr.headers); pr.pipe(res); });
  p.on("error", (e) => { res.writeHead(502); res.end(String(e)); });
  req.pipe(p);
}).listen(54321, "127.0.0.1", () => console.log("gateway on 54321"));
