import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const directory = fileURLToPath(new URL('../anpr-service/', import.meta.url));
const executable = process.env.ANPR_PYTHON ?? join(directory, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
if (!existsSync(executable)) {
  console.error('Python ANPR não encontrado. Crie anpr-service/.venv e instale requirements.txt e requirements-dev.txt.');
  process.exitCode = 1;
} else {
  const child = spawn(executable, process.argv.slice(2), { cwd: directory, stdio: 'inherit' });
  child.on('error', () => { console.error('Não foi possível iniciar o Python ANPR'); process.exitCode = 1; });
  child.on('exit', (code) => { process.exitCode = code ?? 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { child.kill(signal); });
}
