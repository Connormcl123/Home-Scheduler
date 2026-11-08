const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const port = Number(process.env.PORT || 4173);
const root = process.cwd();
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".json": "application/json"
};

// Optional HTTPS: set HTTPS_CERT and HTTPS_KEY to PEM files (phones need https for motion sensors).
const certFile = process.env.HTTPS_CERT;
const keyFile = process.env.HTTPS_KEY;
const useHttps = Boolean(certFile && keyFile);

function handler(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  let file = requestUrl.pathname === "/" ? "index.html" : decodeURIComponent(requestUrl.pathname.slice(1));
  if (file.endsWith("/")) file += "index.html";
  const fullPath = path.resolve(root, file);

  if (!fullPath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(fullPath, (error, data) => {
    if (error && error.code === "EISDIR") {
      response.writeHead(301, { Location: requestUrl.pathname + "/" });
      response.end();
      return;
    }

    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": types[path.extname(fullPath)] || "application/octet-stream"
    });
    response.end(data);
  });
}

const server = useHttps
  ? https.createServer({ cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) }, handler)
  : http.createServer(handler);

server.listen(port, () => {
  const scheme = useHttps ? "https" : "http";
  console.log(`Home Mirror running at ${scheme}://localhost:${port}`);
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === "IPv4" && !a.internal) console.log(`  on your network: ${scheme}://${a.address}:${port}/golf/`);
    }
  }
  if (!useHttps) console.log("  (phones need https for motion sensors – see golf/README.md)");
});
