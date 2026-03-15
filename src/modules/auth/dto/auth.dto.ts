import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { Match } from '../decorators/match.decorator';

export class AuthDTO {
  /** Họ và tên */
  @IsString({ message: 'Họ và tên phải là chuỗi' })
  @IsNotEmpty({ message: 'Họ và tên không được để trống' })
  name: string;

  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  /** Mã sinh viên */
  @IsOptional()
  @IsString({ message: 'Mã sinh viên phải là chuỗi' })
  studentId?: string;

  /** Số điện thoại */
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{10,11}$/, {
    message: 'Số điện thoại phải từ 10–11 chữ số',
  })
  phone?: string;

  @IsString({ message: 'Mật khẩu phải là chuỗi' })
  @MinLength(8, { message: 'Mật khẩu phải dài ít nhất 8 ký tự' })
  password: string;

  /** Xác nhận mật khẩu */
  @IsString()
  @Match('password', { message: 'Xác nhận mật khẩu không khớp' })
  confirmPassword: string;
}

export class LoginDTO {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
