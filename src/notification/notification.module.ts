import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity.js';
import { CompanyNotificationSetting } from './entities/company-notification-setting.entity.js';
import { UserNotificationPreference } from './entities/user-notification-preference.entity.js';
import { User } from '../user/entities/user.entity.js';
import { Point } from '../point/entities/point.entity.js';
import { Camera } from '../camera/entities/camera.entity.js';
import { NotificationController } from './notification.controller.js';
import { NotificationService } from './notification.service.js';
import { NotificationEventsService } from './notification-events.service.js';
import { NotificationDispatchService } from './notification-dispatch.service.js';
import { NotificationRetentionService } from './notification-retention.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      CompanyNotificationSetting,
      UserNotificationPreference,
      User,
      Point,
      Camera,
    ]),
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationEventsService,
    NotificationDispatchService,
    NotificationRetentionService,
  ],
  exports: [NotificationEventsService, NotificationService],
})
export class NotificationModule {}
