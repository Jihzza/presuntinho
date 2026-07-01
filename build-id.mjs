import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const version = JSON.parse(readFileSync('package.json', 'utf-8')).version;
const commitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
const buildId = `v${version}-${commitSha}-${Date.now()}`;

console.log(buildId);
