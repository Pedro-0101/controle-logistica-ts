import {
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity.js';
import { Company } from '../../company/entities/company.entity.js';
import { Point } from '../../point/entities/point.entity.js';
import { Camera } from '../../camera/entities/camera.entity.js';
import type { NotificationSeverity } from '../notification-events.js';

@Entity('notifications')
@Index('IDX_notifications_user_read_created', ['userId', 'readAt', 'createdAt'])
@Index('IDX_notifications_company_event_created', ['companyId', 'eventType', 'createdAt'])
@Index('IDX_notifications_company_dedupe', ['companyId', 'dedupeKey', 'createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { nullable: true })
  @ForeignKey(() => Company, { name: 'FK_notifications_company', onDelete: 'CASCADE' })
  companyId: string | null;

  @Column('uuid')
  @ForeignKey(() => User, { name: 'FK_notifications_user', onDelete: 'CASCADE' })
  userId: string;

  @Column()
  eventType: string;

  @Column({ default: 'info' })
  severity: NotificationSeverity;

  @Column()
  title: string;

  @Column('text')
  body: string;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  payload: Record<string, unknown>;

  @Column({ type: 'varchar', nullable: true })
  resourceType: string | null;

  @Column('uuid', { nullable: true })
  resourceId: string | null;

  @Column('uuid', { nullable: true })
  @ForeignKey(() => Point, { name: 'FK_notifications_point', onDelete: 'SET NULL' })
  pointId: string | null;

  @Column('uuid', { nullable: true })
  @ForeignKey(() => Camera, { name: 'FK_notifications_camera', onDelete: 'SET NULL' })
  cameraId: string | null;

  @Column({ type: 'varchar', nullable: true })
  dedupeKey: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
