import { tool } from 'ai';
import { z } from 'zod';

export const ripgrepTool = tool({
  description: 'Search for patterns in files using ripgrep. Use this to find code, text, or patterns across files.',
  inputSchema: z.object({
    pattern: z.string().describe('The pattern to search for (supports regex)'),
    path: z.string().optional().describe('The directory or file path to search in. Defaults to current directory.'),
    fileType: z.string().optional().describe('File type filter (e.g., "js", "ts", "py", "md")'),
    ignoreCase: z.boolean().optional().describe('Ignore case when searching'),
    contextLines: z.number().optional().describe('Number of context lines to show around matches'),
    maxCount: z.number().optional().describe('Maximum number of matches to return')
  }),
  execute: async ({ pattern, path = '.', fileType, ignoreCase, contextLines, maxCount }) => {
    try {
      const args = ['rg'];

      // Add flags
      if (ignoreCase) args.push('-i');
      if (contextLines) args.push('-C', contextLines.toString());
      if (maxCount) args.push('-m', maxCount.toString());
      if (fileType) args.push('-t', fileType);

      // Add pattern and path
      args.push(pattern, path);

      const proc = Bun.spawn(args, {
        stdout: 'pipe',
        stderr: 'pipe'
      });

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      await proc.exited;

      if (proc.exitCode !== 0 && proc.exitCode !== 1) {
        return { error: stderr || 'Ripgrep command failed', pattern, path };
      }

      return {
        matches: stdout.trim(),
        pattern,
        path,
        matchCount: stdout.trim() ? stdout.trim().split('\n').length : 0
      };
    } catch (error) {
      return { error: `Failed to run ripgrep: ${error instanceof Error ? error.message : String(error)}`, pattern, path };
    }
  }
});