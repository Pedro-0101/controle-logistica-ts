import {
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity.js';

@Entity('user_notification_preferences')
@Index('UQ_user_notification_preferences_user_event', ['userId', 'eventType'], {
  unique: true,
})
export class UserNotificationPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  @ForeignKey(() => User, { name: 'FK_user_notification_preferences_user', onDelete: 'CASCADE' })
  userId: string;

  @Column()
  eventType: string;

  @Column({ type: 'boolean', nullable: true })
  enabled: boolean | null;

  @Column({ type: 'jsonb', nullable: true })
  filters: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
