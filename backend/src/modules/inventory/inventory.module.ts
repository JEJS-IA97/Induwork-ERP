import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { InventoryService } from './inventory.service';
import { BomService } from './services/bom.service';
import { LotSerialService } from './services/lot-serial.service';
import { InventoryController } from './inventory.controller';

@Module({
  imports: [PrismaModule],
  controllers: [InventoryController],
  providers: [
    InventoryService,
    BomService,
    LotSerialService,
  ],
  exports: [
    InventoryService,
    BomService,
    LotSerialService,
  ],
})
export class InventoryModule {}
