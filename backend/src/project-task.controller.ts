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
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "./auth.guard";
import type { AuthenticatedRequest } from "./auth.types";
import {
  CreateProjectDto,
  CreateTaskDto,
  ListProjectQueryDto,
  ListTaskQueryDto,
  UpdateProjectDto,
  UpdateTaskDto,
} from "./project-task.dto";
import { ProjectTaskService } from "./project-task.service";

@Controller()
@UseGuards(AuthGuard)
export class ProjectTaskController {
  constructor(private readonly projectTaskService: ProjectTaskService) {}

  @Get("workspaces/:workspaceId/projects")
  async listProjects(
    @Param("workspaceId") workspaceId: string,
    @Query() query: ListProjectQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      projects: await this.projectTaskService.listProjects(
        workspaceId,
        query,
        request.currentUser,
      ),
    };
  }

  @Post("workspaces/:workspaceId/projects")
  @HttpCode(HttpStatus.CREATED)
  async createProject(
    @Param("workspaceId") workspaceId: string,
    @Body() body: CreateProjectDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      project: await this.projectTaskService.createProject(
        workspaceId,
        body,
        request.currentUser,
      ),
    };
  }

  @Get("projects/:projectId")
  async getProject(
    @Param("projectId") projectId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return { project: await this.projectTaskService.getProject(projectId, request.currentUser) };
  }

  @Patch("projects/:projectId")
  async updateProject(
    @Param("projectId") projectId: string,
    @Body() body: UpdateProjectDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      project: await this.projectTaskService.updateProject(projectId, body, request.currentUser),
    };
  }

  @Post("projects/:projectId/archive")
  async archiveProject(
    @Param("projectId") projectId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return { result: await this.projectTaskService.archiveProject(projectId, request.currentUser) };
  }

  @Get("projects/:projectId/summary")
  async projectSummary(
    @Param("projectId") projectId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return { summary: await this.projectTaskService.projectSummary(projectId, request.currentUser) };
  }

  @Get("projects/:projectId/tasks")
  async listTasks(
    @Param("projectId") projectId: string,
    @Query() query: ListTaskQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.projectTaskService.listTasks(projectId, query, request.currentUser);
  }

  @Post("projects/:projectId/tasks")
  @HttpCode(HttpStatus.CREATED)
  async createTask(
    @Param("projectId") projectId: string,
    @Body() body: CreateTaskDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return { task: await this.projectTaskService.createTask(projectId, body, request.currentUser) };
  }

  @Get("tasks/:taskId")
  async getTask(@Param("taskId") taskId: string, @Req() request: AuthenticatedRequest) {
    return { task: await this.projectTaskService.getTask(taskId, request.currentUser) };
  }

  @Patch("tasks/:taskId")
  async updateTask(
    @Param("taskId") taskId: string,
    @Body() body: UpdateTaskDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return { task: await this.projectTaskService.updateTask(taskId, body, request.currentUser) };
  }

  @Delete("tasks/:taskId")
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteTask(@Param("taskId") taskId: string, @Req() request: AuthenticatedRequest) {
    return this.projectTaskService.deleteTask(taskId, request.currentUser);
  }
}
