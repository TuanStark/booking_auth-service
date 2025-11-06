import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { RabbitMQProducerService } from './rabbitmq.producer.service';

@Module({
  imports: [
    ConfigModule,
    ClientsModule.registerAsync([
      {
        name: 'RABBITMQ_CLIENT',
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => {
          const logger = new Logger('RabbitMQModule');
          const rabbitmqUrl = configService.get<string>('RABBITMQ_URL') || 'amqp://localhost:5672';
          const queue = configService.get<string>('RABBITMQ_QUEUE') || 'notification_queue';
          
          logger.log(`🔗 Connecting to RabbitMQ: ${rabbitmqUrl}`);
          logger.log(`📨 Queue: ${queue}`);
          
          return {
            transport: Transport.RMQ,
            options: {
              urls: [rabbitmqUrl],
              queue: queue,
              queueOptions: { durable: true },
              noAck: true,
              prefetchCount: 0,
            },
          };
        },
        inject: [ConfigService],
      },
    ]),
  ],
  providers: [RabbitMQProducerService],
  exports: [RabbitMQProducerService],
})
export class RabbitMQModule {}