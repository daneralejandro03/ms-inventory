import { Injectable, InternalServerErrorException, BadRequestException } from '@nestjs/common';
import { DataSource, QueryRunner, In } from 'typeorm';
import { Departament } from '../departament/entities/departament.entity';
import { City } from '../city/entities/city.entity';
import { parse } from 'csv-parse/sync';
import { Store } from '../store/entities/store.entity';
import { Category } from '../category/entities/category.entity';
import { Supplier } from '../supplier/entities/supplier.entity';
import { Product } from '../product/entities/product.entity';
import { Inventory } from '../inventory/entities/inventory.entity';
import { Provision } from '../provision/entities/provision.entity';
import { CreateUserDto } from '../user-client/dto/create-user.dto';
import { UserClientService } from '../user-client/user-client.service';
import { RoleClientService } from '../role-client/role-client.service';
import { CsvRow } from './interfaces/csv-row.interface';
import { CsvRecord } from './interfaces/csv-record.interface';

@Injectable()
export class CsvService {
  constructor(

    private readonly dataSource: DataSource,
    private readonly userClient: UserClientService,
    private readonly roleClient: RoleClientService,
  ) { }

  async uploadDepartamentsAndCitys(buffer: Buffer): Promise<void> {
    const qr: QueryRunner = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const text = buffer.toString('utf-8');
      const records: CsvRow[] = parse(text, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as CsvRow[];

      const deptNames = Array.from(new Set(records.map(r => r.DEPARTAMENTO)));
      const existingDepts = await qr.manager.find(Departament, {
        where: { name: In(deptNames) },
      });
      const deptMap = new Map<string, Departament>(
        existingDepts.map(d => [d.name, d]),
      );

      const toCreateDepts = deptNames
        .filter(name => !deptMap.has(name))
        .map(name => qr.manager.create(Departament, { name }));

      if (toCreateDepts.length) {
        const savedDepts = await qr.manager.save(toCreateDepts);
        for (const d of savedDepts) {
          deptMap.set(d.name, d);
        }
      }

      const deptIds = Array.from(deptMap.values()).map(d => d.id);
      const existingCities = await qr.manager.find(City, {
        relations: ['departament'],
        where: { departament: { id: In(deptIds) } },
      });
      const cityMap = new Map<string, City>();
      for (const c of existingCities) {
        cityMap.set(`${c.departament.id}:::${c.name}`, c);
      }

      const toCreateCities: City[] = [];
      for (const row of records) {
        const dept = deptMap.get(row.DEPARTAMENTO)!;
        const key = `${dept.id}:::${row.MUNICIPIO}`;
        if (!cityMap.has(key)) {
          const city = qr.manager.create(City, {
            name: row.MUNICIPIO,
            departament: dept,
          });
          toCreateCities.push(city);
          cityMap.set(key, city);
        }
      }

      if (toCreateCities.length) {
        await qr.manager.save(toCreateCities);
      }

      await qr.commitTransaction();
    } catch (err) {
      await qr.rollbackTransaction();
      throw new InternalServerErrorException('Error al procesar CSV', err);
    } finally {
      await qr.release();
    }
  }


  async processCsvInventory(buffer: Buffer, token: string): Promise<{ stores: number; products: number }> {
    const text = buffer.toString('utf-8');
    const records: CsvRecord[] = parse(text, { delimiter: ';', columns: true, skip_empty_lines: true, trim: true }) as CsvRecord[];

    const qr: QueryRunner = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    let storeCount = 0;
    let prodCount = 0;
    let phase: 'stores' | 'products' = 'stores';

    try {
      for (const row of records) {
        if (row.id_almacen === '' && row.nombre_producto?.startsWith('id_producto')) {
          phase = 'products';
          continue;
        }

        if (phase === 'stores') {
          // 1) Validate city
          const city = await qr.manager.findOne(City, { where: { name: row.ciudad } });
          if (!city) throw new BadRequestException(`Ciudad ${row.ciudad} no encontrada`);

          // 2) Ensure role and create user with role
          const roleId = await this.roleClient.ensureRole('Manager', token);
          const [firstName, ...rest] = row.gerente.split(' ');
          const lastName = rest.join(' ');
          const userDto: CreateUserDto = {
            name: firstName,
            lastName,
            gender: 'Masculino',
            email: row.email,
            password: 'DefaultP@ss123',
            cellPhone: Number(row.telefono),
            landline: 0,
            IDType: 'CC',
            IDNumber: '3145919465',
          };
          console.log('userDto', userDto);
          console.log('roleId', roleId);
          await this.userClient.createUserWithRole(roleId, userDto, token);

          // 3) Save store
          const store = qr.manager.create(Store, {
            name: row.nombre_almacen,
            address: row.direccion,
            postalCode: row.codigo_postal,
            latitude: parseFloat(row.latitud),
            length: parseFloat(row.longitud),
            capacity: parseInt(row.capacidad_m2, 10),
            state: row.estado,
            city,
            userId: row.gerente,
          });
          const saved = await qr.manager.save(store);
          storeCount++;

          await this.userClient.addStoreToUser(row.gerente, saved.id, token);

        } else {
          const cat = await qr.manager.findOne(Category, { where: { name: row.categoria } })
            || qr.manager.create(Category, { name: row.categoria });
          await qr.manager.save(cat);

          const sup = await qr.manager.findOne(Supplier, { where: { name: row.id_proveedor } })
            || qr.manager.create(Supplier, { name: row.id_proveedor });
          await qr.manager.save(sup);

          const product = qr.manager.create(Product, {
            name: row.nombre_producto,
            description: row.descripcion,
            unitPrice: parseFloat(row.precio_unitario!),
            stock: parseInt(row.cantidad_stock!, 10),
            levelReorder: parseInt(row.nivel_reorden!, 10),
            sku: row.sku!,
            barcode: row.codigo_barras!,
            dateEntry: new Date(row.ultima_reposicion!),
            expirationDate: row.fecha_vencimiento ? new Date(row.fecha_vencimiento) : undefined,
            weightKg: parseFloat(row.peso_kg!),
            lengthCm: parseFloat(row.dimensiones_cm!.split('x')[0]),
            widthCm: parseFloat(row.dimensiones_cm!.split('x')[1]),
            heightCm: parseFloat(row.dimensiones_cm!.split('x')[2]),
            isFragile: row.es_fragil === 'true',
            requiresRefurbishment: row.requiere_refrigeracion === 'true',
            status: row.estado,
            category: cat,
          });
          await qr.manager.save(product);
          prodCount++;

          const store = await qr.manager.findOne(Store, { where: { userId: row.gerente } });
          if (store) {
            const inv = qr.manager.create(Inventory, { store, product });
            await qr.manager.save(inv);
            const prov = qr.manager.create(Provision, { supplier: sup, product });
            await qr.manager.save(prov);
          }
        }
      }

      await qr.commitTransaction();
      return { stores: storeCount, products: prodCount };
    } catch (err) {
      await qr.rollbackTransaction();
      throw new InternalServerErrorException('Error al procesar CSV', err);
    } finally {
      await qr.release();
    }
  }

}


