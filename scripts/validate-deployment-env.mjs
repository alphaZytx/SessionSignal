import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

if (existsSync('.env.local')) {
  loadEnvFile('.env.local');
}

const required = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'EXTENSION_SUPABASE_URL',
  'EXTENSION_SUPABASE_PUBLISHABLE_KEY'
];

const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) {
  console.error(`Deployment blocked: missing ${missing.join(', ')}.`);
  process.exit(1);
}

const websiteUrl = process.env.VITE_SUPABASE_URL.trim().replace(/\/$/, '');
const extensionUrl = process.env.EXTENSION_SUPABASE_URL.trim().replace(/\/$/, '');
const websiteKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY.trim();
const extensionKey = process.env.EXTENSION_SUPABASE_PUBLISHABLE_KEY.trim();

const errors = [];
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(websiteUrl) || websiteUrl.includes('YOUR_PROJECT')) {
  errors.push('VITE_SUPABASE_URL must be a real HTTPS Supabase project URL');
}
if (websiteUrl !== extensionUrl) errors.push('website and extension Supabase URLs must match');
if (!websiteKey.startsWith('sb_publishable_') || websiteKey.includes('REPLACE_ME') || websiteKey.length < 30) {
  errors.push('VITE_SUPABASE_PUBLISHABLE_KEY must be a real publishable key');
}
if (websiteKey !== extensionKey) errors.push('website and extension publishable keys must match');
if (/sb_secret_|service_role/i.test(required.map((name) => process.env[name]).join(' '))) {
  errors.push('a server secret was placed in a public build variable');
}

if (errors.length) {
  console.error(`Deployment blocked:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log('Deployment environment is valid and uses one matching Supabase project.');
