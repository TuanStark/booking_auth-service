import { Injectable, Logger, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

export interface CreateUserEventData {
  id: string;
  email: string;
  password: string;
  name: string;
  roleId: string;
  codeId: string;
  codeExpired: Date;
}

@Injectable()
export class RabbitMQProducerService {
  private readonly logger = new Logger(RabbitMQProducerService.name);

  constructor(
    @Inject('RABBITMQ_CLIENT') private readonly client: ClientProxy,
  ) {
    this.logger.log('RabbitMQProducerService initialized');
    this.logger.log(`🔗 RabbitMQ Client available: ${!!this.client}`);
  }

  async emitCreateUserEvent(topic: string, data: CreateUserEventData): Promise<void> {
    try {
      this.logger.log(`Publishing create user event to ${topic}: ${JSON.stringify(data)}`);
      
      // Check if client is available
      if (!this.client) {
        throw new Error('RabbitMQ client is not available');
      }
      
      // Try to emit the message
      this.client.emit(topic, data);
      this.logger.log(`✅ Create user event published successfully to ${topic}`);
      
      // Wait a bit to see if there are any immediate errors
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      this.logger.error(`❌ Failed to publish create user event to ${topic}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async emitResendVerificationCodeEvent(topic: string, data: CreateUserEventData): Promise<void> {
    try {
      this.logger.log(`Publishing resend verification code event to ${topic}: ${JSON.stringify(data)}`);
      
      // Check if client is available
      if (!this.client) {
        throw new Error('RabbitMQ client is not available');
      }
      
      this.client.emit(topic, data);
      this.logger.log(`✅ Resend verification code event published successfully to ${topic}`);
    } catch (error) {
      this.logger.error(`❌ Failed to publish resend verification code event to ${topic}: ${error.message}`, error.stack);
      throw error;
    }
  }

}
