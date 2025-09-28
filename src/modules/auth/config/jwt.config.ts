import { registerAs } from '@nestjs/config';
import { JwtModuleOptions } from '@nestjs/jwt';
import * as fs from 'fs';
import * as path from 'path';

export interface JwtConfig {
  privateKey: string;
  publicKey: string;
  signOptions: {
    algorithm: string;
    expiresIn: string;
  };
  verifyOptions: {
    algorithms: string[];
  };
}

export default registerAs('jwt', (): JwtModuleOptions => {
  // Sử dụng đường dẫn tương đối từ thư mục gốc của dự án
  const privateKeyPath = path.join(process.cwd(), 'keys/private.pem');
  const publicKeyPath = path.join(process.cwd(), 'keys/public.pem');

  // Kiểm tra xem file có tồn tại không
  if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
    console.error('JWT keys not found at:', { privateKeyPath, publicKeyPath });
    throw new Error('JWT key files not found');
  }

  const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
  const publicKey = fs.readFileSync(publicKeyPath, 'utf8');

  return {
    privateKey: privateKey,
    publicKey: publicKey,
    signOptions: {
      algorithm: 'RS256',
      expiresIn: process.env.JWT_EXPIRE_IN || '1h',
    },
    verifyOptions: {
      algorithms: ['RS256'],
    },
  };
});
