
# 插件安装

安装步骤
1. 安装本地插件
openclaw plugins install -l /home/zengshuai/project/cursor/iot-claw/plugins/openclaw-iot-claw
2. 启用插件
openclaw plugins enable iot-claw
3. 配置 iot-claw 地址
openclaw config set plugins.entries.iot-claw.config.baseUrl "http://127.0.0.1:8080"
4. 如果你给 iot-claw 配了 API Token，再配置同一个 token
openclaw config set plugins.entries.iot-claw.config.apiToken "你的-token"
5. 可选：配置默认租户和站点
openclaw config set plugins.entries.iot-claw.config.defaultTenant "default"
openclaw config set plugins.entries.iot-claw.config.defaultSite "default"
6. 重启 gateway
openclaw gateway restart
验证
pnpm openclaw plugins list
pnpm openclaw plugins inspect iot-claw