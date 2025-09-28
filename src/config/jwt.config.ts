import { readFileSync } from 'fs';
import { join } from 'path';

export function loadPrivateKey(): string {
  const path = process.env.JWT_PRIVATE_KEY_PATH || join(process.cwd(), 'keys', 'private.pem');
  return readFileSync(path, 'utf8');
}

export function loadPublicKey(): string {
  const path = process.env.JWT_PUBLIC_KEY_PATH || join(process.cwd(), 'keys', 'public.pem');
  return readFileSync(path, 'utf8');
}
