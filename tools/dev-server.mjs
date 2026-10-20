// 로컬 개발용 서버: frontend/ 화면 파일을 띄우고, /api/* 요청만 FastAPI로 넘긴다.
// CloudFront가 하는 일(화면은 S3, /api/*는 FastAPI)을 내 PC에서 흉내 내는 것이라
// 화면 코드를 고치지 않고 상대 경로(/api/...) 그대로 실제 API를 부를 수 있다.
// 개발용이므로 S3에는 올리지 않는다.
//
// 실행 (저장소 맨 위 폴더에서):
//   node tools/dev-server.mjs                                   화면 http://localhost:5500, API http://127.0.0.1:8000
//   node tools/dev-server.mjs --api http://192.168.0.12:8000    다른 PC(B)의 FastAPI로 넘기기
//   node tools/dev-server.mjs --port 5600
// 가짜 서버로 보려면 http://localhost:5500/?mock=1

import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

function option(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const PORT = Number(option("--port", 5500));
const API = new URL(option("--api", "http://127.0.0.1:8000"));
const ROOT = resolve(fileURLToPath(new URL("../frontend/", import.meta.url)));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

// 다음 홉으로 넘기면 안 되는 헤더
const HOP_BY_HOP = ["connection", "keep-alive", "transfer-encoding", "upgrade", "proxy-connection", "host"];

function proxyToApi(req, res) {
  const headers = { ...req.headers };
  HOP_BY_HOP.forEach((h) => delete headers[h]);
  headers.host = API.host;

  const upstream = http.request(
    { hostname: API.hostname, port: API.port || 80, path: req.url, method: req.method, headers },
    (apiRes) => {
      const out = { ...apiRes.headers };
      HOP_BY_HOP.forEach((h) => delete out[h]);
      res.writeHead(apiRes.statusCode, out);
      apiRes.pipe(res);
    },
  );
  upstream.on("error", (err) => {
    // FastAPI가 꺼져 있을 때. CloudFront처럼 JSON이 아닌 502를 돌려준다(화면은 SERVER_ERROR로 처리).
    console.error(`[api] ${req.method} ${req.url} → ${API.origin} 연결 실패: ${err.code || err.message}`);
    if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("502 Bad Gateway (dev-server: API 서버에 연결할 수 없음)");
  });
  req.pipe(upstream);
}

async function serveFile(req, res) {
  const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const file = normalize(join(ROOT, relative));
  if (file !== ROOT && !file.startsWith(ROOT + sep)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": TYPES[extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store", // 고친 파일이 바로 보이게
    });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    // CloudFront 사용자 지정 오류 응답을 쓰지 않으므로 index.html로 돌리지 않는다.
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("404 Not Found");
  }
}

const server = http.createServer((req, res) => {
  const started = Date.now();
  res.on("finish", () => {
    if (req.url.startsWith("/api/")) console.log(`[api] ${req.method} ${req.url} ${res.statusCode} ${Date.now() - started}ms`);
  });
  if (req.url === "/api" || req.url.startsWith("/api/")) return proxyToApi(req, res);
  if (req.method !== "GET" && req.method !== "HEAD") return res.writeHead(405).end("Method Not Allowed");
  serveFile(req, res);
});

server.listen(PORT, () => {
  console.log(`화면:   http://localhost:${PORT}/`);
  console.log(`가짜 서버: http://localhost:${PORT}/?mock=1`);
  console.log(`/api/* → ${API.origin}`);
});
