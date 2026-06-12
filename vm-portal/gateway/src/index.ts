/**
 * Gateway entrypoint: a plain HTTP server (serves /healthz for the container
 * healthcheck) with a WebSocketServer mounted at /ws/terminal. nginx terminates
 * TLS and proxies the upgrade here, so this listens on plain HTTP inside the
 * trust boundary.
 */
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { config } from "./config.js";
import { log } from "./log.js";
import { handleConnection } from "./ws/connection.js";
import { activeCount } from "./sessions/registry.js";
import { MAX_PAYLOAD_BYTES } from "./ws/protocol.js";

const WS_PATH = "/ws/terminal";

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", sessions: activeCount() }));
    return;
  }
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
});

const wss = new WebSocketServer({
  noServer: true,
  maxPayload: MAX_PAYLOAD_BYTES,
  perMessageDeflate: false,
});

server.on("upgrade", (req, socket, head) => {
  if (req.url !== WS_PATH) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    const fwd = req.headers["x-forwarded-for"];
    const clientIp = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? "?";
    handleConnection(ws, clientIp);
  });
});

server.listen(config.port, () => {
  log.info("gateway listening", { port: config.port, path: WS_PATH });
});

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    log.info("shutting down", { signal: sig });
    wss.close();
    server.close(() => process.exit(0));
  });
}
