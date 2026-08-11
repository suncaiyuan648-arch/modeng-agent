export interface WorkerStatus {
  readonly service: 'worker';
  readonly status: 'ready';
}

export function getWorkerStatus(): WorkerStatus {
  return { service: 'worker', status: 'ready' };
}

if (process.env['NODE_ENV'] !== 'test') {
  console.info(JSON.stringify(getWorkerStatus()));
}
