import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqp-connection-manager';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel } from 'amqplib';

/** Payload shapes published to user_exchange (topic = routing key). */
export type UserExchangePayload = Record<string, unknown>;

@Injectable()
export class RabbitMQProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQProducerService.name);
  private connection!: amqp.AmqpConnectionManager;
  private channelWrapper!: ChannelWrapper;

  private readonly exchange: string;

  constructor(private readonly configService: ConfigService) {
    this.exchange =
      this.configService.get<string>('RABBITMQ_EXCHANGE') ?? 'user_exchange';
  }

  async onModuleInit(): Promise<void> {
    const url =
      this.configService.get<string>('RABBITMQ_URL') ?? 'amqp://localhost:5672';
    this.connection = amqp.connect([url]);

    this.connection.on('connect', () =>
      this.logger.log('Connected to RabbitMQ'),
    );
    this.connection.on('disconnect', (err) =>
      this.logger.error('Disconnected from RabbitMQ', err),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(this.exchange, 'topic', {
          durable: true,
        });
        this.logger.log(
          `RabbitMQ Topology: Exchange=${this.exchange} (topic)`,
        );
      },
    });
  }

  async publishMessage(pattern: string, data: UserExchangePayload): Promise<void> {
    try {
      if (!this.channelWrapper) {
        throw new Error('RabbitMQ channel is not available');
      }

      const payload = { pattern, data };
      const sanitized: Record<string, unknown> = { ...data };
      if ('password' in sanitized) sanitized.password = '[REDACTED]';
      this.logger.log(
        `Publishing to ${pattern}: ${JSON.stringify(sanitized)}`,
      );

      await this.channelWrapper.publish(
        this.exchange,
        pattern,
        Buffer.from(JSON.stringify(payload)),
        {
          persistent: true,
          contentType: 'application/json',
        } as Record<string, unknown>,
      );

      this.logger.log(`✅ Message published to pattern: ${pattern}`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to publish to ${pattern}: ${msg}`, stack);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.channelWrapper) {
      await this.channelWrapper.close();
    }
    if (this.connection) {
      await this.connection.close();
    }
    this.logger.log('RabbitMQ connection closed');
  }
}
