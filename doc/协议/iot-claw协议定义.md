# iot-claw 1.0 协议定义

## 1. 文档定位

本文定义 `iot-claw` 与设备之间的 `1.0` 版本通信协议。

本协议运行在 `MQTT over TCP` 之上，消息内容采用 `JSON` 编码，目标是为 `iot-claw` 提供一套统一的设备接入、状态上报、遥测采集、事件通知、命令下发和执行回执规范。

协议设计参考以下思路：

- 米家 IoT 的设备模型、属性和动作分层思想
- `Homie` 的设备自描述和主题结构思路
- `Sparkplug` 的设备上线、离线和生命周期思想
- `AWS IoT Jobs/Shadow` 的命令闭环与期望状态同步思想

`1.0` 版本聚焦三条主链路：

1. 设备接入与生命周期管理
2. 设备状态、遥测和事件上报
3. 平台命令下发、设备执行和结果回执

## 2. 设计目标

本协议主要用于解决以下问题：

- 明确设备如何注册、上线、离线和重连
- 明确设备如何周期上报状态和遥测
- 明确平台如何下发命令，设备如何确认、执行和回复
- 明确设备能力如何被平台识别和映射
- 明确断线、超时、失败和重试时的处理边界

一句话概括：

> 本协议是 `iot-claw` 与设备之间的协作合同，而 MQTT 只是承载这份合同的传输通道。

## 3. 适用范围

本协议适用于：

- 通过 MQTT 接入 `iot-claw` 的设备
- LuatOS、PC 模拟设备、嵌入式固件设备
- 需要被 `iot-claw` 统一纳管和执行控制命令的设备

本协议当前不覆盖：

- 视频流、文件传输、大对象分块传输
- OTA 固件升级二进制传输细节
- 多播发现、局域网配网流程
- 非 MQTT 设备接入协议细节

## 4. 协议总体模型

`iot-claw 1.0` 将设备协议拆分为六个模块：

1. `接入模块`
   - 设备注册、上线、离线、重连
2. `描述模块`
   - 设备信息、能力声明、固件信息
3. `上报模块`
   - 状态上报、遥测上报、事件上报
4. `控制模块`
   - 命令请求、命令确认、执行结果
5. `同步模块`
   - 期望状态与实际上报
6. `错误模块`
   - 错误码、超时、重试、幂等处理

其中 `1.0` 必须完成：

- 接入模块
- 上报模块
- 控制模块

描述模块、同步模块在 `1.0` 中给出字段约定，但允许后续按 `1.1+` 扩展。

## 5. 传输要求

### 5.1 传输层

- 协议运行在 `MQTT over TCP`
- 默认明文端口：`1883`
- 推荐 TLS 端口：`8883`
- MQTT QoS 推荐：
  - 状态和事件：`QoS 1`
  - 命令请求和命令回执：`QoS 1`
  - 高频遥测：可根据场景选择 `QoS 0` 或 `QoS 1`

### 5.2 编码要求

- 消息体使用 `UTF-8 JSON`
- 时间字段统一使用 `ISO 8601 UTC` 字符串
- 所有字段名采用 `camelCase`
- 未定义字段允许扩展，但接收方必须忽略未知字段，不得直接报错

## 6. Topic 规范

### 6.1 顶层命名

统一采用以下基础结构：

```text
iot/{tenant}/{site}/{deviceId}/{domain}/...
```

字段定义：

- `tenant`：租户标识
- `site`：站点标识
- `deviceId`：设备唯一标识
- `domain`：消息域

### 6.2 上行主题

设备到服务器的主题定义：

```text
iot/{tenant}/{site}/{deviceId}/lifecycle/register
iot/{tenant}/{site}/{deviceId}/lifecycle/online
iot/{tenant}/{site}/{deviceId}/lifecycle/offline
iot/{tenant}/{site}/{deviceId}/capabilities/report
iot/{tenant}/{site}/{deviceId}/state/report
iot/{tenant}/{site}/{deviceId}/telemetry/report
iot/{tenant}/{site}/{deviceId}/event/report
iot/{tenant}/{site}/{deviceId}/command/ack
iot/{tenant}/{site}/{deviceId}/command/result
iot/{tenant}/{site}/{deviceId}/shadow/reported
```

### 6.3 下行主题

服务器到设备的主题定义：

```text
iot/{tenant}/{site}/{deviceId}/command/req
iot/{tenant}/{site}/{deviceId}/shadow/desired
```

### 6.4 保留主题

以下主题前缀保留，不建议业务侧随意新增：

```text
iot/{tenant}/{site}/{deviceId}/system/...
iot/{tenant}/{site}/{deviceId}/debug/...
```

## 7. 通用消息信封

除高频兼容场景外，所有消息建议都包含统一信封字段。

```json
{
  "protocolVersion": "1.0",
  "messageId": "msg-20260320-0001",
  "ts": "2026-03-20T10:00:00Z",
  "tenant": "default",
  "site": "default",
  "deviceId": "device-001",
  "traceId": "trace-001"
}
```

字段定义：

- `protocolVersion`
  - 协议版本，`1.0` 固定写法为字符串 `"1.0"`
- `messageId`
  - 当前消息唯一 ID，用于去重、追踪和排障
- `ts`
  - 消息生成时间
- `tenant`
  - 租户标识
- `site`
  - 站点标识
- `deviceId`
  - 设备标识
- `traceId`
  - 可选链路追踪 ID，建议命令链路携带

约束：

- `messageId` 在设备侧至少保证短时间内唯一
- `commandId`、`jobId` 不等同于 `messageId`
- 接收端应优先以 topic 上的 `tenant/site/deviceId` 为路由依据，以 payload 为校验依据

## 8. 设备接入与生命周期协议

### 8.1 设备注册

主题：

```text
iot/{tenant}/{site}/{deviceId}/lifecycle/register
```

作用：

- 设备首次接入平台时声明自身身份
- 设备重装或固件升级后可重新注册
- 平台可据此建立或更新设备档案

报文示例：

```json
{
  "protocolVersion": "1.0",
  "messageId": "msg-reg-001",
  "ts": "2026-03-20T10:00:00Z",
  "tenant": "default",
  "site": "lab-a",
  "deviceId": "switch-001",
  "name": "实验开关 001",
  "productType": "switch",
  "firmwareVersion": "1.0.3",
  "hardwareVersion": "A1",
  "manufacturer": "iot-claw-demo",
  "capabilityVersion": "1.0",
  "metadata": {
    "network": "wifi",
    "chip": "esp32"
  }
}
```

### 8.2 设备上线

主题：

```text
iot/{tenant}/{site}/{deviceId}/lifecycle/online
```

作用：

- 表示设备已建立连接且可接收控制命令
- 可在每次 MQTT 连接建立后发送

报文示例：

```json
{
  "protocolVersion": "1.0",
  "messageId": "msg-online-001",
  "ts": "2026-03-20T10:01:00Z",
  "tenant": "default",
  "site": "lab-a",
  "deviceId": "switch-001",
  "sessionId": "sess-001",
  "ip": "192.168.1.8",
  "reason": "mqtt_connected"
}
```

### 8.3 设备离线

主题：

```text
iot/{tenant}/{site}/{deviceId}/lifecycle/offline
```

作用：

- 表示设备主动下线或准备断开
- 若设备异常掉线，可由平台超时判定补偿离线状态

报文示例：

```json
{
  "protocolVersion": "1.0",
  "messageId": "msg-offline-001",
  "ts": "2026-03-20T12:00:00Z",
  "tenant": "default",
  "site": "lab-a",
  "deviceId": "switch-001",
  "reason": "reboot"
}
```

### 8.4 生命周期建议

建议设备遵循以下顺序：

1. 首次接入发送 `register`
2. 每次连接成功发送 `online`
3. 周期发送 `state/report` 或 `telemetry/report`
4. 正常退出前发送 `offline`
5. 异常断线时由平台根据超时策略推断为离线

## 9. 设备描述与能力协议

### 9.1 能力声明

主题：

```text
iot/{tenant}/{site}/{deviceId}/capabilities/report
```

作用：

- 声明设备支持的属性、能力和动作
- 为控制面建立 capability/action 映射提供基础

报文示例：

```json
{
  "protocolVersion": "1.0",
  "messageId": "msg-cap-001",
  "ts": "2026-03-20T10:00:10Z",
  "tenant": "default",
  "site": "lab-a",
  "deviceId": "switch-001",
  "capabilities": [
    {
      "capability": "switch",
      "displayName": "主继电器",
      "properties": ["power"]
    },
    {
      "capability": "rssi",
      "displayName": "信号强度",
      "properties": ["rssi"]
    }
  ],
  "actions": [
    {
      "actionName": "turn_on",
      "commandName": "set_power"
    },
    {
      "actionName": "turn_off",
      "commandName": "set_power"
    },
    {
      "actionName": "restart",
      "commandName": "restart"
    }
  ]
}
```

说明：

- 该主题用于设备能力自描述
- `iot-claw` 控制台中的 capability/action 配置可视为对该设备声明的二次映射与增强

## 10. 状态、遥测与事件协议

### 10.1 状态上报

主题：

```text
iot/{tenant}/{site}/{deviceId}/state/report
```

作用：

- 表示设备当前总体状态
- 用于设备在线态、工作态、摘要信息更新

报文示例：

```json
{
  "protocolVersion": "1.0",
  "messageId": "msg-state-001",
  "ts": "2026-03-20T10:02:00Z",
  "tenant": "default",
  "site": "lab-a",
  "deviceId": "switch-001",
  "status": "online",
  "summary": "relay ready",
  "online": true,
  "attributes": {
    "power": "off",
    "mode": "manual",
    "rssi": -65
  }
}
```

字段约束：

- `status` 为设备总状态，推荐值：
  - `online`
  - `offline`
  - `idle`
  - `busy`
  - `warning`
  - `error`
- `summary` 为人类可读摘要
- `attributes` 用于关键当前属性

### 10.2 遥测上报

主题：

```text
iot/{tenant}/{site}/{deviceId}/telemetry/report
```

作用：

- 周期上报传感器数据和运行指标
- 适合写入 InfluxDB 等时序系统

报文示例：

```json
{
  "protocolVersion": "1.0",
  "messageId": "msg-tel-001",
  "ts": "2026-03-20T10:02:05Z",
  "tenant": "default",
  "site": "lab-a",
  "deviceId": "sensor-001",
  "metrics": {
    "temperature": 26.5,
    "humidity": 58.3,
    "voltage": 3.29,
    "rssi": -61
  },
  "state": {
    "power": "normal"
  },
  "quality": "good"
}
```

建议：

- 高频数据尽量放在 `metrics`
- 业务状态不要全部塞入遥测，应通过 `state/report` 提供摘要

### 10.3 事件上报

主题：

```text
iot/{tenant}/{site}/{deviceId}/event/report
```

作用：

- 上报告警、异常、重启、完成、人工触发等重要事件

报文示例：

```json
{
  "protocolVersion": "1.0",
  "messageId": "msg-evt-001",
  "ts": "2026-03-20T10:03:00Z",
  "tenant": "default",
  "site": "lab-a",
  "deviceId": "sensor-001",
  "level": "warning",
  "title": "温度偏高",
  "message": "设备温度超过阈值 80C",
  "eventType": "temperature_high",
  "data": {
    "temperature": 81.2,
    "threshold": 80
  }
}
```

`level` 推荐值：

- `info`
- `warning`
- `critical`

## 11. 控制与命令协议

### 11.1 设计原则

命令协议借鉴 `AWS Jobs` 思路，要求形成完整闭环：

1. 平台发起请求
2. 设备立即确认是否接收
3. 设备必要时上报执行中
4. 设备最终上报执行结果

控制链路中必须存在以下两个唯一标识：

- `commandId`：平台侧命令唯一标识
- `messageId`：单条 MQTT 消息唯一标识

### 11.2 命令请求

主题：

```text
iot/{tenant}/{site}/{deviceId}/command/req
```

报文示例：

```json
{
  "protocolVersion": "1.0",
  "messageId": "msg-cmd-req-001",
  "ts": "2026-03-20T10:05:00Z",
  "tenant": "default",
  "site": "lab-a",
  "deviceId": "switch-001",
  "commandId": "cmd-001",
  "commandName": "set_power",
  "requestedBy": "control-plane",
  "timeoutMs": 10000,
  "requiresAck": true,
  "payload": {
    "power": "on"
  }
}
```

字段定义：

- `commandId`
  - 平台生成的命令唯一标识
- `commandName`
  - 设备要执行的命令名称
- `requestedBy`
  - 请求来源，如 `control-plane`、`bridge`、`job-service`
- `timeoutMs`
  - 命令超时时间
- `requiresAck`
  - 是否要求设备立即回执
- `payload`
  - 命令参数

### 11.3 命令接收确认

主题：

```text
iot/{tenant}/{site}/{deviceId}/command/ack
```

作用：

- 设备收到请求后尽快回复是否已接收或拒绝
- 不表示命令已执行成功，仅表示设备对请求做出第一阶段回应

报文示例：

```json
{
  "protocolVersion": "1.0",
  "messageId": "msg-cmd-ack-001",
  "ts": "2026-03-20T10:05:01Z",
  "tenant": "default",
  "site": "lab-a",
  "deviceId": "switch-001",
  "commandId": "cmd-001",
  "status": "accepted",
  "detail": "command accepted"
}
```

`ack.status` 推荐值：

- `accepted`
- `rejected`
- `busy`
- `unsupported`

### 11.4 命令执行结果

主题：

```text
iot/{tenant}/{site}/{deviceId}/command/result
```

作用：

- 上报命令执行中间态或最终结果

执行中示例：

```json
{
  "protocolVersion": "1.0",
  "messageId": "msg-cmd-res-001",
  "ts": "2026-03-20T10:05:02Z",
  "tenant": "default",
  "site": "lab-a",
  "deviceId": "switch-001",
  "commandId": "cmd-001",
  "status": "running",
  "detail": "relay switching"
}
```

执行成功示例：

```json
{
  "protocolVersion": "1.0",
  "messageId": "msg-cmd-res-002",
  "ts": "2026-03-20T10:05:03Z",
  "tenant": "default",
  "site": "lab-a",
  "deviceId": "switch-001",
  "commandId": "cmd-001",
  "status": "succeeded",
  "detail": "relay switched on",
  "result": {
    "power": "on"
  }
}
```

执行失败示例：

```json
{
  "protocolVersion": "1.0",
  "messageId": "msg-cmd-res-003",
  "ts": "2026-03-20T10:05:03Z",
  "tenant": "default",
  "site": "lab-a",
  "deviceId": "switch-001",
  "commandId": "cmd-001",
  "status": "failed",
  "errorCode": "DEVICE_BUSY",
  "detail": "relay locked by safety mode"
}
```

`result.status` 推荐值：

- `running`
- `succeeded`
- `failed`
- `timeout`
- `cancelled`

### 11.5 命令幂等要求

- 设备必须以 `commandId` 作为幂等主键
- 若设备收到重复 `commandId`：
  - 已完成的命令，应返回已有最终状态
  - 正在执行的命令，应返回当前执行状态
  - 无法识别时，应返回 `rejected` 并附错误原因

### 11.6 命令超时建议

- 若设备在 `timeoutMs` 内未完成命令，应尽量返回 `timeout`
- 若设备没有主动回 `timeout`，平台可根据超时策略将命令标记为超时失败

## 12. Shadow 状态同步协议

该部分借鉴 `AWS Shadow` 思想，用于表达“期望状态”和“实际上报状态”的差异。

### 12.1 下发期望状态

主题：

```text
iot/{tenant}/{site}/{deviceId}/shadow/desired
```

示例：

```json
{
  "protocolVersion": "1.0",
  "messageId": "msg-shadow-desired-001",
  "ts": "2026-03-20T10:10:00Z",
  "tenant": "default",
  "site": "lab-a",
  "deviceId": "switch-001",
  "state": {
    "power": "on",
    "mode": "manual"
  }
}
```

### 12.2 上报实际状态

主题：

```text
iot/{tenant}/{site}/{deviceId}/shadow/reported
```

示例：

```json
{
  "protocolVersion": "1.0",
  "messageId": "msg-shadow-reported-001",
  "ts": "2026-03-20T10:10:02Z",
  "tenant": "default",
  "site": "lab-a",
  "deviceId": "switch-001",
  "state": {
    "power": "on",
    "mode": "manual"
  }
}
```

说明：

- `1.0` 中此模块可选实现
- 推荐在配置同步、开关状态保持、离线重连补偿中使用

## 13. 错误码与处理规则

### 13.1 通用错误码建议

设备在 `command/ack` 或 `command/result` 中可返回以下错误码：

- `INVALID_PAYLOAD`
- `UNSUPPORTED_COMMAND`
- `DEVICE_BUSY`
- `PERMISSION_DENIED`
- `INVALID_STATE`
- `EXECUTION_FAILED`
- `TIMEOUT`
- `INTERNAL_ERROR`

### 13.2 错误返回示例

```json
{
  "protocolVersion": "1.0",
  "messageId": "msg-cmd-res-004",
  "ts": "2026-03-20T10:05:04Z",
  "tenant": "default",
  "site": "lab-a",
  "deviceId": "switch-001",
  "commandId": "cmd-002",
  "status": "failed",
  "errorCode": "UNSUPPORTED_COMMAND",
  "detail": "command factory_reset is not supported"
}
```

### 13.3 平台侧建议处理

- `INVALID_PAYLOAD`
  - 不重试，直接修正请求
- `DEVICE_BUSY`
  - 可有限重试
- `TIMEOUT`
  - 可按策略重试或转人工处理
- `UNSUPPORTED_COMMAND`
  - 不重试，需修正能力映射
- `INTERNAL_ERROR`
  - 可重试，但需结合次数限制

## 14. 安全建议

`1.0` 版本建议至少具备以下安全措施：

- 设备使用独立 `clientId`
- Broker 开启用户名密码或 token 鉴权
- 生产环境优先使用 `MQTT over TLS`
- 严格限制设备可发布和订阅的 topic 范围
- 敏感命令仍需通过 `iot-claw` 命令审批策略控制

不建议：

- 所有设备共用同一凭证
- 设备直接订阅无边界的通配 topic
- 在 payload 中明文传长期密钥

## 15. 设备实现最小要求

一个兼容 `iot-claw 1.0` 的设备，最少应实现：

1. 建立 MQTT 连接
2. 订阅 `command/req`
3. 上报 `lifecycle/online`
4. 周期上报 `state/report` 或 `telemetry/report`
5. 收到命令后回复 `command/ack`
6. 命令完成后回复 `command/result`

推荐额外实现：

7. 首次接入时发送 `lifecycle/register`
8. 主动上报 `capabilities/report`
9. 支持 `shadow/desired` 和 `shadow/reported`

## 16. 典型时序

### 16.1 设备首次接入

```text
Device -> MQTT Broker : CONNECT
Device -> iot/.../lifecycle/register : register
Device -> iot/.../lifecycle/online : online
Device -> iot/.../capabilities/report : capabilities
Device -> iot/.../state/report : current state
```

### 16.2 平台下发命令

```text
iot-claw -> iot/.../command/req : command request
Device   -> iot/.../command/ack : accepted/rejected
Device   -> iot/.../command/result : running(optional)
Device   -> iot/.../command/result : succeeded/failed
```

### 16.3 期望状态同步

```text
iot-claw -> iot/.../shadow/desired : desired state
Device   -> apply locally
Device   -> iot/.../shadow/reported : actual state
```

## 17. 与当前 iot-claw 的映射关系

当前项目已有以下能力，可直接映射到本协议：

- `src/services/mqtt-service.ts`
  - 负责 MQTT 连接、订阅和消息收发
- `src/services/device-event-service.ts`
  - 负责处理 `telemetry`、`state`、`event`、`command_ack`
- `src/services/command-service.ts`
  - 负责平台命令下发
- `src/services/control-plane-service.ts`
  - 负责动作映射和命令编排

当前已基本落地：

- `telemetry`
- `state`
- `event`
- `command/req`
- `command/ack`

后续建议补齐：

- `lifecycle/register`
- `lifecycle/online`
- `lifecycle/offline`
- `capabilities/report`
- `command/result`
- `shadow/desired`
- `shadow/reported`

## 18. 版本演进建议

### 18.1 1.0 版本目标

- 明确 topic 规范
- 明确统一消息信封
- 明确状态、遥测、事件上报格式
- 明确命令请求、ACK、结果闭环

### 18.2 1.1 可增强项

- 增加生命周期消息的实际代码落地
- 完善 `command/result` 支持
- 增加标准错误码枚举
- 增加 capability 自发现

### 18.3 2.0 可增强项

- 引入更强的 shadow/twin 模型
- 增加 OTA、批处理任务、取消任务
- 增加签名、设备身份增强校验
- 增加二进制或压缩遥测扩展

## 19. 结论

`iot-claw 1.0` 协议的核心，不是重新发明 MQTT，而是在 MQTT 之上定义一套面向设备运维控制面的统一语义协议。

它的重点在于：

- 设备如何被识别和接入
- 设备如何持续上报状态和数据
- 平台如何可靠地下发命令并收到结果
- 设备与平台如何在异常、断线和重试场景下保持一致性

这套协议既吸收了米家 IoT 的设备模型思想，也结合了 `Homie`、`Sparkplug` 和 `AWS Jobs/Shadow` 的优点，适合作为 `iot-claw` 后续设备接入和控制链路的 `1.0` 标准基础。
