// Backs up or restores all of the app's data, on Cloudflare or any other server.
//
//   npm run data -- export <address> [file]   save everything to a file (data.json by default)
//   npm run data -- import <address> <file>   replace everything with a backup file
//
// <address> is where the app runs, such as https://minimap.example.workers.dev.
// The admin password comes from ADMIN_PASSWORD (or .env); otherwise it is asked for.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline/promises';

const root = path.join(import.meta.dirname, '..');
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const [command, address, file = command === 'export' ? 'data.json' : undefined] = process.argv.slice(2);
if (!['export', 'import'].includes(command ?? '') || !address || !file) {
  console.error('Usage:\n  npm run data -- export <address> [file]\n  npm run data -- import <address> <file>');
  process.exit(1);
}

let base: string;
try {
  base = new URL(address).origin;
} catch {
  console.error(`"${address}" is not a full address. Start it with https:// or http://.`);
  process.exit(1);
}

async function askPassword(): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Admin password: ');
  rl.close();
  return answer;
}

const password = process.env.ADMIN_PASSWORD || (await askPassword());
const headers = { 'x-admin-password': password, 'Content-Type': 'application/json' };

async function fail(res: Response): Promise<never> {
  const { error } = (await res.json().catch(() => ({}))) as { error?: string };
  console.error(error || `The server answered ${res.status}.`);
  process.exit(1);
}

if (command === 'export') {
  const res = await fetch(`${base}/api/admin/data`, { headers });
  if (!res.ok) await fail(res);
  const data = (await res.json()) as { users: unknown[] };
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`Saved ${data.users.length} users to ${file}.`);
} else {
  if (!fs.existsSync(file)) {
    console.error(`There is no file called ${file}.`);
    process.exit(1);
  }
  const res = await fetch(`${base}/api/admin/data`, { method: 'PUT', headers, body: fs.readFileSync(file, 'utf8') });
  if (!res.ok) await fail(res);
  const { users } = (await res.json()) as { users: number };
  console.log(`Imported ${users} users into ${base}. Everything that was there before has been replaced.`);
}
