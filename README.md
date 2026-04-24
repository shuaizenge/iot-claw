<div align="center">

<h1>iot-claw: Agent 时代的 IoT 智能控制系统</h1>

<h3>Agent自动编排 · 状态/遥测存储 · 命令审批审计 · MCP 工具 · OpenClaw 集成</h3>

</div>

## 简介

**iot-claw** 是一个面向 Agent 时代的 IoT 智能控制系统。

## 它解决的问题：
1. 支持使用手机端通过命令agent直接控制自己的嵌入式设备。
2. 让agent获取物联网设备上报的数据来自动分析设备获取信息的最新情况和走向。
3. 让agent自动运维物联网设备，自动分析上报设备的异常情况。
4. 配合openclaw等智能体，成为你agent工作流的一个部分。


设计核心思想见：[doc/核心思想.md](doc/核心思想.md)。

## 快速开始
注：当前仅支持“linux操作系统”

运行时要求：
- Node.js `20+`
- Docker / Docker Compose

推荐的本地联调路径：

```bash
# git克隆项目
git clone https://gitee.com/openLuat/iot-claw.git
# 进入项目目录
cd iot-claw
# 安装依赖
npm install
# 复制环境配置
cp .env.example .env
# 启动基础环境（需要先安装docker）
npm run infra:up
# 启动项目
npm run dev

# (可选)运行pc模拟器设备发送消息
npm run test:mqtt-connect
```

默认服务入口：

- HTTP 控制网页端: `http://127.0.0.1:8080`
- MQTT broker: `mqtt://127.0.0.1:1883`

注意：

- 首次联调建议先用仓库内模拟器

## 常用命令

```bash
# 启动开发模式
npm run dev
# 项目编译 TypeScript 到 `dist/`
npm run build
# 项目类型检查
npm run typecheck

# 项目基础环境，启动本地 PostgreSQL / InfluxDB / MQTT
npm run infra:up
# 项目基础环境日志
npm run infra:logs
# 项目基础环境关闭
npm run infra:down

# 运行基础 MQTT 设备模拟
npm run test:mqtt-connect
# 运行协议 1.0 端到端模拟器
npm run test:protocol-v1
```

## 当前能力

- MQTT 设备接入与消息分类
- 设备主数据、状态、告警、命令、审计信息存储到 PostgreSQL
- 遥测写入 InfluxDB
- HTTP control plane 与内置中文 Web UI
- MCP 工具注册与执行
- 命令分级、审批、命令执行回执
- Agent bridge 与 `openclaw` 集成

## 仓库结构

```text
iot-claw/
├── src/
│   ├── bridge/        # Agent runtime bridge / openclaw dispatcher
│   ├── http/          # HTTP control plane 与 Web UI
│   ├── jobs/          # 巡检、日报、bridge job 调度
│   ├── mcp/           # MCP 工具定义与执行
│   ├── policy/        # 命令分级、审批、审计策略
│   ├── services/      # MQTT、Postgres、Influx、控制面等核心服务
│   └── types/         # 类型与补充声明
├── plugins/
│   └── openclaw-iot-claw/   # OpenClaw 原生插件
├── test/
│   ├── pc_Simulation/
│   ├── protocol_test/
│   └── luatos/
├── doc/
│   ├── guide/
│   └── 协议/
└── docker-compose.yml
```
# 设备协议说明

完整协议说明见 [doc/协议/iot-claw协议定义.md](doc/协议/iot-claw协议定义.md)。

## OpenClaw 集成

当前默认推荐通过原生插件接入 `openclaw`，而不是把 `iot-claw` 当成 OpenClaw 内部模块硬耦合进去。

插件目录：

- [plugins/openclaw-iot-claw/](plugins/openclaw-iot-claw)

相关文档：

- [doc/guide/如何对接openclaw.md](doc/guide/如何对接openclaw.md)

典型插件配置示例：

```bash
openclaw plugins install -l /home/username/project/iot-claw/plugins/openclaw-iot-claw
openclaw plugins enable iot-claw
openclaw config set plugins.entries.iot-claw.config.baseUrl "http://127.0.0.1:8080"
```

## 文档索引

推荐阅读顺序：

1. [doc/核心思想.md](doc/核心思想.md)
2. [doc/guide/如何对接openclaw.md](doc/guide/如何对接openclaw.md)
3. [doc/协议/iot-claw协议定义.md](doc/协议/iot-claw协议定义.md)

## 交流群

扫码加入社群讨论：

![iot-claw 交流群](doc/img/iotclaw技术讨论群.png)
