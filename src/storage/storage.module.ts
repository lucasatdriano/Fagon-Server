import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { AppConfigModule } from 'src/config/config.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [ConfigModule, PrismaModule, AppConfigModule],
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

        return createClient(url, key);
      },
      inject: [ConfigService],
    },
  ],
  exports: [StorageService, SupabaseClient],
})
export class StorageModule {}
