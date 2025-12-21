import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsString, IsNotEmpty, IsBoolean } from 'class-validator';

export class CreateStateLawDto {
  @Expose()
  @ApiProperty({
    description: 'Nome do estado',
    example: 'São Paulo',
  })
  @IsString()
  @IsNotEmpty()
  state!: string;

  @Expose()
  @ApiProperty({
    description: 'Nome do estado seguido de sua preposição',
    example: 'de São Paulo',
  })
  @IsString()
  @IsNotEmpty()
  stateName!: string;

  @Expose()
  @ApiProperty({
    description: 'Nome do estado normalizado (sem acentos e em minúsculas)',
    example: 'sao paulo',
  })
  @IsString()
  @IsNotEmpty()
  stateNormalized!: string;

  @Expose()
  @ApiProperty({
    description: 'Referência da lei 1',
    example: 'Lei Estadual Nº 12.345/2020',
  })
  @IsString()
  @IsNotEmpty()
  primaryLawReference!: string;

  @Expose()
  @ApiProperty({
    description: 'Referência da lei 2',
    example: 'Lei Estadual Nº 67.890/2021',
  })
  @IsString()
  secondaryLawReference!: string;

  @Expose()
  @ApiProperty({
    description: 'Referência da Lei complementar',
    example: 'Lei Estadual Nº 74.890/2020',
  })
  @IsString()
  @IsNotEmpty()
  complementaryLawReference!: string;

  @Expose()
  @ApiProperty({
    description: 'Abreviatura do bombeiro estadual',
    example: 'CBMSP',
  })
  @IsString()
  @IsNotEmpty()
  stateFireAbbreviation!: string;

  @Expose()
  @ApiProperty({
    description: 'Texto completo da lei 1',
    required: false,
  })
  @IsString()
  primaryLawFullText?: string;

  @Expose()
  @ApiProperty({
    description: 'Texto completo da lei 2',
    required: false,
  })
  @IsString()
  secondaryLawFullText?: string;

  @Expose()
  @ApiProperty({
    description: 'Texto completo da lei complementar',
    required: false,
  })
  @IsString()
  complementaryLawFullText?: string;

  @Expose()
  @ApiProperty({
    default: true,
  })
  @IsBoolean()
  active: boolean = true;
}
