import { EchoClient, createEchoOpenAI } from '@merit-systems/echo-typescript-sdk';
import { generateText, readUIMessageStream, stepCountIs, streamText, tool, type Tool } from 'ai';
import open from 'open';
import { getOrCreateApiKey } from './apiKey';
import { z } from 'zod';

const APP_ID = 'd4db70fb-4df9-4161-a89b-9ec53125088b';

async function main() {
  try {
    const apiKey = await getOrCreateApiKey(APP_ID);

    // Create Echo client for balance/payments
    const echo = new EchoClient({ apiKey });

    // Create OpenAI provider with Echo billing
    const openai = createEchoOpenAI(
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
    // 1. Let this bitch list files and read files.
    // 2. Use anthropic to let it modify a file.
    // 3. Let it use bash with approval.
    // 4. Let it do code search with rg.


    const tools = {
        weather: tool({
          description: 'Get the weather in a location',
          inputSchema: z.object({
            location: z.string().describe('The location to get the weather for')
          }),
          execute: async ({ location }) => ({
            location,
            temperature: 72 + Math.floor(Math.random() * 21) - 10
          })
        })
      };



    await generateText({
      model: await openai('gpt-4o'),
      prompt: 'Explain quantum computing in simple terms and the weather in LA then tell me a story about it.',
      tools: tools,
      stopWhen: stepCountIs(5),
      onStepFinish({ text, toolCalls, toolResults, finishReason, usage }) {

        if (text !== '') {
          console.log("Assistant: ", text);
        }

        for (const toolResult of toolResults) {
          if (toolResult.type == 'tool-result') { // unsure if necessary
            console.log(`${toolResult.toolName}(${JSON.stringify(toolResult.input)}) -> ${JSON.stringify(toolResult.output)}`);
          }
        }

      }
    });






  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();