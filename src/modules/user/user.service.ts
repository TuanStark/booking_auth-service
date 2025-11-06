import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { FindAllDto } from 'src/common/global/find-all.dto';
import * as argon from 'argon2';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService,
  ) { }

  async create(createUserDto: CreateUserDto) {
    try {
      const { password, roleId, email, ...userData } = createUserDto;
      
      // Kiểm tra email đã tồn tại chưa
      const existingUser = await this.findByEmail(email);
      if (existingUser) {
        throw new BadRequestException(`User with email ${email} already exists`);
      }

      const hashedPassword = password ? await argon.hash(password) : await argon.hash("123456");

      // Chuẩn bị data với role nếu có roleId
      const data: any = {
        ...userData,
        email,
        password: hashedPassword,
      };

      // Chỉ connect role nếu roleId được cung cấp
      if (roleId) {
        // Kiểm tra role có tồn tại không
        const role = await this.prisma.role.findUnique({
          where: { id: roleId },
        });
        
        if (!role) {
          throw new BadRequestException(`Role with id ${roleId} not found`);
        }

        data.role = {
          connect: {
            id: roleId,
          },
        };
      }

      return await this.prisma.user.create({
        data,
        include: {
          role: true,
        },
      });
    } catch (error) {
      // Re-throw nếu là BadRequestException hoặc NotFoundException
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      // Log và throw generic error cho các lỗi khác
      console.error('Error creating user:', error);
      throw new BadRequestException(`Failed to create user: ${error.message}`);
    }
  }

  async findAll(query: FindAllDto) {
    const {
      page = 1,
      limit = 10,
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = query;

    const pageNumber = Number(page);
    const limitNumber = Number(limit);

    if (pageNumber < 1 || limitNumber < 1) {
      throw new Error('Page and limit must be greater than 0');
    }

    const take = limitNumber;
    const skip = (pageNumber - 1) * take;

    const searchUpCase = search.charAt(0).toUpperCase() + search.slice(1);
    const where = search
      ? {
        OR: [
          { firstName: { contains: searchUpCase } },
          { lastName: { contains: searchUpCase } },
          { email: { contains: searchUpCase } },
        ]
      }
      : {};
    const orderBy = {
      [sortBy]: sortOrder
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: where,
        orderBy: orderBy,
        skip,
        take,
      }),
      this.prisma.user.count({
        where: where,
      })
    ])

    return {
      data: users,
      meta: {
        total,
        pageNumber,
        limitNumber,
        totalPages: Math.ceil(total / limitNumber),
      },
    };
  }

  async findOne(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        role: true,
      }
    });
  }

  async findOneForAuthentication(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        role: true,
      }
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto, file: Express.Multer.File) {
    const existingUser = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    try {
      const updatedUser = await this.prisma.user.update({
        where: { id },
        data: updateUserDto,
      });

      if (file) {
        try {
          return updatedUser;
        } catch (error) {
          throw new BadRequestException(`Failed to update user: ${error.message}`);
        }
      }
    } catch (error) {
      throw new BadRequestException(`Failed to update user: ${error.message}`);
    }
  }

  async remove(id: string, updateUserDto: UpdateUserDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    try {
      await this.prisma.user.update({
        where: { id },
        data: { status: 'unactive' },
      });

      return { message: 'User deleted successfully' };
    } catch (error) {
      throw new BadRequestException(`Failed to delete user: ${error.message}`);
    }
  }

  async findByEmail(email: string) {
    return await this.prisma.user.findUnique({
      where: {
        email,
      },
      include: {
        role: true
      }
    });
  }
}
