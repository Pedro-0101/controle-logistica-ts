import {
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../company/entities/company.entity.js';

@Entity('company_notification_settings')
@Index('UQ_company_notification_settings_company_event', ['companyId', 'eventType'], {
  unique: true,
})
export class CompanyNotificationSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  @ForeignKey(() => Company, { name: 'FK_company_notification_settings_company', onDelete: 'CASCADE' })
  companyId: string;

  @Column()
  eventType: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'jsonb', nullable: true })
  defaultFilters: Record<string, unknown> | null;

  @Column({ type: 'boolean', default: true })
  allowUserOverride: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
