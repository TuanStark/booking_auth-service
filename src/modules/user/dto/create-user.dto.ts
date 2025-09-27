import { IsOptional, IsString } from "class-validator";

export class CreateUserDto {
    @IsString()
    fullName: string;

    @IsString()
    email: string;

    @IsString()
    status: string;

    @IsString()
    avatar: string;

    @IsOptional()
    roleId?: number;

    @IsOptional()
    password?: string;
}
