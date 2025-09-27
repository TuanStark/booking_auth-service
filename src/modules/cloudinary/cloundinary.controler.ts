import { Controller, Post, UploadedFile, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { CloudinaryService } from './cloudinary.service';

@Controller('images')
export class ImageController {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 1000000 }, // 1MB
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.match(/image\/(jpg|jpeg|png|gif)/)) {
        return cb(new Error('Only image files are allowed!'), false);
      }
      cb(null, true);
    },
  }))
  async uploadSingleImage(@UploadedFile() file: Express.Multer.File) {
    try {
      const result = await this.cloudinaryService.uploadImage(file, {
        folder: 'movieTix',
        quality: 'auto',
        fetch_format: 'auto',
      });
      return {
        message: 'Image uploaded successfully',
        url: result.secure_url,
        publicId: result.public_id,
      };
    } catch (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }
  }

  @Post('upload-multiple')
  @UseInterceptors(FilesInterceptor('files', 10, {
    limits: { fileSize: 1000000 }, // 1MB mỗi file
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.match(/image\/(jpg|jpeg|png|gif)/)) {
        return cb(new Error('Only image files are allowed!'), false);
      }
      cb(null, true);
    },
  }))
  async uploadMultipleImages(@UploadedFiles() files: Express.Multer.File[]) {
    try {
      if (!files || files.length === 0) {
        throw new Error('No files provided');
      }
      const results = await this.cloudinaryService.uploadMultipleImages(files, {
        folder: 'movieTix',
        quality: 'auto',
        fetch_format: 'auto',
      });
      return {
        message: 'Images uploaded successfully',
        images: results.map((result) => ({
          url: result.secure_url,
          publicId: result.public_id,
        })),
      };
    } catch (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }
  }
}