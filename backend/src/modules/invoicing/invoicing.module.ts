import { Module } from '@nestjs/common';
import { InvoicingService } from './invoicing.service';
import { InvoicingController } from './invoicing.controller';
import { DteService } from './services/dte.service';
import { PdfService } from './services/pdf.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [InvoicingController],
  providers: [InvoicingService, DteService, PdfService],
  exports: [InvoicingService, DteService, PdfService],
})
export class InvoicingModule {}
