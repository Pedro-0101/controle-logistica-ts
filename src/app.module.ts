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
import { MonitoringModule } from './monitoring/monitoring.module.js';
import { APP_FILTER } from '@nestjs/core';
import { DatabaseErrorFilter } from './common/database-error.filter.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ...(process.env.NODE_ENV === 'test' ? [] : [ObserveModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        appKey: configService.get<string>('OBS_KEY') ?? '',
        appSecret: configService.get<string>('OBS_SECRET') ?? '',
        serviceId: 'controle-logistica-ts',
        http: {
          ignore: (req: { url?: string }) => req.url?.startsWith('/anpr') ?? false,
        },
      }),
    })]),
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
        synchronize: configService.get<string>('DB_SYNCHRONIZE') === 'true',
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
    MonitoringModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_FILTER, useClass: DatabaseErrorFilter }],
})
export class AppModule {}
