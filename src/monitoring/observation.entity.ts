import { Column, Entity, ForeignKey, Index, PrimaryColumn } from 'typeorm';
import { Camera } from '../camera/entities/camera.entity.js';
import { Point } from '../point/entities/point.entity.js';
import { Company } from '../company/entities/company.entity.js';
@Entity('camera_observations')
@Index(['companyId', 'cameraId'])
export class CameraObservation {
  @PrimaryColumn('uuid') id: string;
  @Column('uuid') @ForeignKey(() => Camera, { name: 'FK_observations_camera', onDelete: 'RESTRICT' }) cameraId: string;
  @Column('uuid') @ForeignKey(() => Point, { name: 'FK_observations_point', onDelete: 'RESTRICT' }) pointId: string;
  @Column('uuid') @ForeignKey(() => Company, { name: 'FK_observations_company', onDelete: 'RESTRICT' }) companyId: string;
  @Column() plate: string;
  @Column('double precision') confidence: number;
  @Column('timestamptz') capturedAt: Date;
  @Column('timestamptz') lastSeenAt: Date;
  @Column('timestamptz') expiresAt: Date;

}
