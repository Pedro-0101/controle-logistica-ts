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
  const args = process.argv.slice(2);
  const maxRestarts = Number(process.env.ANPR_MAX_RESTARTS ?? 5);
  // Crash de OOM no Windows (0xC0000005) — vale a pena reiniciar.
  const restartableCodes = new Set([3221225477, 3221225725, 137, 139, 134]);
  let restarts = 0;
  let stopping = false;
  let child;

  const start = () => {
    child = spawn(executable, args, { cwd: directory, stdio: 'inherit' });
    child.on('error', () => {
      console.error('Não foi possível iniciar o Python ANPR');
      process.exitCode = 1;
    });
    child.on('exit', (code, signal) => {
      if (stopping) {
        process.exitCode = code ?? 1;
        return;
      }
      const crashed = signal !== null || restartableCodes.has(code ?? -1);
      if (crashed && restarts < maxRestarts) {
        restarts += 1;
        const delay = Math.min(30, 2 ** restarts);
        console.warn(
          `ANPR encerrou inesperadamente (code=${code}, signal=${signal}). ` +
          `Reiniciando em ${delay}s (${restarts}/${maxRestarts})...`,
        );
        setTimeout(start, delay * 1000).unref();
        return;
      }
      if (crashed) {
        console.error(
          `ANPR finalizado apos ${restarts} reinicio(s); verifique a memoria disponivel e os logs.`,
        );
      }
      process.exitCode = code ?? 1;
    });
  };

  const shutdown = (signal) => {
    stopping = true;
    if (child && !child.killed) child.kill(signal);
  };
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => shutdown(signal));

  start();
}
