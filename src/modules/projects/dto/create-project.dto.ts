import { ApiProperty } from '@nestjs/swagger';
import {
  IsUUID,
  IsEnum,
  IsNumber,
  IsArray,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { ProjectType } from '@prisma/client';
import { Expose, Type } from 'class-transformer';
import { PavementItemDto } from '../../../modules/pavements/dto/item-pavement.dto';

export class CreateProjectDto {
  @Expose()
  @ApiProperty({ enum: ProjectType })
  @IsEnum(ProjectType)
  projectType!: ProjectType;

  @Expose()
  @ApiProperty()
  @IsNumber()
  upeCode!: number;

  @Expose()
  @ApiProperty({ type: [PavementItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PavementItemDto)
  pavements!: PavementItemDto[];

  @Expose()
  @ApiProperty()
  @IsUUID()
  agencyId!: string;

  @Expose()
  @ApiProperty()
  @IsUUID()
  engineerId!: string;
}
