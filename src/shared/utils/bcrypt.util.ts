import * as bcrypt from 'bcrypt';

/**
 * Hash password với salt
 * @param password - mật khẩu gốc
 * @param saltOrRounds - số vòng salt (default 10)
 * @returns mật khẩu đã hash
 */
export async function hashPassword(password: string, saltOrRounds = 10): Promise<string> {
  return bcrypt.hash(password, saltOrRounds);
}

/**
 * So sánh mật khẩu gốc với mật khẩu đã hash
 * @param password - mật khẩu gốc user nhập
 * @param hashedPassword - mật khẩu đã hash trong DB
 * @returns true nếu đúng, false nếu sai
 */
export async function comparePassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}
