import { EchoClient, createEchoOpenAI } from '@merit-systems/echo-typescript-sdk';
import { generateText } from 'ai';
import enquirer from 'enquirer';
import open from 'open';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { getOrCreateApiKey } from './apiKey';

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

    // Generate text with automatic billing
    const { text } = await generateText({
      model: await openai('gpt-4o'),
      prompt: 'Explain quantum computing in simple terms',
    });

    console.log('\nAI Response:');
    console.log(text);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();