# iot-claw Agent Guide

## 项目概览

`iot-claw` 是一个面向 IoT 场景的设备运维控制中心，当前重点是：

- 接收 MQTT 设备数据
- 存储设备主数据、状态、告警、命令和审计信息
- 将遥测写入 InfluxDB
- 提供 HTTP control plane 和 MCP 能力
- 将告警与任务桥接到 `openclaw`

## 技术栈

- 语言：TypeScript（Node.js 20+，ESM）
- 运行时：Node.js，开发期使用 `tsx`
- MQTT：`mqtt`
- 主业务库：PostgreSQL（`pg`）
- 时序库：InfluxDB（`@influxdata/influxdb-client`）
- 配置校验：`zod`
- 日志：`pino` + `pino-pretty`
- 调度：`cron-parser`
- OpenClaw 桥接：`ws`
- 本地基础设施：Docker Compose + Mosquitto + PostgreSQL + InfluxDB

## Agent 角色设定

在本仓库内工作的 agent 应默认扮演“宿主侧平台工程师”，职责包括：

- 优先保证 MQTT -> 存储 -> HTTP API 主链路稳定
- 保护命令、审批、bridge 这类高风险控制面逻辑
- 保持 `iot-claw` 是控制平面，避免把它写成单纯的数据脚本集合
- 尽量通过已有服务层扩展，不直接把数据库访问散落到 HTTP/bridge 层

Agent 做事时应优先考虑：

1. 是否影响设备命令安全边界
2. 是否影响 OpenClaw/NanoClaw bridge 稳定性
3. 是否破坏现有 `LuatOS / PC Simulation / HTTP API` 联调链路

## 关键目录

```text
iot-claw/
├── src/                    # 主源码目录
│   ├── http/               # HTTP control-plane 服务和请求工具
│   ├── services/           # MQTT、Postgres、InfluxDB、命令、控制面服务
│   ├── bridge/             # Agent runtime bridge，当前为 openclaw dispatcher
│   ├── mcp/                # MCP 工具注册与执行
│   ├── policy/             # 命令分级、审批、审计策略
│   ├── jobs/               # 巡检、日报、bridge job 调度
│   └── types/              # 类型声明与外部模块补充声明
├── doc/
├── infra/                  # 本地基础设施配置，如 Mosquitto 配置
├── test/
│   ├── pc_Simulation/      # PC 端 MQTT 模拟测试脚本
│   ├── mqtt_test/          # LuatOS MQTT 真机测试脚本
│   └── luatos_test/        # LuatOS 真实设备接入说明
├── data/
│   └── openclaw/           # OpenClaw bridge 设备身份和 device token 持久化目录
├── docker-compose.yml      # 本地 PostgreSQL / InfluxDB / MQTT 开发环境
├── .env.example            # 环境变量样例
├── README.md               # 英文说明
├── README_cn.md            # 中文说明
└── AGENTS.md               # 当前 agent 开发指导文件
```

## 构建与测试命令

常用命令：

- 安装依赖：`npm install`
- 开发启动：`npm run dev`
- 构建：`npm run build`
- 类型检查：`npm run typecheck`
- 启动本地基础设施：`npm run infra:up`
- 查看基础设施日志：`npm run infra:logs`
- 停止基础设施：`npm run infra:down`
- 运行 PC MQTT 模拟：`npm run test:mqtt-connect`

推荐联调顺序：

1. `npm run infra:up`
2. `npm run dev`
3. `npm run test:mqtt-connect` 或接入 LuatOS 真机
4. 使用 `curl` 调 `HTTP API`
5. 再测试 `openclaw` bridge 或 `plugins/openclaw-iot-claw/` 插件

## 编码约定

- 使用 TypeScript 严格类型，避免引入 `any`
- 优先通过服务层和桥接层扩展，不要在路由中直接拼业务 SQL
- 配置新增项必须同步更新：
  - `src/config.ts`
  - `.env.example`
  - 相关 README / 文档
- 对于 bridge、命令审批、设备身份签名等关键逻辑，可加简短注释解释原因
- 保持 ASCII 默认编辑风格
- 单文件过大时优先拆分模块，而不是继续堆叠逻辑

## 架构概览

当前主链路：

```text
Device / LuatOS / PC Simulation
  -> MQTT Broker
  -> MqttService
  -> DeviceEventService
  -> PostgreSQL / InfluxDB
  -> HTTP API / MCP
  -> Policy / Jobs / Agent Bridge
  -> OpenClaw or NanoClaw
```

关键子系统：

- `Ingestion Layer`
  - MQTT 接入和消息分类
- `Storage Layer`
  - PostgreSQL + InfluxDB
- `Control Plane`
  - HTTP API + ControlPlaneService
- `Policy Layer`
  - 命令分级、审批、审计
- `Job Layer`
  - 定时巡检和日报调度
- `Bridge Layer`
- `openclaw` runtime bridge

当前默认演进方向是 `openclaw` 插件优先，bridge 为兼容层。

## Agent 边界

Agent 在本仓库中不应默认做这些事：

- 不要擅自改变生产 MQTT / gateway 凭证
- 不要跳过命令审批模型直接把危险命令改成自动执行
- 不要删除或覆盖已有 bridge 身份文件，除非用户明确要求重置
- 不要绕过 `ControlPlaneService` 直接把控制逻辑写进 HTTP 层
- 不要把 `iot-claw` 做成 `openclaw` 的内部耦合模块，优先通过 adapter 集成

涉及高风险改动时要特别谨慎：

- `src/bridge/openclaw-dispatcher.ts`
- `src/bridge/openclaw-device-auth.ts`
- `src/policy/command-policy-service.ts`
- `src/services/command-service.ts`
- `src/services/control-plane-service.ts`

## 工具选择指南

- 查文件：优先 `Glob`
- 查内容：优先 `Grep`
- 读文件：优先 `Read`
- 小范围单文件修改：优先 `apply_patch`
- 运行构建、测试、docker、git、CLI 命令：使用 `Bash`

工作策略：

- 先读文档和现有模块边界，再改代码
- 多个互不依赖的读取/检查操作应并行进行
- 修改后优先跑：
  - `npm run typecheck`
  - `npm run build`

如果改动影响联调链路，额外验证：

- `npm run dev`
- `npm run test:mqtt-connect`
- 必要时用 `curl` 验证 HTTP API

## 关键文件参考

- `src/index.ts`
  - 进程入口
- `src/orchestrator.ts`
  - 生命周期编排中心
- `src/config.ts`
  - 所有运行时配置入口
- `src/http/http-server.ts`
  - HTTP control-plane 接口
- `src/services/mqtt-service.ts`
  - MQTT 连接、订阅、topic 解析
- `src/services/device-event-service.ts`
  - 设备消息分类处理
- `src/services/postgres.ts`
  - PostgreSQL schema 和数据读写
- `src/services/influx-service.ts`
  - InfluxDB 遥测写入
- `src/services/command-service.ts`
  - 命令记录与下发
- `src/services/control-plane-service.ts`
  - 控制面查询/审批/命令编排
- `src/policy/command-policy-service.ts`
  - 命令分级与审批规则
- `src/jobs/job-service.ts`
  - 任务调度与运行记录
- `src/bridge/agent-bridge-service.ts`
  - bridge 事件分发控制
- `src/bridge/openclaw-dispatcher.ts`
  - OpenClaw gateway 连接与派发
- `src/bridge/openclaw-device-auth.ts`
  - OpenClaw 设备身份和 token 存储
- `plugins/openclaw-iot-claw/`
  - NanoClaw IPC 兼容派发
