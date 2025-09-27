import { Injectable } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse, UploadApiErrorResponse, UploadApiOptions } from 'cloudinary';
import toStream = require('buffer-to-stream');

@Injectable()
export class CloudinaryService {
  /**
   * Upload một ảnh lên Cloudinary với cấu hình tùy chỉnh
   * @param file File ảnh từ Multer
   * @param options Cấu hình Cloudinary (folder, transformations, v.v.)
   */
  async uploadImage(
    file: Express.Multer.File,
    options: UploadApiOptions = {},
  ): Promise<UploadApiResponse | UploadApiErrorResponse> {
    // Kiểm tra file hợp lệ
    if (!file) {
      throw new Error('No file provided');
    }
    if (file.size > 3000000) {
      throw new Error('File size exceeds 1MB limit');
    }
    if (!file.mimetype.startsWith('image')) {
      throw new Error('File is not an image');
    }

    // Mặc định folder nếu không được cung cấp
    const uploadOptions: UploadApiOptions = {
      folder: options.folder || 'movieTix',
      resource_type: 'image',
      ...options,
    };

    return new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) return reject(error);
          resolve(result as UploadApiResponse);
        },
      );
      toStream(file.buffer).pipe(upload);
    });
  }

  /**
   * Upload nhiều ảnh lên Cloudinary
   * @param files Danh sách file ảnh từ Multer
   * @param options Cấu hình Cloudinary (folder, transformations, v.v.)
   */
  async uploadMultipleImages(
    files: Express.Multer.File[],
    options: UploadApiOptions = {},
  ): Promise<(UploadApiResponse | UploadApiErrorResponse)[]> {
    if (!files || files.length === 0) {
      throw new Error('No files provided');
    }

    // Upload song song các ảnh
    const uploadPromises = files.map((file) => this.uploadImage(file, options));
    return Promise.all(uploadPromises);
  }

  /**
   * Xóa ảnh trên Cloudinary theo publicId
   * @param publicId Public ID của ảnh trên Cloudinary
   */
  async deleteImage(publicId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.destroy(publicId, { resource_type: 'image' }, (error) => {
        if (error) return reject(error);
        resolve();
      });
    });
  }

  /**
   * Xóa nhiều ảnh trên Cloudinary
   * @param publicIds Danh sách public ID của ảnh
   */
  async deleteMultipleImages(publicIds: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.destroy(publicIds.join(','), { resource_type: 'image' }, (error) => {
        if (error) return reject(error);
        resolve();
      });
    });
  }

  /**
   * Update một ảnh: xóa ảnh cũ (nếu có) và upload ảnh mới
   * @param file File ảnh mới từ Multer
   * @param oldPublicId Public ID của ảnh cũ (nếu có)
   * @param options Cấu hình Cloudinary
   */
  async updateImage(
    file: Express.Multer.File,
    oldPublicId: string | null,
    options: UploadApiOptions = {},
  ): Promise<UploadApiResponse | UploadApiErrorResponse> {
    // Xóa ảnh cũ nếu có
    if (oldPublicId) {
      await this.deleteImage(oldPublicId);
    }

    // Upload ảnh mới
    return this.uploadImage(file, options);
  }

  /**
   * Update nhiều ảnh: xóa danh sách ảnh cũ và upload danh sách ảnh mới
   * @param files Danh sách file ảnh mới từ Multer
   * @param oldPublicIds Danh sách public ID của ảnh cũ
   * @param options Cấu hình Cloudinary
   */
  async updateMultipleImages(
    files: Express.Multer.File[],
    oldPublicIds: string[] | null,
    options: UploadApiOptions = {},
  ): Promise<(UploadApiResponse | UploadApiErrorResponse)[]> {
    // Xóa các ảnh cũ nếu có
    if (oldPublicIds && oldPublicIds.length > 0) {
      await this.deleteMultipleImages(oldPublicIds);
    }

    // Upload các ảnh mới
    return this.uploadMultipleImages(files, options);
  }
}