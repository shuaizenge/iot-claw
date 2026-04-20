import pino from 'pino';

const transport =
  process.env.NODE_ENV === 'development'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
        },
      }
    : undefined;

export const logger = pino({
  name: process.env.SERVICE_NAME || 'iot-claw',
  level: process.env.LOG_LEVEL || 'info',
  transport,
});
