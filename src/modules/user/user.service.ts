import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { FindAllDto } from 'src/common/global/find-all.dto';
import { CloudinaryService } from 'src/modules/cloudinary/cloudinary.service';
import * as argon from 'argon2';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService,
    private cloudinaryService: CloudinaryService
  ) { }

  async create(createUserDto: CreateUserDto) {
    const { password, roleId, ...userData } = createUserDto;
    const hashedPassword = password ? await argon.hash(password) : "123456";

    return this.prisma.user.create({
      data: {
        ...userData,
        password: hashedPassword,
        role: {
          connect: {
            id: roleId
          }
        }
      },
    });
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

  async findOne(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        role: true,
        examAttempts: true,
        userLearningPaths: true,
        blogPosts: true,
        blogComments: true,
        vocabularyProgress: true,
        grammarProgress: true,
      }
    });
  }

  async findOneForAuthentication(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        role: true,
      }
    });
  }

  async update(id: number, updateUserDto: UpdateUserDto, file: Express.Multer.File) {
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
          const avatar = await this.cloudinaryService.updateImage(file, existingUser.avatar);
          if (avatar) {
            const updatedUsers = await this.prisma.user.update({
              where: { id: updatedUser.id },
              data: { avatar: avatar.secure_url },
            });
            return updatedUsers;
          }
        } catch (uploadError) {
          throw new BadRequestException(`Failed to upload logo: ${uploadError.message}`);
        }
      }

      return updatedUser;
    } catch (error) {
      throw new BadRequestException(`Failed to update user: ${error.message}`);
    }
  }

  async remove(id: number, updateUserDto: UpdateUserDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    try {
      await this.prisma.user.update({
        where: { id },
        data: updateUserDto,
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
    });
  }
}
