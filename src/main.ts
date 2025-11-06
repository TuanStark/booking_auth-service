import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  
  // Log RabbitMQ connection info
  logger.log(`🔗 Auth Service RabbitMQ URL: ${process.env.RABBITMQ_URL || 'amqp://localhost:5672'}`);
  logger.log(`📨 Auth Service Queue: ${process.env.RABBITMQ_QUEUE || 'booking.payments'}`);
  
  await app.listen(process.env.PORT ?? 3001);
  console.log('Auth service listening', process.env.PORT || 3001);
}
bootstrap();
