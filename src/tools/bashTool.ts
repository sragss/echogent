import { tool } from 'ai';
import { z } from 'zod';
import { spawn } from 'child_process';
import os from 'os';
import stripAnsi from 'strip-ansi';

export const bashTool = tool({
  description: 'Execute a bash/shell command and return the output.',
  inputSchema: z.object({
    command: z.string().describe('The bash command to execute'),
    cwd: z.string().optional().describe('Working directory to execute the command in. Defaults to current directory.')
  }),
  execute: async ({ command, cwd = process.cwd() }) => {
    return new Promise((resolve) => {
      const isWindows = os.platform() === 'win32';
      const shell = isWindows ? 'cmd.exe' : 'bash';
      const args = isWindows ? ['/c', command] : ['-c', command];
      
      const child = spawn(shell, args, { cwd, stdio: 'pipe' });
      const output: Buffer[] = [];
      
      child.stdout?.on('data', (data) => output.push(data));
      child.stderr?.on('data', (data) => output.push(data));
      
      child.on('close', (exitCode) => {
        const rawResult = Buffer.concat(output).toString('utf-8').trim();
        const cleanOutput = stripAnsi(rawResult);
        resolve({ command, cwd, output: cleanOutput, exitCode });
      });
      
      child.on('error', (error) => {
        resolve({ command, cwd, error: error.message, exitCode: 1 });
      });
    });
  }
});