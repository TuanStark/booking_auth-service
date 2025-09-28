import * as argon2 from 'argon2';

export async function hashPassword(password: string) {
  return argon2.hash(password);
}
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

export async function verifyPassword(hash: string, plain: string) {
  return argon2.verify(hash, plain);
}
