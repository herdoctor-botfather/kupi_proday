import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard, OptionalJwtAuthGuard, RolesGuard } from '../common/guards';
import { config } from '../config';

@Global()
@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: config.JWT_SECRET,
      signOptions: { expiresIn: config.JWT_EXPIRES_IN },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, OptionalJwtAuthGuard, RolesGuard],
  exports: [AuthService, JwtAuthGuard, OptionalJwtAuthGuard, RolesGuard],
})
export class AuthModule {}
