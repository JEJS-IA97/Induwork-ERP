import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/constants/roles.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/express';
import { TENANT_HEADER } from '../../common/constants/tenants.constant';

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@ApiHeader({
  name: TENANT_HEADER,
  required: false,
  description: 'Identificador del tenant',
})
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('my-notifications')
  @ApiOperation({ summary: 'Obtener notificaciones del usuario actual' })
  @ApiResponse({ status: 200, description: 'Listado de notificaciones.' })
  async findMyNotifications(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.findMyNotifications(user.id, user.tenantId);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Marcar notificación como leída' })
  @ApiResponse({ status: 200, description: 'Notificación marcada como leída.' })
  async markAsRead(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notificationsService.markAsRead(id, user.id, user.tenantId);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Crear notificación para un usuario (Solo ADMIN)' })
  @ApiResponse({ status: 201, description: 'Notificación creada exitosamente.' })
  async create(
    @Body() createNotificationDto: CreateNotificationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notificationsService.create(createNotificationDto, user.tenantId);
  }
}
