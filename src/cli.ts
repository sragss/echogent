import { EchoClient, createEchoAnthropic } from '@merit-systems/echo-typescript-sdk';
import { generateText, readUIMessageStream, stepCountIs, streamText, tool, type Tool, type ModelMessage } from 'ai';
import open from 'open';
import { getOrCreateApiKey } from './apiKey';
import { BANNER } from './banner';
import { z } from 'zod';

import { anthropic } from '@ai-sdk/anthropic';



const APP_ID = 'd4db70fb-4df9-4161-a89b-9ec53125088b';

const textEditorTool = anthropic.tools.textEditor_20250429({
  execute: async ({
    command,
    path,
    file_text,
    insert_line,
    new_str,
    old_str,
    view_range,
  }) => {
    try {
      const file = Bun.file(path);
      
      switch (command) {
        case 'view': {
          if (!(await file.exists())) {
            return `Error: File or directory '${path}' does not exist.`;
          }
          
          const stat = await file.stat();
          if (stat.isDirectory()) {
            const entries = [];
            for await (const entry of new Bun.Glob('*').scan(path)) {
              const fullPath = `${path}/${entry}`;
              const entryFile = Bun.file(fullPath);
              const entryStat = await entryFile.stat();
              entries.push(`${entryStat.isDirectory() ? 'd' : '-'} ${entry}`);
            }
            return `Directory listing for '${path}':\n${entries.join('\n')}`;
          }
          
          const content = await file.text();
          const lines = content.split('\n');
          
          if (view_range && view_range.length === 2) {
            const [start, end] = view_range;
            const selectedLines = lines.slice(Math.max(0, start - 1), Math.min(lines.length, end));
            return selectedLines.map((line, i) => `${start + i}: ${line}`).join('\n');
          }
          
          return lines.map((line, i) => `${i + 1}: ${line}`).join('\n');
        }
        
        case 'create': {
          if (await file.exists()) {
            return `Error: File '${path}' already exists.`;
          }
          
          if (!file_text) {
            return `Error: file_text is required for create command.`;
          }
          
          await Bun.write(path, file_text);
          return `File '${path}' created successfully.`;
        }
        
        case 'str_replace': {
          if (!old_str || !new_str) {
            return `Error: Both old_str and new_str are required for str_replace command.`;
          }
          
          if (!(await file.exists())) {
            return `Error: File '${path}' does not exist.`;
          }
          
          const content = await file.text();
          if (!content.includes(old_str)) {
            return `Error: String '${old_str}' not found in file '${path}'.`;
          }
          
          const newContent = content.replace(old_str, new_str);
          await Bun.write(path, newContent);
          return `String replacement completed in '${path}'.`;
        }
        
        case 'insert': {
          if (!new_str || insert_line === undefined) {
            return `Error: Both new_str and insert_line are required for insert command.`;
          }
          
          if (!(await file.exists())) {
            return `Error: File '${path}' does not exist.`;
          }
          
          const content = await file.text();
          const lines = content.split('\n');
          
          if (insert_line < 0 || insert_line > lines.length) {
            return `Error: insert_line ${insert_line} is out of range. File has ${lines.length} lines.`;
          }
          
          lines.splice(insert_line, 0, new_str);
          const newContent = lines.join('\n');
          await Bun.write(path, newContent);
          return `Line inserted at line ${insert_line + 1} in '${path}'.`;
        }
        
        default:
          return `Error: Unknown command '${command}'. Supported commands: view, create, str_replace, insert.`;
      }
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});

const tools = {
  str_replace_based_edit_tool: textEditorTool,
  weather: tool({
    description: 'Get the weather in a location',
    inputSchema: z.object({
      location: z.string().describe('The location to get the weather for')
    }),
    execute: async ({ location }) => ({
      location,
      temperature: 72 + Math.floor(Math.random() * 21) - 10
    })
  }),
  list_files: tool({
    description: 'List files and directories in a given directory path. Use this to explore the file structure.',
    inputSchema: z.object({
      path: z.string().optional().describe('The directory path to list. Defaults to current directory if not provided.')
    }),
    execute: async ({ path = '.' }) => {
      try {
        const entries = [];
        for await (const entry of new Bun.Glob('*').scan(path)) {
          const fullPath = `${path}/${entry}`;
          const file = Bun.file(fullPath);
          const isDirectory = await file.exists() && (await Bun.file(fullPath).stat()).isDirectory;
          entries.push({
            name: entry,
            path: fullPath,
            type: isDirectory ? 'directory' : 'file'
          });
        }
        return { path, entries };
      } catch (error) {
        return { error: `Failed to list directory: ${error instanceof Error ? error.message : String(error)}`, path };
      }
    }
  }),
  read_file: tool({
    description: "Read the contents of a given relative file path. Use this when you want to see what's inside a file. Do not use this with directory names.",
    inputSchema: z.object({
      path: z.string().describe('The realtive path of a file in the working directory.')
    }),
    execute: async ({ path }) => {
      try {
        const file = Bun.file(path);
        const content = await file.text();
        return { content, path };
      } catch (error) {
        return { error: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`, path };
      }
    }
  }),
  ripgrep: tool({
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
  })
};


async function main() {
  try {
    console.log(BANNER);
    
    const apiKey = await getOrCreateApiKey(APP_ID);

    // Create Echo client for balance/payments
    const echo = new EchoClient({ apiKey });

    // Create OpenAI provider with Echo billing
    const anthropic = createEchoAnthropic(
      { appId: APP_ID },
      async () => apiKey as string
    );

    // Check user's balance
    const balance = await echo.balance.getBalance();
    console.log(`Balance: ${balance.balance}`);

    // Create top-up link if needed
    if (balance.balance < 1) {
      const payment = await echo.payments.createPaymentLink({
        amount: 10,
      });

      console.log('Low balance. Opening payment link...');
      await open(payment.paymentLink.url);
    }

    const bashTool = anthropic.tools.bash_20241022({
      execute: async ({ command, restart }) => {
        // For now, return a message that bash execution is not implemented
        return `Bash execution not implemented yet. Command: ${command}`;
      },
    });

    // TODO(sragss): 
    // - [x] Let this bitch list files and read files.
    // - [x] Let it do code search with rg.
    // - [x] Loop it with ModelMessages.
    // - [ ] Use Anthropic to let it modify a file.
    // - [ ] Let it use bash with approval (xterm headless?).
    // - [ ] Wire it up to Anthropic search.

    let modelMessages: ModelMessage[] = [];

    while (true) {
      const userRequest = (await prompt("\x1b[32mWhat would you like to do?\x1b[0m\n")) || "";

      modelMessages.push({
        role: 'user',
        content: userRequest
      });

      let result = await streamText({
        model: await anthropic('claude-sonnet-4-20250514'),
        system: "You are a coding assistant with access to tools that lives in the user's CLI. " +
          "Perform their actions as succinctly as possible." +
          "Never use markdown output, your responses will be printed to a CLI"
        ,
        prompt: modelMessages,
        tools: tools,
        stopWhen: stepCountIs(15),
        onChunk: ( { chunk }) => {
          // Stream the output of text.
          if (chunk.type == 'text-delta') {
            process.stdout.write(chunk.text);

          }
        },
        onStepFinish({ text, toolCalls, toolResults, finishReason, usage }) {
          process.stdout.write("\n");

          for (const toolCall of toolCalls) {
            printBackground(`Calling ${toolCall.toolName}`);
          }

          for (const toolResult of toolResults) {
            if (toolResult.type == 'tool-result') { // unsure if necessary
              printBackground(`${toolResult.toolName}(${JSON.stringify(toolResult.input)}) -> ${JSON.stringify(toolResult.output)}`);
            }
          }

        },
        onError({ error }) {
          console.error(error);
        }
      });

      const responseMessages = (await result.response).messages;
      modelMessages.push(...responseMessages);
      printBackground(`Character count delta: ${JSON.stringify(responseMessages).length}`);
    }

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

function printBackground(text: string): void {
  console.log(`\x1b[2m${text}\x1b[0m`);
}

main();