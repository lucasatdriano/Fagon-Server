// src/modules/photos/dto/upload-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class UploadResponseDto {
  @ApiProperty({
    description: 'ID do processo para tracking',
    example: '1765924301050',
  })
  processId: string;

  @ApiProperty({
    description: 'Mensagem de status',
    example: 'Upload recebido. Processando 7 fotos em background...',
  })
  message: string;

  @ApiProperty({
    description: 'Número de arquivos recebidos',
    example: 7,
  })
  fileCount: number;

  @ApiProperty({
    description: 'ID da localização',
    example: 'ed944da1-0364-402f-9a3c-b499c85ca066',
  })
  locationId: string;

  @ApiProperty({
    description: 'Tempo estimado de processamento',
    example: '14 segundos',
  })
  estimatedTime: string;

  @ApiProperty({
    description: 'Status do processamento',
    example: 'processing',
    enum: ['processing', 'completed', 'failed'],
  })
  status: string;

  constructor(
    processId: string,
    message: string,
    fileCount: number,
    locationId: string,
  ) {
    this.processId = processId;
    this.message = message;
    this.fileCount = fileCount;
    this.locationId = locationId;
    this.estimatedTime = `${fileCount * 2} segundos`;
    this.status = 'processing';
  }
}
