import { createFakeModelExecutionPort } from './index.js';
import { describeModelExecutionPortConformance } from './internal/model-execution-port.conformance.js';

describeModelExecutionPortConformance((options) => createFakeModelExecutionPort(options));
