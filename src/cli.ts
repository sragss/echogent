#!/usr/bin/env bun
import { EchoClient, createEchoAnthropic } from '@merit-systems/echo-typescript-sdk';
import { stepCountIs, streamText, tool, type Tool, type ModelMessage } from 'ai';
import open from 'open';
import { getOrCreateApiKey } from './apiKey';
import { BANNER } from './banner';
import { textEditorTool } from './tools/textEditorTool';
import { ripgrepTool } from './tools/ripgrepTool';
import { bashTool } from './tools/bashTool';
import { z } from 'zod';


const APP_ID = 'd4db70fb-4df9-4161-a89b-9ec53125088b';

const tools = {
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
  ripgrep: ripgrepTool,
  text_editor_tool: textEditorTool,
  bash_execute: bashTool,
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


    // TODO(sragss): 
    // - [x] Let this bitch list files and read files.
    // - [x] Let it do code search with rg.
    // - [x] Loop it with ModelMessages.
    // - [x] Use Anthropic to let it modify a file.
    // - [x] Let it use bash with approval (xterm headless?).
    // - [ ] Wire it up to Anthropic search.

    let modelMessages: ModelMessage[] = [];

    while (true) {
      const userRequest = (await prompt("\x1b[32mWhat would you like to do?\x1b[0m\n")) || "";

      modelMessages.push({ role: 'user', content: userRequest });

      let result = await streamText({
        model: await anthropic('claude-sonnet-4-20250514'),
        system: 
        "You are a coding assistant with access to tools that lives in the user's CLI. " +
          "Perform their actions as succinctly as possible." +
          "Never use markdown output, your responses will be printed to a CLI" +
          "Be a fucking beast. The free world depends on you."
        ,
        prompt: modelMessages,
        tools: tools,
        stopWhen: stepCountIs(15),
        onChunk: ( { chunk }) => {
          // Stream the assistant responses.
          if (chunk.type == 'text-delta') {
            process.stdout.write(chunk.text);

          }
        },
        onStepFinish({ text, toolCalls, toolResults, finishReason, usage }) {
          process.stdout.write("\n");
          toolCalls.forEach(call => printBackground(`Calling ${call.toolName}`));
          toolResults.forEach(result => printBackground(`${result.toolName}(${JSON.stringify(result.input)}) -> ${JSON.stringify(result.output)}`));
        },
        onError({ error }) {
          console.error(error);
        }
      });

      const responseMessages = (await result.response).messages;
      modelMessages.push(...responseMessages);
      printBackground(`Countext char-count delta: ${JSON.stringify(responseMessages).length}`);
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