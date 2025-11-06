# 🔐 Auth Service

Service xác thực và quản lý người dùng cho hệ thống Dorm Booking System. Service này xử lý đăng ký, đăng nhập, xác thực JWT, OAuth Google, và quản lý refresh tokens.

## 🚀 Tính năng

### **Authentication & Authorization**
- ✅ Đăng ký người dùng mới với email verification
- ✅ Đăng nhập với email/password
- ✅ JWT authentication với RS256 (RSA keys)
- ✅ Refresh token rotation
- ✅ OAuth Google integration
- ✅ Email verification code
- ✅ Resend verification code

### **Security**
- ✅ Password hashing với Argon2
- ✅ RSA key pair cho JWT signing/verification
- ✅ Refresh token rotation và revocation
- ✅ Rate limiting (có thể cấu hình)
- ✅ Secure cookie handling

### **Integration**
- ✅ RabbitMQ event publishing (user.created)
- ✅ Redis caching
- ✅ Email service integration (verification codes)
- ✅ Cloudinary integration (avatar upload)

## 📁 Cấu trúc thư mục

```
src/
├── modules/
│   ├── auth/              # Authentication module
│   │   ├── dto/          # Data Transfer Objects
│   │   ├── guard/        # Auth guards
│   │   ├── strategy/     # Passport strategies (JWT, Local, Google)
│   │   ├── config/       # JWT configuration
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   └── auth.module.ts
│   └── user/             # User management module
│       ├── user.service.ts
│       └── user.module.ts
├── messaging/
│   ├── rabbitmq/         # RabbitMQ integration
│   └── redis/            # Redis integration
├── prisma/
│   ├── schema.prisma     # Database schema
│   └── seed.ts           # Database seeding
├── common/               # Shared utilities
├── config/               # Configuration files
└── main.ts
```

## ⚙️ Cấu hình

### **Environment Variables**

Tạo file `.env` trong thư mục root:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/auth_db"

# JWT Configuration
JWT_PRIVATE_KEY_PATH=./keys/private.pem
JWT_PUBLIC_KEY_PATH=./keys/public.pem
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Application
PORT=4000
NODE_ENV=development

# Frontend URL (for OAuth redirects)
FRONTEND_URL=http://localhost:3000

# Cookie Settings
COOKIE_SAME_SITE=lax
REFRESH_EXPIRE_DAYS=7

# RabbitMQ
RABBITMQ_URL=amqp://localhost:5672

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Email (for verification codes)
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=your-email@gmail.com
MAIL_PASS=your-app-password

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Cloudinary (for avatar upload)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

### **Tạo RSA Keys**

```bash
# Tạo thư mục keys
mkdir -p keys

# Tạo private key (RSA 2048-bit)
openssl genrsa -out keys/private.pem 2048

# Tạo public key từ private key
openssl rsa -in keys/private.pem -pubout -out keys/public.pem
```

**⚠️ Lưu ý**: 
- `private.pem` không được commit vào git
- `public.pem` có thể được chia sẻ với API Gateway để verify tokens

## 🚀 Cài đặt và chạy

### **Yêu cầu**
- Node.js 18+
- PostgreSQL
- RabbitMQ (optional)
- Redis (optional)

### **Cài đặt**

```bash
# Cài đặt dependencies
npm install

# Tạo file .env từ .env.example (nếu có)
cp .env.example .env

# Chỉnh sửa .env với thông tin của bạn

# Chạy database migrations
npx prisma migrate dev

# Generate Prisma Client
npx prisma generate

# Seed database (optional)
npx prisma db seed
```

### **Chạy development**

```bash
npm run start:dev
```

### **Build và chạy production**

```bash
# Build
npm run build

# Chạy production
npm run start:prod
```

## 📡 API Endpoints

### **Authentication**

#### `POST /auth/register`
Đăng ký người dùng mới

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "User Name"
}
```

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name",
    "status": "unactive",
    "codeId": "verification-code-id"
  },
  "statusCode": 201,
  "message": "Created"
}
```

#### `POST /auth/login`
Đăng nhập

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "data": {
    "accessToken": "jwt-access-token",
    "refreshToken": "refresh-token",
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "User Name"
    }
  },
  "statusCode": 200,
  "message": "Success"
}
```

#### `POST /auth/refresh`
Làm mới access token

**Request:**
- Cookie: `refresh_token` (httpOnly)

**Response:**
```json
{
  "accessToken": "new-jwt-access-token"
}
```

#### `POST /auth/logout`
Đăng xuất

**Request:**
- Cookie: `refresh_token` (httpOnly)

**Response:**
```json
{
  "ok": true
}
```

#### `POST /auth/check-code`
Xác thực email với verification code

**Request Body:**
```json
{
  "codeId": "verification-code-id",
  "id": "user-id"
}
```

#### `POST /auth/resend-code`
Gửi lại verification code

**Request Body:**
```json
{
  "id": "user-id",
  "email": "user@example.com"
}
```

### **OAuth Google**

#### `GET /auth/google`
Bắt đầu OAuth flow với Google

#### `GET /auth/google/callback`
Callback từ Google OAuth (tự động redirect)

## 🔄 Integration với các services khác

### **RabbitMQ Events**

Service publish các events sau:

- `user.created` - Khi user mới được tạo

### **Kafka Events**

- Có thể mở rộng để publish events lên Kafka

## 🧪 Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## 📝 Database Schema

Service sử dụng Prisma ORM. Xem file `prisma/schema.prisma` để biết chi tiết schema.

### **Main Models:**
- `User` - Thông tin người dùng
- `Role` - Vai trò người dùng
- `RefreshToken` - Refresh tokens để rotation

## 🔒 Security Best Practices

1. **Password Hashing**: Sử dụng Argon2 (industry standard)
2. **JWT**: RS256 với RSA keys (asymmetric)
3. **Refresh Tokens**: Rotation và revocation
4. **Rate Limiting**: Cấu hình rate limiting cho các endpoints
5. **Input Validation**: Sử dụng class-validator
6. **HTTPS**: Luôn sử dụng HTTPS trong production

## 🐳 Docker

```bash
# Build image
docker build -t auth-service .

# Run với docker-compose
docker-compose up
```

## 📚 Tài liệu thêm

- [NestJS Documentation](https://docs.nestjs.com)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Passport.js Documentation](http://www.passportjs.org)
- [JWT Best Practices](https://datatracker.ietf.org/doc/html/rfc8725)

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📄 License

MIT
