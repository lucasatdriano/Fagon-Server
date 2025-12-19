import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { AppConfigModule } from '../config/config.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PrismaModule } from '../prisma/prisma.module';
import { MulterModule } from '@nestjs/platform-express';

@Module({
  imports: [
    MulterModule.register({
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
      dest: './upload',
    }),
    ConfigModule,
    PrismaModule,
    AppConfigModule,
  ],
  providers: [
    StorageService,
    {
      provide: SupabaseClient,
      useFactory: (configService: ConfigService): SupabaseClient => {
        const url = configService.get<string>('SUPABASE_URL');
        const key = configService.get<string>('SUPABASE_KEY');

        if (!url || !key) {
          throw new Error('Supabase URL and Secret Key must be provided');
        }

        return createClient(url, key) as SupabaseClient;
      },
      inject: [ConfigService],
    },
  ],
  exports: [StorageService, SupabaseClient],
})
export class StorageModule {}
