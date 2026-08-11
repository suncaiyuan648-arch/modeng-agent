import { Controller, Get } from '@nestjs/common';

export interface HealthResponse {
  readonly service: 'api';
  readonly status: 'ok';
}

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return { service: 'api', status: 'ok' };
  }
}
