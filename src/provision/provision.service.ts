import { Injectable } from '@nestjs/common';
import { CreateProvisionDto } from './dto/create-provision.dto';
import { UpdateProvisionDto } from './dto/update-provision.dto';

@Injectable()
export class ProvisionService {
  create(createProvisionDto: CreateProvisionDto) {
    return 'This action adds a new provision';
  }

  findAll() {
    return `This action returns all provision`;
  }

  findOne(id: number) {
    return `This action returns a #${id} provision`;
  }

  update(id: number, updateProvisionDto: UpdateProvisionDto) {
    return `This action updates a #${id} provision`;
  }

  remove(id: number) {
    return `This action removes a #${id} provision`;
  }
}
