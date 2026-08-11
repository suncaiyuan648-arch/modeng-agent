import { randomBytes } from 'node:crypto';
import process from 'node:process';

const requestedBytes = Number.parseInt(process.argv[2] ?? '32', 10);
const bytes =
  Number.isInteger(requestedBytes) && requestedBytes >= 16 && requestedBytes <= 128
    ? requestedBytes
    : 32;

console.log(randomBytes(bytes).toString('base64url'));
