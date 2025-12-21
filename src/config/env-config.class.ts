import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsBoolean,
  IsArray,
} from 'class-validator';
import { Transform } from 'class-transformer';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvConfig {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  @IsOptional()
  RENDER = false;

  @IsString()
  @IsOptional()
  PUPPETEER_EXECUTABLE_PATH?: string;

  @IsNumber()
  @Transform(({ value }: { value: string }) => parseInt(value, 10))
  PORT = 3000;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  JWT_SECRET!: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN = '1d';

  @IsArray()
  @Transform(({ value }: { value: string }) =>
    value ? value.split(',').map((email) => email.trim()) : [],
  )
  @IsOptional()
  ADMIN_EMAILS: string[] = [];

  @IsString()
  EMPLOYEES_PASSWORD!: string;

  @IsString()
  REDIS_HOST!: string;

  @IsNumber()
  @Transform(({ value }: { value: string }) => parseInt(value, 10))
  REDIS_PORT = 6379;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string;

  @IsString()
  @IsOptional()
  REDIS_USER?: string;

  @IsString()
  @IsOptional()
  REDIS_URL?: string;

  @IsString()
  @IsOptional()
  REDIS_PREFIX = 'fagon:';

  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  @IsOptional()
  REDIS_TLS = false;

  @IsNumber()
  @Transform(({ value }: { value: string }) => parseInt(value, 10))
  @IsOptional()
  REDIS_DEFAULT_TTL = 60 * 60 * 24; // 24h

  @IsString()
  API_URL!: string;

  @IsString()
  APP_URL!: string;

  @IsString()
  MAIL_HOST!: string;

  @IsNumber()
  @Transform(({ value }: { value: string }) => parseInt(value, 10))
  MAIL_PORT!: number;

  @IsString()
  MAIL_USER!: string;

  @IsString()
  MAIL_PASSWORD!: string;

  @IsString()
  MAIL_FROM_NAME!: string;

  @IsString()
  MAIL_FROM_ADDRESS!: string;

  @IsString()
  SUPABASE_URL!: string;

  @IsString()
  SUPABASE_SERVICE_ROLE_KEY!: string;

  @IsString()
  SUPABASE_STORAGE_BUCKET!: string;

  @IsString()
  @IsOptional()
  LOG_LEVEL = 'info';

  @IsNumber()
  @Transform(({ value }: { value: string }) => parseInt(value, 10))
  @IsOptional()
  THROTTLE_TTL_DEFAULT = 60;

  @IsNumber()
  @Transform(({ value }: { value: string }) => parseInt(value, 10))
  @IsOptional()
  THROTTLE_LIMIT_DEFAULT = 100;

  @IsNumber()
  @Transform(({ value }: { value: string }) => parseInt(value, 10))
  @IsOptional()
  THROTTLE_TTL_STRICT = 1;

  @IsNumber()
  @Transform(({ value }: { value: string }) => parseInt(value, 10))
  @IsOptional()
  THROTTLE_LIMIT_STRICT = 5;

  @IsString()
  @IsOptional()
  FEATURE_FLAGS?: string;

  @IsNumber()
  @Transform(({ value }: { value: string }) => parseInt(value, 10))
  @IsOptional()
  CACHE_TTL = 5;

  @IsNumber()
  @Transform(({ value }: { value: string }) => parseInt(value, 10))
  @IsOptional()
  CACHE_MAX_ITEMS = 100;

  @IsString()
  @IsOptional()
  CACHE_STORE = 'memory';
}
