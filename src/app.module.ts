import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard } from './auth/guards/auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { AppConfigModule } from './config/config.module';
import { AuthModule } from './auth/auth.module';
import { MetricsModule } from './core/monitoring/metrics/metrics.module';
import { FlagsModule } from './feature-flags/flags.module';
import { GatewaysModule } from './gateways/gateways.module';
import { SwaggerModule } from '@nestjs/swagger';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { LoggerModule } from './core/logger/logger.module';
import { RateLimitModule } from './core/rate-limit/rate-limit.module';
import { StorageModule } from './storage/storage.module';

import { AgencyModule } from './modules/agencies/agencies.module';
import { EngineerModule } from './modules/engineers/engineers.module';
import { UserModule } from './modules/users/users.module';
import { ProjectModule } from './modules/projects/projects.module';
import { LocationModule } from './modules/locations/locations.module';
import { PavementModule } from './modules/pavements/pavements.module';
import { PhotoModule } from './modules/photos/photos.module';
import { MaterialFinishingModule } from './modules/material-finishings/material-finishings.module';
import { PdfModule } from './modules/pdfs/pdfs.module';
import { PathologyModule } from './modules/pathologies/pathologies.module';
import { PathologyPhotoModule } from './modules/pathology-photos/pathology-photos.module';
import { StateLawModule } from './modules/state-laws/state-laws.module';
import { LogModule } from './modules/logs/logs.module';
import { AuthExceptionFilter } from './common/filters/auth-exception.filter';
import { InspectorModule } from './modules/inspectors/inspectors.module';
import { DistanceModule } from './modules/distances/distance.module';

@Module({
  imports: [
    AppConfigModule,
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: {
        enabled: false,
      },
    }),
    ScheduleModule.forRoot(),
    // ServeStaticModule.forRoot({
    //   rootPath: join(__dirname, '..', 'public'),
    //   exclude: ['/api*'],
    // }),
    SwaggerModule,
    LoggerModule,
    FlagsModule,
    RateLimitModule,
    MetricsModule,
    GatewaysModule,
    QueueModule,
    PrismaModule,
    AuthModule,
    StorageModule,
    LogModule,
    DistanceModule,
    UserModule,
    AgencyModule,
    EngineerModule,
    InspectorModule,
    ProjectModule,
    LocationModule,
    MaterialFinishingModule,
    PathologyModule,
    PathologyPhotoModule,
    PavementModule,
    PdfModule,
    PhotoModule,
    StateLawModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: AuthExceptionFilter,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
