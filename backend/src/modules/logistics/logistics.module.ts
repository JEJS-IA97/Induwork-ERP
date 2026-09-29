import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { DispatchGuideService } from './services/dispatch-guide.service';
import { StockTransfersService } from './services/stock-transfers.service';
import { LogisticsController } from './logistics.controller';

@Module({
  imports: [PrismaModule],
  controllers: [LogisticsController],
  providers: [DispatchGuideService, StockTransfersService],
  exports: [DispatchGuideService, StockTransfersService],
})
export class LogisticsModule {}
