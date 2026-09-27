#!/usr/bin/env bash
# 在目标服务器上执行（由 GitHub Actions 通过 SSH 调用，也可以手动运行）。
# 幂等：可以反复运行。作用：拉取/更新代码，并用 systemd 常驻一个静态网页服务。
# Runs on the target server (invoked over SSH by GitHub Actions, or by hand). Idempotent.
set -euo pipefail
REPO_URL="${REPO_URL:-https://github.com/kaixindelele/gitgame.git}"
BRANCH="${BRANCH:-claude/git-learning-game-hnytni}"
APP_DIR="$HOME/gitgame"
SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo -n"

need() { command -v "$1" >/dev/null 2>&1; }
if ! need git || ! need python3; then
  echo "==> 安装 git / python3"
  $SUDO apt-get update -qq && $SUDO apt-get install -y -qq git python3 >/dev/null
fi

echo "==> 更新代码 ($BRANCH)"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch -q origin "$BRANCH"
  git -C "$APP_DIR" checkout -q "$BRANCH"
  git -C "$APP_DIR" reset -q --hard "origin/$BRANCH"
else
  git clone -q -b "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
echo "    当前版本: $(git -C "$APP_DIR" log -1 --format='%h %s')"

# 端口：第一次部署时选定并记住。80 空闲就用 80（腾讯云默认放行），否则用 8000。
PORT_FILE=/etc/default/gitgame
if [ -f "$PORT_FILE" ]; then
  . "$PORT_FILE"
else
  if $SUDO ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE '(^|:)80$'; then PORT=8000; else PORT=80; fi
  echo "PORT=$PORT" | $SUDO tee "$PORT_FILE" >/dev/null
fi

echo "==> 配置 systemd 服务 gitgame（端口 $PORT）"
$SUDO tee /etc/systemd/system/gitgame.service >/dev/null <<UNIT
[Unit]
Description=Git Sandbox Academy (static site)
After=network.target

[Service]
User=$(id -un)
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/python3 -m http.server $PORT --bind 0.0.0.0
AmbientCapabilities=CAP_NET_BIND_SERVICE
Restart=always

[Install]
WantedBy=multi-user.target
UNIT
$SUDO systemctl daemon-reload
$SUDO systemctl enable -q gitgame
$SUDO systemctl restart gitgame
sleep 1

if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/"; then
  echo "==> 服务正常：本机访问 http://127.0.0.1:$PORT/ 返回 200"
else
  echo "!! 服务没有正常响应，最近日志："; $SUDO journalctl -u gitgame -n 20 --no-pager; exit 1
fi
echo "==> 部署完成。浏览器访问： http://<服务器公网IP>:$PORT/"
[ "$PORT" != "80" ] && echo "    提示：需要在腾讯云防火墙/安全组放行 TCP $PORT 端口"
exit 0
