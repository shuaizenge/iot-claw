你现在可以重新启动：
cd /home/zengshuai/project/cursor/iot-claw
npm run infra:up
npm run dev
然后另开一个终端：
npm run test:mqtt-connect

- 停止测试

docker stop iot-claw-postgres iot-claw-mqtt-1 iot-influxdb