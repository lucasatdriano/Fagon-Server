import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { Request } from 'express';

export const CurrentUser = createParamDecorator<string | undefined>(
  (field, ctx: ExecutionContext): unknown => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = request.user;

    if (!user) {
      throw new Error(
        'CurrentUser decorator used without authentication. Did you add the AuthGuard?',
      );
    }

    return field ? user[field] : user;
  },
);

export const RequireAuth = () => SetMetadata('requireAuth', true);
