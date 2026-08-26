import { Module } from '@nestjs/common';
import { SpecialistsController } from './specialists.controller';
import { SpecialistsService } from './specialists.service';
import { MySpecialistController } from './my-specialist.controller';
import { MySpecialistService } from './my-specialist.service';

@Module({
  controllers: [SpecialistsController, MySpecialistController],
  providers: [SpecialistsService, MySpecialistService],
  exports: [SpecialistsService, MySpecialistService],
})
export class SpecialistsModule {}
