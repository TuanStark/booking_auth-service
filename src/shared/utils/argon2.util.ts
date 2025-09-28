import * as argon2 from 'argon2';

export async function hashPassword(password: string) {
  return argon2.hash(password);
}


export async function comparePassword(plainTextPassword: string | undefined | null, hash: string | undefined | null): Promise<boolean> {
  try {
    if (!plainTextPassword || !hash) {
      console.error('Mật khẩu hoặc hash không hợp lệ');
      return false;
    }
    
    const cleanPassword = plainTextPassword.toString().trim();
    const cleanHash = hash.toString();
    
    return await argon2.verify(cleanHash, cleanPassword);
  } catch (error) {
    console.error('Lỗi khi xác thực mật khẩu:', error);
    return false;
  }
}

export async function verifyPassword(hash: string, plain: string) {
  return argon2.verify(hash, plain);
}
