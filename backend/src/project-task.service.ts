import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, TaskActivityType, TaskPriority, TaskStatus, WorkspaceRole } from "@prisma/client";
import type { AuthenticatedUser } from "./auth.types";
import type {
  CreateProjectDto,
  CreateTaskDto,
  ListProjectQueryDto,
  ListTaskQueryDto,
  UpdateProjectDto,
  UpdateTaskDto,
} from "./project-task.dto";
import { PrismaService } from "./prisma.service";

const taskDetails = {
  assignee: { include: { user: { select: { id: true, name: true, email: true } } } },
  creator: { include: { user: { select: { id: true, name: true, email: true } } } },
} satisfies Prisma.TaskInclude;
const taskCollaborationDetails = {
  ...taskDetails,
  comments: {
    include: { author: { include: { user: { select: { id: true, name: true } } } } },
    orderBy: { createdAt: "asc" },
  },
  activities: {
    include: { actor: { include: { user: { select: { id: true, name: true } } } } },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.TaskInclude;

const allowedTransitions: Record<TaskStatus, readonly TaskStatus[]> = {
  [TaskStatus.TODO]: [TaskStatus.TODO, TaskStatus.IN_PROGRESS],
  [TaskStatus.IN_PROGRESS]: [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.REVIEW],
  [TaskStatus.REVIEW]: [TaskStatus.IN_PROGRESS, TaskStatus.REVIEW, TaskStatus.DONE],
  [TaskStatus.DONE]: [TaskStatus.REVIEW, TaskStatus.DONE],
};

@Injectable()
export class ProjectTaskService {
  constructor(private readonly prisma: PrismaService) {}

  async listProjects(workspaceId: string, query: ListProjectQueryDto, user: AuthenticatedUser) {
    await this.requireMembership(workspaceId, user.id);
    return this.prisma.project.findMany({
      where: {
        workspaceId,
        ...(query.includeArchived ? {} : { archivedAt: null }),
      },
      include: { _count: { select: { tasks: true } } },
      orderBy: [{ archivedAt: "asc" }, { updatedAt: "desc" }],
    });
  }

  async createProject(workspaceId: string, body: CreateProjectDto, user: AuthenticatedUser) {
    await this.requireManager(workspaceId, user.id);
    return this.prisma.project.create({
      data: {
        workspaceId,
        name: body.name.trim(),
        description: body.description ?? "",
      },
    });
  }

  async getProject(projectId: string, user: AuthenticatedUser) {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        workspace: { memberships: { some: { userId: user.id } } },
      },
      include: { _count: { select: { tasks: true } } },
    });
    if (!project) throw this.notFound();
    return project;
  }

  async updateProject(projectId: string, body: UpdateProjectDto, user: AuthenticatedUser) {
    if (body.name === undefined && body.description === undefined) {
      throw new BadRequestException("Provide a project name or description to update.");
    }
    const project = await this.findProjectForUser(projectId, user.id);
    await this.requireManager(project.workspaceId, user.id);
    if (project.archivedAt) throw new ConflictException("Archived projects cannot be changed.");
    const updated = await this.prisma.project.updateMany({
      where: { id: projectId, workspaceId: project.workspaceId, archivedAt: null },
      data: body,
    });
    if (updated.count !== 1) throw new ConflictException("This project changed while it was being updated.");
    return this.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  }

  async archiveProject(projectId: string, user: AuthenticatedUser) {
    const project = await this.findProjectForUser(projectId, user.id);
    await this.requireManager(project.workspaceId, user.id);
    if (project.archivedAt) throw new ConflictException("This project is already archived.");
    const archived = await this.prisma.project.updateMany({
      where: { id: projectId, workspaceId: project.workspaceId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (archived.count !== 1) throw new ConflictException("This project changed while it was being archived.");
    return { archived: true };
  }

  async projectSummary(projectId: string, user: AuthenticatedUser) {
    const project = await this.findProjectForUser(projectId, user.id);
    if (project.archivedAt) throw new ConflictException("Archived projects do not have an active summary.");
    const where = { projectId };
    const [total, byStatus, byPriority, overdue] = await Promise.all([
      this.prisma.task.count({ where }),
      this.prisma.task.groupBy({ by: ["status"], where, _count: { _all: true } }),
      this.prisma.task.groupBy({ by: ["priority"], where, _count: { _all: true } }),
      this.prisma.task.count({
        where: { ...where, dueDate: { lt: new Date() }, status: { not: TaskStatus.DONE } },
      }),
    ]);
    const statusCounts = Object.fromEntries(
      Object.values(TaskStatus).map((status) => [
        status,
        byStatus.find((item) => item.status === status)?._count._all ?? 0,
      ]),
    ) as Record<TaskStatus, number>;
    const priorityCounts = Object.fromEntries(
      Object.values(TaskPriority).map((priority) => [
        priority,
        byPriority.find((item) => item.priority === priority)?._count._all ?? 0,
      ]),
    ) as Record<TaskPriority, number>;
    return {
      projectId,
      total,
      byStatus: statusCounts,
      byPriority: priorityCounts,
      overdue,
      completedPercent: total === 0 ? 0 : Math.round((statusCounts[TaskStatus.DONE] / total) * 100),
    };
  }

  async listTasks(projectId: string, query: ListTaskQueryDto, user: AuthenticatedUser) {
    const project = await this.findProjectForUser(projectId, user.id);
    if (project.archivedAt) throw new ConflictException("Archived projects cannot be viewed.");
    const where: Prisma.TaskWhereInput = {
      projectId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.assigneeId ? { assignee: { userId: query.assigneeId } } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: "insensitive" } },
              { description: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        include: taskDetails,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip,
        take: query.pageSize,
      }),
      this.prisma.task.count({ where }),
    ]);
    const statusCountsWhere: Prisma.TaskWhereInput = { ...where };
    delete statusCountsWhere.status;
    const statusGroups = await this.prisma.task.groupBy({
      by: ["status"],
      where: statusCountsWhere,
      _count: { _all: true },
    });
    const statusCounts = Object.fromEntries(
      Object.values(TaskStatus).map((status) => [
        status,
        statusGroups.find((item) => item.status === status)?._count._all ?? 0,
      ]),
    ) as Record<TaskStatus, number>;
    return {
      items,
      statusCounts,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        pageCount: Math.ceil(total / query.pageSize),
      },
    };
  }

  async createTask(projectId: string, body: CreateTaskDto, user: AuthenticatedUser) {
    const project = await this.findProjectForUser(projectId, user.id);
    if (project.archivedAt) throw new ConflictException("Tasks cannot be added to archived projects.");
    const creator = await this.requireMembership(project.workspaceId, user.id);
    const assigneeMembershipId = await this.resolveAssignee(
      project.workspaceId,
      body.assigneeId,
    );
    return this.prisma.$transaction(async (transaction) => {
      const task = await transaction.task.create({
        data: {
          projectId,
          title: body.title,
          description: body.description ?? "",
          status: body.status ?? TaskStatus.TODO,
          priority: body.priority ?? TaskPriority.MEDIUM,
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          assigneeMembershipId,
          creatorMembershipId: creator.id,
        },
        include: taskDetails,
      });
      await transaction.taskActivity.create({
        data: {
          taskId: task.id,
          actorMembershipId: creator.id,
          type: TaskActivityType.CREATED,
          toValue: task.title,
        },
      });
      if (assigneeMembershipId) {
        await transaction.taskActivity.create({
          data: {
            taskId: task.id,
            actorMembershipId: creator.id,
            type: TaskActivityType.ASSIGNED,
            toValue: assigneeMembershipId,
          },
        });
      }
      return task;
    });
  }

  async getTask(taskId: string, user: AuthenticatedUser) {
    const task = await this.findTaskForUser(taskId, user.id, true);
    return task;
  }

  async updateTask(taskId: string, body: UpdateTaskDto, user: AuthenticatedUser) {
    if (
      body.title === undefined &&
      body.description === undefined &&
      body.status === undefined &&
      body.priority === undefined &&
      body.assigneeId === undefined &&
      body.dueDate === undefined
    ) {
      throw new BadRequestException("Provide at least one task field to update.");
    }
    const task = await this.findTaskForUser(taskId, user.id);
    const project = task.project;
    if (project.archivedAt) throw new ConflictException("Tasks in archived projects cannot be changed.");
    if (body.status && !allowedTransitions[task.status].includes(body.status)) {
      throw new BadRequestException(`Tasks cannot transition from ${task.status} to ${body.status}.`);
    }
    const membership = await this.requireMembership(project.workspaceId, user.id);
    const isManager = membership.role === WorkspaceRole.OWNER || membership.role === WorkspaceRole.ADMIN;
    if (body.status !== undefined && body.status !== task.status &&
      !isManager && task.creatorMembershipId !== membership.id) {
      throw new ForbiddenException("Only the task creator or a workspace admin can change task status.");
    }
    const assigneeMembershipId = body.assigneeId === undefined
      ? undefined
      : await this.resolveAssignee(project.workspaceId, body.assigneeId);
    const data: Prisma.TaskUpdateManyMutationInput = {
      ...(body.title !== undefined ? { title: body.title.trim() } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.priority !== undefined ? { priority: body.priority } : {}),
      ...(body.dueDate !== undefined ? { dueDate: body.dueDate ? new Date(body.dueDate) : null } : {}),
      ...(assigneeMembershipId !== undefined || body.assigneeId === null
        ? { assigneeMembershipId: assigneeMembershipId ?? null }
        : {}),
      version: { increment: 1 },
    };
    const updated = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.task.updateMany({
        where: { id: taskId, version: body.version, project: { archivedAt: null } },
        data,
      });
      if (result.count !== 1) return result;
      if (body.status !== undefined && body.status !== task.status) {
        await transaction.taskActivity.create({
          data: {
            taskId,
            actorMembershipId: membership.id,
            type: TaskActivityType.STATUS_CHANGED,
            fromValue: task.status,
            toValue: body.status,
          },
        });
      }
      if (assigneeMembershipId !== undefined &&
        assigneeMembershipId !== task.assigneeMembershipId) {
        await transaction.taskActivity.create({
          data: {
            taskId,
            actorMembershipId: membership.id,
            type: TaskActivityType.ASSIGNED,
            fromValue: task.assigneeMembershipId,
            toValue: assigneeMembershipId,
          },
        });
      }
      return result;
    });
    if (updated.count !== 1) {
      throw new ConflictException("This task changed since it was loaded. Refresh and try again.");
    }
    return this.prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      include: taskDetails,
    });
  }

  async listComments(taskId: string, user: AuthenticatedUser) {
    await this.findTaskForUser(taskId, user.id);
    return this.prisma.taskComment.findMany({
      where: { taskId },
      include: {
        author: { include: { user: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async createComment(taskId: string, content: string, user: AuthenticatedUser) {
    const task = await this.findTaskForUser(taskId, user.id);
    if (task.project.archivedAt) throw new ConflictException("Comments cannot be added to archived projects.");
    const author = await this.requireMembership(task.project.workspaceId, user.id);
    return this.prisma.$transaction(async (transaction) => {
      const comment = await transaction.taskComment.create({
        data: { taskId, content, authorMembershipId: author.id },
        include: {
          author: { include: { user: { select: { id: true, name: true } } } },
        },
      });
      await transaction.taskActivity.create({
        data: {
          taskId,
          actorMembershipId: author.id,
          type: TaskActivityType.COMMENTED,
          toValue: comment.id,
        },
      });
      return comment;
    });
  }

  async listActivity(taskId: string, user: AuthenticatedUser) {
    await this.findTaskForUser(taskId, user.id);
    return this.prisma.taskActivity.findMany({
      where: { taskId },
      include: {
        actor: { include: { user: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async deleteTask(taskId: string, user: AuthenticatedUser): Promise<void> {
    const task = await this.findTaskForUser(taskId, user.id);
    if (task.project.archivedAt) throw new ConflictException("Archived project tasks cannot be deleted.");
    const membership = await this.requireMembership(task.project.workspaceId, user.id);
    const isManager = membership.role === WorkspaceRole.OWNER || membership.role === WorkspaceRole.ADMIN;
    if (!isManager && task.creatorMembershipId !== membership.id) {
      throw new ForbiddenException("Only the task creator or a workspace admin can delete this task.");
    }
    await this.prisma.task.delete({ where: { id: taskId } });
  }

  private async resolveAssignee(workspaceId: string, userId: string | null | undefined) {
    if (userId === undefined || userId === null) return null;
    const membership = await this.prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { id: true },
    });
    if (!membership) {
      throw new BadRequestException("Task assignee must be a member of this workspace.");
    }
    return membership.id;
  }

  private async requireMembership(workspaceId: string, userId: string) {
    const membership = await this.prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!membership) throw this.notFound();
    return membership;
  }

  private async requireManager(workspaceId: string, userId: string) {
    const membership = await this.requireMembership(workspaceId, userId);
    if (membership.role !== WorkspaceRole.OWNER && membership.role !== WorkspaceRole.ADMIN) {
      throw new ForbiddenException("Workspace owner or admin permission is required.");
    }
  }

  private async findProjectForUser(projectId: string, userId: string) {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        workspace: { memberships: { some: { userId } } },
      },
    });
    if (!project) throw this.notFound();
    return project;
  }

  private async findTaskForUser(taskId: string, userId: string, includeCollaboration = false) {
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        project: { workspace: { memberships: { some: { userId } } } },
      },
      include: {
        ...(includeCollaboration ? taskCollaborationDetails : taskDetails),
        project: true,
      },
    });
    if (!task) throw this.notFound();
    return task;
  }

  private notFound(): NotFoundException {
    return new NotFoundException("Project or task not found.");
  }
}
