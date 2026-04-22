<%@ Page Language="C#" %>
<%@ Import Namespace="System.IO" %>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>AnsibleForge IIS Auto-Heal Demo</title>
  <meta http-equiv="refresh" content="3">
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 760px; margin: 60px auto; padding: 20px; background: #f5f5f5; color: #333; }
    h1 { color: #1a1a1a; }
    .card { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin-top: 20px; }
    .count { font-size: 88px; color: #ee0000; font-weight: 800; text-align: center; line-height: 1; }
    .label { text-align: center; color: #888; text-transform: uppercase; letter-spacing: 2px; font-size: 12px; margin-top: 12px; }
    .healthy { color: #009966; font-weight: 600; }
    .unhealthy { color: #ee0000; font-weight: 600; }
    .meta { color: #666; font-size: 13px; }
    code { background: #eee; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
  </style>
</head>
<body>
  <h1>AnsibleForge IIS Auto-Heal Demo</h1>
  <div class="card">
    <div class="count">
      <% Response.Write(File.Exists(Server.MapPath("restartcount.txt")) ? File.ReadAllText(Server.MapPath("restartcount.txt")).Trim() : "0"); %>
    </div>
    <div class="label">IIS Restarts by Event-Driven Ansible</div>
  </div>
  <div class="card">
    <p>Health status:
      <% if (File.Exists(Server.MapPath("fail.flag"))) { %>
        <span class="unhealthy">UNHEALTHY</span> &mdash; EDA will restart IIS within ~10 seconds.
      <% } else { %>
        <span class="healthy">HEALTHY</span>
      <% } %>
    </p>
    <p class="meta">Host: <%= Environment.MachineName %> &middot; Page refreshes every 3s &middot; Health endpoint: <code>/health.aspx</code></p>
  </div>
</body>
</html>
