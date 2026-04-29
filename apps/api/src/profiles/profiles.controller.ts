import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator";
import { ActiveSubscriptionGuard } from "../auth/guards/active-subscription.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthUser } from "../auth/types/auth-user";
import { CreateProfilePhotoDto } from "./dto/create-profile-photo.dto";
import { PresignProfilePhotoDto } from "./dto/presign-profile-photo.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ProfilesService } from "./profiles.service";

@ApiTags("profiles")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveSubscriptionGuard)
@Controller("profiles")
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get("me")
  getMyProfile(@CurrentUser() user: AuthUser) {
    return this.profilesService.getMyProfile(user.id);
  }

  @Put("me")
  updateMyProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.profilesService.updateMyProfile(user.id, dto);
  }

  @Post("photos/presign")
  createPhotoUpload(@CurrentUser() user: AuthUser, @Body() dto: PresignProfilePhotoDto) {
    return this.profilesService.createPhotoUpload(user.id, dto);
  }

  @Post("photos")
  registerPhoto(@CurrentUser() user: AuthUser, @Body() dto: CreateProfilePhotoDto) {
    return this.profilesService.registerPhoto(user.id, dto);
  }

  @Delete("photos/:photoId")
  deletePhoto(@CurrentUser() user: AuthUser, @Param("photoId") photoId: string) {
    return this.profilesService.deletePhoto(user.id, photoId);
  }
}
