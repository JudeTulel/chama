
const { execSync } = require('child_process');
const r = execSync('node node_modules/typescript/bin/tsc --noEmit', { cwd: process.cwd(), encoding: 'utf8', timeout: 240 });
const lines = r.split('\n').filter(l => /app\/bridge|app\/onramp/.test(l));
console.log('bridge/onramp lines:', lines.length);
lines.forEach(l => console.log(l));
