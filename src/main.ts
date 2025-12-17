import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { setupSwagger } from './docs/swagger.config';
import { PrismaService } from './prisma/prisma.service';
import { Logger, ValidationPipe } from '@nestjs/common';
import * as dotenv from 'dotenv';
import * as bodyParser from 'body-parser';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger:
      process.env.NODE_ENV === 'production'
        ? ['warn', 'error', 'log']
        : ['verbose', 'debug', 'log', 'warn', 'error'],
  });
  const prismaService = app.get(PrismaService);
  const logger = new Logger('Bootstrap');
  const port = process.env.PORT || 3000;

  app.setGlobalPrefix('api/v1');

  setupSwagger(app);
  app.useGlobalInterceptors(new TransformInterceptor());

  prismaService.enableShutdownHooks(app);

  app.enableCors({
    origin: [
      'http://localhost:8080',
      'http://localhost:3000',
      'https://fagon-server-c822.onrender.com',
      'https://fagon.vercel.app',
      'https://fagon-server.onrender.com',
      'https://fagon-client.vercel.app',
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Cache-Control',
      'X-Requested-With',
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      disableErrorMessages: process.env.NODE_ENV === 'production',
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      skipMissingProperties: false,
      forbidUnknownValues: false,
      skipUndefinedProperties: true,
      skipNullProperties: true,
    }),
  );

  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

  await app.listen(port);
  logger.log(`Application running on port ${port}`);
}

bootstrap().catch((err) => {
  console.error('❌ Erro ao iniciar o app:', err);
  console.error('❌ Stack:', err.stack);
  process.exit(1);
});
