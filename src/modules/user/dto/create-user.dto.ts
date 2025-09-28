import { IsOptional, IsString } from "class-validator";

export class CreateUserDto {
    @IsString()
    name: string;

    @IsString()
    email: string;

    @IsString()
    status: string;

    @IsString()
    avatar: string;

    @IsOptional()
    roleId?: string;

    @IsOptional()
    password?: string;
}
