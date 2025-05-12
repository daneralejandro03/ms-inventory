import {
  Controller, Post, UploadedFile, UseInterceptors, BadRequestException, UseGuards, Req
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import * as multer from 'multer';
import { CsvService } from './csv.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('csv')
export class CsvController {
  constructor(private readonly csvService: CsvService) { }

  @Post('uploadDepartamentsAndCitys')
  @UseInterceptors(FileInterceptor('file', { storage: multer.memoryStorage() }))
  async uploadCsvDepartamentsAndCitys(@UploadedFile() file: Express.Multer.File): Promise<{ message: string }> {
    if (!file || !Buffer.isBuffer(file.buffer)) {
      throw new BadRequestException('Archivo inválido o buffer ausente');
    } const buffer = file.buffer;
    await this.csvService.uploadDepartamentsAndCitys(buffer);
    return { message: 'CSV procesado con éxito' };
  }

  @UseGuards(JwtAuthGuard)
  @Post('processCsvInventory')
  @UseInterceptors(FileInterceptor('file', { storage: multer.memoryStorage() }))
  async processCsvInventory(@UploadedFile() file: Express.Multer.File, @Req() req: Request,): Promise<{ message: string; }> {
    if (!file || !Buffer.isBuffer(file.buffer)) {
      throw new BadRequestException('Archivo inválido o buffer ausente');
    }

    const token = req.headers.authorization;
    if (!token) {
      throw new BadRequestException('Token de autorización no proporcionado');
    }
    await this.csvService.processCsvInventory(file.buffer, token);

    return {
      message: 'CSV procesado con éxito',
    };
  }
}
