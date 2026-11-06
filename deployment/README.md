# 可选 systemd 部署示例

此目录只公开 `.service.example` 模板，不包含开发机器上实际使用的服务单元、密码或 Tunnel 地址。

1. 准备 Linux / WSL、Node.js 22.13+ 与 npm 依赖；PDF 功能的系统工具见 `../docs/pdf-import-sharing.md`。
2. 示例约定项目位于 `/opt/shici`，以 `shici` 用户和同名组运行。请先准备运行用户并调整模板中的目录、用户、Node.js 路径；确保运行用户可以读项目并写入 `data/`。
3. 在目标机器执行 `npm ci`、`npm run build`、`node scripts/setup-public-access.mjs`。初始化脚本需以具有目标目录写权限的用户执行，生成的访问文件只留在目标机器上。
4. 检查模板后再以适合自己环境的服务名安装。仓库发布过程不会安装、重启或更改已有服务。
5. 如需临时公网访问，自行安装 cloudflared；`scripts/run-tunnel.mjs` 默认路径为 `/usr/local/bin/cloudflared`，连接后端 3001 端口。先确认账号登录保护，再启用 Tunnel。

不要将 `data/`、初始密码、会话密钥、AI API Key 或实际部署单元提交到公开仓库。建议在修改既有部署前先完成可恢复的备份。
