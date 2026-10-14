import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "./auth.guard";
import type { AuthenticatedRequest } from "./auth.types";
import {
  AcceptInvitationDto,
  CreateInvitationDto,
  CreateWorkspaceDto,
  UpdateMemberRoleDto,
  UpdateWorkspaceDto,
} from "./workspace.dto";
import { WorkspaceService } from "./workspace.service";

@Controller("workspaces")
@UseGuards(AuthGuard)
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get()
  async list(@Req() request: AuthenticatedRequest) {
    return { workspaces: await this.workspaceService.list(request.currentUser) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreateWorkspaceDto, @Req() request: AuthenticatedRequest) {
    return { workspace: await this.workspaceService.create(body.name, request.currentUser) };
  }

  @Post("invitations/accept")
  async acceptInvitation(
    @Body() body: AcceptInvitationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return { workspace: await this.workspaceService.acceptInvitation(body.token, request.currentUser) };
  }

  @Get(":workspaceId")
  async get(@Param("workspaceId") workspaceId: string, @Req() request: AuthenticatedRequest) {
    return { workspace: await this.workspaceService.get(workspaceId, request.currentUser) };
  }

  @Patch(":workspaceId")
  async update(
    @Param("workspaceId") workspaceId: string,
    @Body() body: UpdateWorkspaceDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return { workspace: await this.workspaceService.update(workspaceId, body.name, request.currentUser) };
  }

  @Delete(":workspaceId")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("workspaceId") workspaceId: string, @Req() request: AuthenticatedRequest) {
    return this.workspaceService.remove(workspaceId, request.currentUser);
  }

  @Get(":workspaceId/members")
  async listMembers(
    @Param("workspaceId") workspaceId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return { members: await this.workspaceService.listMembers(workspaceId, request.currentUser) };
  }

  @Patch(":workspaceId/members/:memberId")
  @HttpCode(HttpStatus.NO_CONTENT)
  updateMemberRole(
    @Param("workspaceId") workspaceId: string,
    @Param("memberId") memberId: string,
    @Body() body: UpdateMemberRoleDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.workspaceService.updateMemberRole(
      workspaceId,
      memberId,
      body.role,
      request.currentUser,
    );
  }

  @Delete(":workspaceId/members/:memberId")
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @Param("workspaceId") workspaceId: string,
    @Param("memberId") memberId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.workspaceService.removeMember(workspaceId, memberId, request.currentUser);
  }

  @Post(":workspaceId/invitations")
  @HttpCode(HttpStatus.CREATED)
  async createInvitation(
    @Param("workspaceId") workspaceId: string,
    @Body() body: CreateInvitationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      invitation: await this.workspaceService.createInvitation(
        workspaceId,
        body.email,
        body.role,
        request.currentUser,
      ),
    };
  }
}
