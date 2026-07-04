const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const distDir = join(process.cwd(), 'dist');
mkdirSync(distDir, { recursive: true });
writeFileSync(join(distDir, 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2));
