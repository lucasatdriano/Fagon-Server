// src/modules/photos/dto/upload-status-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';

class ProcessResultDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  filePath!: string;

  @ApiProperty()
  photoNumber!: number;

  @ApiProperty()
  locationName!: string;

  @ApiProperty()
  sizeKB!: number;
}

class ProcessErrorDto {
  @ApiProperty()
  photoIndex!: number;

  @ApiProperty()
  fileName!: string;

  @ApiProperty()
  error!: string;
}

class ProgressDto {
  @ApiProperty()
  completed!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  percentage!: number;
}

export class UploadStatusResponseDto {
  @ApiProperty()
  processId!: string;

  @ApiProperty({ enum: ['processing', 'completed', 'failed'] })
  status!: string;

  @ApiProperty()
  message!: string;

  @ApiProperty({ type: ProgressDto })
  progress!: ProgressDto;

  @ApiProperty({ type: [ProcessResultDto] })
  results!: ProcessResultDto[];

  @ApiProperty({ type: [ProcessErrorDto] })
  errors!: ProcessErrorDto[];

  @ApiProperty()
  startTime!: Date;

  @ApiProperty({ required: false })
  endTime?: Date;

  @ApiProperty({ required: false })
  durationMs?: number;
}
