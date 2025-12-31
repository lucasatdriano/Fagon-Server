import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsIn } from 'class-validator';

export class RotatePathologyPhotoDto {
  @ApiProperty({
    description: 'Ângulo de rotação (múltiplo de 90)',
    example: 90,
    enum: [0, 90, 180, 270, -90, -180, -270],
  })
  @IsNumber()
  @IsIn([0, 90, 180, 270, -90, -180, -270])
  rotation!: number;
}
