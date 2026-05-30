import { Injectable, CanActivate, ExecutionContext, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as admin from 'firebase-admin';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AppException, ERR } from '../errors/app-exception';
import { FIREBASE_ADMIN } from '../firebase/firebase.module';
import { AuthUser } from '../types/auth-user';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(FIREBASE_ADMIN) private readonly firebaseAdmin: admin.app.App,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = this.extractBearer(request);

    if (!token) {
      throw new AppException(ERR.INVALID_TOKEN as string);
    }

    try {
      const decoded = await this.firebaseAdmin.auth().verifyIdToken(token, true);
      const user: AuthUser = {
        uid: decoded.uid,
        email: decoded.email ?? '',
        name: decoded.name ?? '',
        picture: decoded.picture ?? '',
      };
      request.user = user;
      return true;
    } catch (error: any) {
      throw new AppException(ERR.INVALID_TOKEN as string, error.message);
    }
  }

  private extractBearer(req: any): string | null {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7).trim() || null;
  }
}
