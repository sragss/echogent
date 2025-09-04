import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import enquirer from 'enquirer';
import open from 'open';

const CONFIG_DIR = path.join(os.homedir(), '.echogent');
const API_KEY_PATH = path.join(CONFIG_DIR, 'api-key.txt');

async function readSavedApiKey(): Promise<string | null> {
  try {
    const contents = await fs.readFile(API_KEY_PATH, 'utf8');
    const key = contents.trim();
    return key ? key : null;
  } catch (err: any) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

async function saveApiKey(key: string): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await fs.writeFile(API_KEY_PATH, `${key}\n`, { mode: 0o600 });
  await fs.chmod(API_KEY_PATH, 0o600);
}

export async function getOrCreateApiKey(appId: string): Promise<string> {
  const saved = await readSavedApiKey();
  if (saved) {
    console.log(`Using saved API key from ${API_KEY_PATH}`);
    return saved;
  }

  console.log('Opening Echo to create your API key...');
  await open(`https://echo.merit.systems/app/${appId}/keys`);

  const promptResult = await enquirer.prompt({
    type: 'input',
    name: 'apiKey',
    message: 'Enter your API key:'
  }) as { apiKey: string };

  const apiKey = (promptResult.apiKey || '').trim();
  if (!apiKey) {
    throw new Error('No API key provided');
  }

  await saveApiKey(apiKey);
  console.log(`Saved API key to ${API_KEY_PATH}`);
  return apiKey;
}


