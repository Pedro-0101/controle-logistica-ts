import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { UserModule } from './user/user.module.js';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyModule } from './company/company.module.js';
import { AdminUnityModule } from './admin-unity/admin-unity.module.js';
import { VehicleModule } from './vehicle/vehicle.module.js';
import { MovementModule } from './movement/movement.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CameraModule } from './camera/camera.module.js';
import { AnprModule } from './anpr/anpr.module.js';
import { PointModule } from './point/point.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ObserveModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        appKey: configService.get<string>('OBS_KEY') ?? '',
        appSecret: configService.get<string>('OBS_SECRET') ?? '',
        serviceId: 'controle-logistica-ts',
      }),
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT'),
        username: configService.get<string>('DB_USERNAME'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_DATABASE'),
        autoLoadEntities: true,
        synchronize: true,
      }),
    }),
    UserModule,
    CompanyModule,
    AdminUnityModule,
    VehicleModule,
    MovementModule,
    AuthModule,
    CameraModule,
    AnprModule,
    PointModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
