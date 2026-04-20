# iot-claw

`iot-claw` 是一个面向 Agent 时代的 IoT 控制平面。

它不是传统意义上的设备看板，也不只是一个 MQTT 数据接入服务。它的目标，是让资源受限的联网设备以稳定协议接入宿主侧控制面，成为智能体系统中的终端节点。

在 `iot-claw` 里：

- 人表达目标，而不是逐步操作设备
- Agent 负责理解、编排和协同
- `iot-claw` 负责协议、策略、审计和控制边界
- 设备负责感知现实世界并执行动作

更多理念见 `doc/manifesto.md`。

## 核心思想

- 未来的大多数联网设备，都会逐渐成为智能体系统中的终端节点
- 不是每个设备都适合直接运行 `openclaw` 这样的完整 Agent runtime
- 真正可落地的路径，是“轻量设备 + 宿主侧控制平面 + Agent 编排”
- 设备暴露的重点不只是数据，而是可被调度、约束和审计的能力
- Agent 越强，现实世界的命令边界、审批机制和审计链路就越重要

## 常用场景

- 用 MQTT 接入传感器、边缘网关、继电器模组、控制器等设备
- 为设备建立统一的状态、告警、遥测、命令和审计链路
- 让 `openclaw` 通过原生插件或 bridge 调用设备能力
- 在控制面上增加命令分级、审批和运行记录，避免高风险动作失控
- 为“Agent 调度现实硬件”提供一个稳定的宿主侧入口

## 面向两类使用者

### 普通用户

`iot-claw` 期望的普通用户使用方式，是通过 npm 直接安装后使用，而不是阅读大量源码或手动拼接运行环境。

换句话说，普通用户关心的是：

- 安装
- 配置
- 启动
- 接入设备
- 调用控制面能力

相关文档入口：

- `doc/guide/quick-start.md` - 快速上手
- `doc/guide/user-guide.md` - 普通用户使用说明
- `doc/guide/api.md` - HTTP API 与控制面接口

### 开发者

开发者的使用方式，则是在本地安装仓库、启动基础设施、运行调试、联调 bridge，并进行测试和扩展开发。

开发者通常会这样进入项目：

1. 先读 `doc/manifesto.md` 理解项目边界和方向
2. 再读 `doc/guide/architecture.md` 理解主链路和模块职责
3. 用 `doc/guide/developer-guide.md` 了解开发约定、配置和 bridge 集成方式
4. 用 `doc/guide/testing.md` 跑通本地联调和测试链路

## 当前仓库里的快速上手

1. 安装依赖：`npm install`
2. 复制环境变量：`cp .env.example .env`
3. 启动基础设施：`npm run infra:up`
4. 启动服务：`npm run dev`
5. 启动 MQTT 模拟设备：`npm run test:mqtt-connect`

注意：`.env` 中的 `MQTT_TOPIC_FILTER` 必须写成 `"iot/+/+/+/#"`，否则 `#` 会被当成注释。

常用命令：

```bash
npm run dev
npm run build
npm run typecheck
npm run infra:up
npm run infra:logs
npm run infra:down
npm run test:mqtt-connect
```

## 详细文档

- `doc/guide/README.md` - 文档索引
- `doc/guide/quick-start.md` - 快速开始
- `doc/guide/user-guide.md` - 用户视角使用指南
- `doc/guide/developer-guide.md` - 开发者指南
- `doc/guide/architecture.md` - 架构说明
- `doc/guide/testing.md` - 测试与联调方法
- `doc/guide/api.md` - HTTP API 说明

## 当前状态

- 当前 `package.json` 版本为 `0.0.5`
- 项目方向已经进入从“设备接入层”向“Agent 驱动控制平面”演进的阶段
- 面向普通用户的目标形态是“npm 安装即可使用”
- 当前默认推荐联调目标为 `openclaw`
