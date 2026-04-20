declare module 'cron-parser' {
  export class CronExpressionParser {
    static parse(expression: string): {
      next(): {
        toISOString(): string;
      };
    };
  }
}
