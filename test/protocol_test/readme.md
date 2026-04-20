# Protocol 1.0 模拟器测试

启动本地基础设施和服务后，运行：

```bash
npm run test:protocol-v1
```

默认会验证以下链路：

- `lifecycle/register`
- `lifecycle/online`
- `capabilities/report`
- `state/report`
- `telemetry/report`
- `event/report`
- `command/req -> command/ack -> command/result`

可选参数：

```bash
npm run test:protocol-v1 -- --tenant demo --site lab-a --device protocol-v1-01
```
