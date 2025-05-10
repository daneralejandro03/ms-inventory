import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ProvisionService } from './provision.service';
import { CreateProvisionDto } from './dto/create-provision.dto';
import { UpdateProvisionDto } from './dto/update-provision.dto';

@Controller('provision')
export class ProvisionController {
  constructor(private readonly provisionService: ProvisionService) {}

  @Post()
  create(@Body() createProvisionDto: CreateProvisionDto) {
    return this.provisionService.create(createProvisionDto);
  }

  @Get()
  findAll() {
    return this.provisionService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.provisionService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateProvisionDto: UpdateProvisionDto) {
    return this.provisionService.update(+id, updateProvisionDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.provisionService.remove(+id);
  }
}
