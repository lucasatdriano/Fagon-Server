import {
  Controller,
  Get,
  Post,
  UseInterceptors,
  Param,
  Delete,
  ParseUUIDPipe,
  Body,
  Patch,
  UploadedFiles,
  BadRequestException,
  Query,
  Put,
  Logger,
  Req,
} from '@nestjs/common';
import {
  AnyFilesInterceptor,
  FilesInterceptor,
} from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import {
  CurrentUser,
  RequireAuth,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '../../common/constants/roles.constant';
import { PhotoService } from './photos.service';
import { PhotoResponseDto } from './dto/response-photo.dto';
import { UpdatePhotoDto } from './dto/update-photo.dto';
import { StorageService } from '../../storage/storage.service';
import { JwtPayload } from '../../common/interfaces/jwt.payload.interface';
import { RotatePhotoDto } from './dto/rotate-photo.dto';
import multer from 'multer';

@ApiTags('Photos')
@ApiBearerAuth()
@RequireAuth()
@Roles(ROLES.ADMIN, ROLES.FUNCIONARIO, ROLES.VISTORIADOR)
@Controller('photos')
export class PhotoController {
  private readonly logger = new Logger(PhotoController.name);

  constructor(
    private readonly photoService: PhotoService,
    private readonly storageService: StorageService,
  ) {}

  @Post('upload/:locationId')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: multer.memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
      fileFilter: (req, file, cb) => {
        // Aceita todas as imagens
        if (file.mimetype.startsWith('image/')) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Apenas imagens são permitidas'), false);
        }
      },
    }),
  )
  async uploadPhotos(
    @UploadedFiles() files: Express.Multer.File[],
    @Param('locationId') locationId: string,
  ) {
    this.logger.log(
      `📤 Iniciando upload de fotos para location: ${locationId}`,
    );
    this.logger.debug(`Número de arquivos recebidos: ${files?.length || 0}`);

    if (files && files.length > 0) {
      this.logger.debug('Detalhes dos arquivos recebidos:');
      files.forEach((file, index) => {
        this.logger.debug(`Arquivo ${index + 1}:`, {
          fieldname: file.fieldname,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          bufferLength: file.buffer?.length || 0,
        });
      });
    }

    if (!files || files.length === 0) {
      this.logger.warn('❌ Nenhum arquivo recebido no upload');
      throw new BadRequestException('Nenhum arquivo enviado');
    }

    try {
      const result = await this.photoService.uploadPhotos(files, locationId);
      this.logger.log(
        `✅ Upload concluído com sucesso. ${files.length} fotos processadas`,
      );
      return result;
    } catch (error) {
      this.logger.error('❌ Erro no upload de fotos:', error);
      throw error;
    }
  }

  @Get('location/:locationId')
  @ApiOperation({ summary: 'Lista fotos de uma localização' })
  @ApiResponse({
    status: 200,
    type: [PhotoResponseDto],
    description: 'Lista de fotos',
  })
  async getPhotosByLocation(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query('signed') signed: string,
  ) {
    return this.photoService.getPhotosByLocation(locationId, signed === 'true');
  }

  @Patch(':id')
  @Roles(ROLES.ADMIN, ROLES.FUNCIONARIO)
  @ApiOperation({ summary: 'Atualiza status de seleção para PDF' })
  @ApiResponse({
    status: 200,
    type: PhotoResponseDto,
    description: 'Foto atualizada',
  })
  async updatePhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updatePhotoDto: UpdatePhotoDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.photoService.updatePhoto(
      id,
      updatePhotoDto.selectedForPdf,
      currentUser,
    );
  }

  @Get(':id/signed-url')
  @ApiOperation({ summary: 'Obtém URL assinada para uma foto' })
  @ApiResponse({
    status: 200,
    description: 'URL assinada gerada com sucesso',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
      },
    },
  })
  async getSignedUrl(@Param('id', ParseUUIDPipe) id: string) {
    const photo = await this.photoService.getPhotoById(id);
    const signedUrl = await this.storageService.getSignedUrl(photo.filePath);
    return { url: signedUrl };
  }

  @Put(':id/rotate')
  @Roles(ROLES.ADMIN, ROLES.FUNCIONARIO)
  @ApiOperation({ summary: 'Rotaciona uma foto' })
  @ApiResponse({
    status: 200,
    type: PhotoResponseDto,
    description: 'Foto rotacionada com sucesso',
  })
  async rotatePhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() rotatePhotoDto: RotatePhotoDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.photoService.rotatePhoto(
      id,
      rotatePhotoDto.rotation,
      currentUser,
    );
  }

  @Delete(':id')
  @Roles(ROLES.ADMIN, ROLES.FUNCIONARIO)
  @ApiOperation({ summary: 'Remove uma foto' })
  @ApiResponse({
    status: 200,
    description: 'Foto removida com sucesso',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  async deletePhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.photoService.deletePhoto(id, currentUser);
  }

  @Post('debug-upload/:locationId')
  @UseInterceptors(AnyFilesInterceptor())
  @ApiOperation({ summary: 'Debug endpoint para upload' })
  debugUpload(
    @UploadedFiles() files: Express.Multer.File[],
    @Param('locationId') locationId: string,
    @Req() req: Request,
  ) {
    this.logger.log('=== DEBUG UPLOAD START ===');

    // Log dos arquivos recebidos
    this.logger.log(`📁 Total de arquivos: ${files?.length || 0}`);

    if (files && files.length > 0) {
      files.forEach((file, index) => {
        this.logger.log(`📸 Arquivo ${index + 1}:`, {
          fieldname: file.fieldname, // ← NOME DO CAMPO QUE CHEGOU
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
        });
      });
    } else {
      this.logger.warn('⚠️ Nenhum arquivo recebido via @UploadedFiles()');

      // Verificar se chegou em req.files
      const reqFiles = (req as any).files;
      if (reqFiles) {
        this.logger.log('🔍 Arquivos em req.files:', reqFiles);
      }

      // Verificar req.body
      this.logger.log('🔍 req.body:', req.body);
    }

    this.logger.log('=== DEBUG UPLOAD END ===');

    return {
      success: true,
      message: 'Debug recebido',
      fileCount: files?.length || 0,
      fieldNames: files?.map((f) => f.fieldname) || [],
      locationId,
    };
  }
}
