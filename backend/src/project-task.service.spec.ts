import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { TaskPriority, TaskStatus, WorkspaceRole } from "@prisma/client";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import type { AuthenticatedUser } from "./auth.types";
import { CreateTaskDto, ListTaskQueryDto, UpdateTaskDto } from "./project-task.dto";
import { PrismaService } from "./prisma.service";
import { ProjectTaskService } from "./project-task.service";

const owner: AuthenticatedUser = { id: "user-owner", name: "Owner", email: "owner@example.com" };
const member: AuthenticatedUser = { id: "user-member", name: "Member", email: "member@example.com" };

function projectFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "project-1",
    workspaceId: "workspace-1",
    name: "Roadmap",
    description: "",
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function taskFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    projectId: "project-1",
    title: "Draft roadmap",
    description: "",
    status: TaskStatus.TODO,
    priority: TaskPriority.MEDIUM,
    dueDate: null,
    assigneeMembershipId: null,
    creatorMembershipId: "member-owner",
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    project: projectFixture(),
    assignee: null,
    creator: null,
    ...overrides,
  };
}

class ProjectTaskPrismaDouble {
  membership: { id: string; workspaceId: string; userId: string; role: WorkspaceRole } | null = {
    id: "member-owner",
    workspaceId: "workspace-1",
    userId: owner.id,
    role: WorkspaceRole.OWNER,
  };
  assigneeMembership: { id: string } | null = { id: "member-assignee" };
  project: ReturnType<typeof projectFixture> | null = projectFixture();
  task: ReturnType<typeof taskFixture> | null = taskFixture();

  readonly workspaceMembership = {
    findUnique: jest.fn(async ({
      where,
    }: {
      where: { workspaceId_userId: { userId: string } };
    }) => {
      const userId = where.workspaceId_userId.userId;
      if (userId === this.membership?.userId) return this.membership;
      if (userId === owner.id && this.membership?.userId !== owner.id) return null;
      return this.assigneeMembership;
    }),
  };
  readonly projectModel = {
    findMany: jest.fn(async () => []),
    findFirst: jest.fn(async () => this.project),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      ...projectFixture(),
      ...data,
    })),
    update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      ...projectFixture(),
      ...data,
    })),
    updateMany: jest.fn(async () => ({ count: 1 })),
    findUniqueOrThrow: jest.fn(async () => projectFixture({ name: "Release plan v2" })),
  };
  readonly taskModel = {
    findMany: jest.fn(async () => [taskFixture()]),
    findFirst: jest.fn(async () => this.task),
    findUniqueOrThrow: jest.fn(async () => taskFixture({ version: 2 })),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      ...taskFixture(),
      ...data,
    })),
    updateMany: jest.fn(async () => ({ count: 1 })),
    delete: jest.fn(async () => taskFixture()),
    count: jest.fn(async () => 2),
    groupBy: jest.fn(async ({ by }: { by: string[] }) => by[0] === "status"
      ? [{ status: TaskStatus.DONE, _count: { _all: 1 } }]
      : [{ priority: TaskPriority.HIGH, _count: { _all: 1 } }]),
  };
  readonly taskActivity = {
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "activity-1",
      ...data,
    })),
    findMany: jest.fn(async () => []),
  };
  readonly taskComment = {
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "comment-1",
      createdAt: new Date(),
      ...data,
    })),
    findMany: jest.fn(async () => []),
  };
  readonly $transaction = jest.fn(async <T>(
    callback: (transaction: {
      task: typeof this.taskModel;
      taskActivity: typeof this.taskActivity;
      taskComment: typeof this.taskComment;
    }) => Promise<T>,
  ) => callback({
    task: this.taskModel,
    taskActivity: this.taskActivity,
    taskComment: this.taskComment,
  }));

}

function makeService(double: ProjectTaskPrismaDouble): ProjectTaskService {
  const prisma = {
    workspaceMembership: double.workspaceMembership,
    project: double.projectModel,
    task: double.taskModel,
    taskActivity: double.taskActivity,
    taskComment: double.taskComment,
    $transaction: double.$transaction,
  };
  return new ProjectTaskService(prisma as unknown as PrismaService);
}

describe("project and task persistence", () => {
  let prisma: ProjectTaskPrismaDouble;
  let service: ProjectTaskService;

  beforeEach(() => {
    prisma = new ProjectTaskPrismaDouble();
    service = makeService(prisma);
  });

  it("validates task payload fields and pagination boundaries", async () => {
    const invalidTask = plainToInstance(CreateTaskDto, {
      title: "   ",
      priority: "URGENT",
    });
    const invalidUpdate = plainToInstance(UpdateTaskDto, {
      version: 0,
      title: null,
    });
    const invalidPage = plainToInstance(ListTaskQueryDto, {
      page: "0",
      pageSize: "101",
    });

    expect(await validate(invalidTask)).not.toHaveLength(0);
    expect(await validate(invalidUpdate)).not.toHaveLength(0);
    expect(await validate(invalidPage)).not.toHaveLength(0);
  });

  it("creates projects only for workspace managers", async () => {
    prisma.membership = { ...prisma.membership!, userId: member.id, role: WorkspaceRole.MEMBER };

    await expect(service.createProject("workspace-1", { name: "Private project" }, member))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.projectModel.create).not.toHaveBeenCalled();
  });

  it("creates and updates a manager-owned project", async () => {
    const created = await service.createProject("workspace-1", {
      name: "  Release plan  ",
      description: "Milestones",
    }, owner);
    const updated = await service.updateProject("project-1", {
      name: "Release plan v2",
    }, owner);

    expect(created).toMatchObject({ workspaceId: "workspace-1", name: "Release plan" });
    expect(updated.name).toBe("Release plan v2");
    expect(prisma.projectModel.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { workspaceId: "workspace-1", name: "Release plan", description: "Milestones" },
    }));
    expect(prisma.projectModel.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "project-1", workspaceId: "workspace-1", archivedAt: null },
    }));
  });

  it("scopes project reads to workspace membership", async () => {
    prisma.project = null;

    await expect(service.getProject("project-private", member)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.projectModel.findFirst).toHaveBeenCalledWith({
      where: {
        id: "project-private",
        workspace: { memberships: { some: { userId: member.id } } },
      },
      include: { _count: { select: { tasks: true } } },
    });
  });

  it("soft-archives a project without deleting its tasks", async () => {
    const result = await service.archiveProject("project-1", owner);

    expect(result).toEqual({ archived: true });
    expect(prisma.projectModel.updateMany).toHaveBeenCalledWith({
      where: { id: "project-1", workspaceId: "workspace-1", archivedAt: null },
      data: { archivedAt: expect.any(Date) },
    });
    expect(prisma.taskModel.delete).not.toHaveBeenCalled();
  });

  it("applies status, priority, assignee, search, and pagination filters in Prisma", async () => {
    await service.listTasks("project-1", {
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      assigneeId: "user-assignee",
      q: "wireframe",
      page: 2,
      pageSize: 10,
    }, owner);

    expect(prisma.taskModel.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        projectId: "project-1",
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.HIGH,
        assignee: { userId: "user-assignee" },
        OR: [
          { title: { contains: "wireframe", mode: "insensitive" } },
          { description: { contains: "wireframe", mode: "insensitive" } },
        ],
      },
      skip: 10,
      take: 10,
    }));
  });

  it("returns pagination metadata and filters task rows", async () => {
    const result = await service.listTasks("project-1", {
      page: 2,
      pageSize: 1,
    }, owner);

    expect(result.pagination).toEqual({ page: 2, pageSize: 1, total: 2, pageCount: 2 });
    expect(result.items).toHaveLength(1);
  });

  it("rejects an assignee who is not a member of the project's workspace", async () => {
    prisma.assigneeMembership = null;

    await expect(service.createTask("project-1", {
      title: "Restricted task",
      assigneeId: "outsider",
    }, owner)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.taskModel.create).not.toHaveBeenCalled();
  });

  it("rejects assignments to members outside the project's workspace", async () => {
    prisma.assigneeMembership = null;
    prisma.task = taskFixture({ status: TaskStatus.IN_PROGRESS });

    await expect(service.updateTask("task-1", {
      assigneeId: "user-outsider",
      version: 1,
    }, owner)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.taskModel.updateMany).not.toHaveBeenCalled();
  });

  it("creates tasks with workspace membership creator and normalized defaults", async () => {
    const created = await service.createTask("project-1", {
      title: "Draft roadmap",
      dueDate: "2026-11-01T00:00:00.000Z",
      assigneeId: "user-assignee",
    }, owner);

    expect(created).toMatchObject({
      projectId: "project-1",
      creatorMembershipId: "member-owner",
      assigneeMembershipId: "member-assignee",
      status: TaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
    });
    expect(prisma.taskModel.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        dueDate: new Date("2026-11-01T00:00:00.000Z"),
      }),
    }));
    expect(prisma.taskActivity.create).toHaveBeenCalledWith({
      data: {
        taskId: "task-1",
        actorMembershipId: "member-owner",
        type: "CREATED",
        toValue: "Draft roadmap",
      },
    });
  });

  it("records status and assignment changes in the update transaction", async () => {
    prisma.task = taskFixture({ status: TaskStatus.IN_PROGRESS });

    await service.updateTask("task-1", {
      status: TaskStatus.REVIEW,
      assigneeId: "user-assignee",
      version: 1,
    }, owner);

    expect(prisma.taskActivity.create).toHaveBeenCalledTimes(2);
    expect(prisma.taskActivity.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: "STATUS_CHANGED",
        fromValue: TaskStatus.IN_PROGRESS,
        toValue: TaskStatus.REVIEW,
      }),
    }));
    expect(prisma.taskActivity.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: "ASSIGNED",
        fromValue: null,
        toValue: "member-assignee",
      }),
    }));
  });

  it("rejects status changes by a member who is neither manager nor task creator", async () => {
    prisma.membership = {
      id: "member-ordinary",
      workspaceId: "workspace-1",
      userId: member.id,
      role: WorkspaceRole.MEMBER,
    };
    prisma.task = taskFixture({ creatorMembershipId: "another-member" });

    await expect(service.updateTask("task-1", {
      status: TaskStatus.IN_PROGRESS,
      version: 1,
    }, member)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.taskModel.updateMany).not.toHaveBeenCalled();
  });

  it("allows task members to comment and records comment activity atomically", async () => {
    prisma.membership = {
      id: "member-ordinary",
      workspaceId: "workspace-1",
      userId: member.id,
      role: WorkspaceRole.MEMBER,
    };

    const created = await service.createComment("task-1", "Looks good.", member);

    expect(created).toMatchObject({
      id: "comment-1",
      content: "Looks good.",
      authorMembershipId: "member-ordinary",
    });
    expect(prisma.taskActivity.create).toHaveBeenCalledWith({
      data: {
        taskId: "task-1",
        actorMembershipId: "member-ordinary",
        type: "COMMENTED",
        toValue: "comment-1",
      },
    });
  });

  it("denies comments for users outside the task workspace", async () => {
    prisma.task = null;

    await expect(service.createComment("task-1", "Unauthorized", member))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.taskComment.create).not.toHaveBeenCalled();
  });

  it("prevents reading tasks outside the user's workspace", async () => {
    prisma.task = null;

    await expect(service.getTask("task-private", member)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.listComments("task-private", member)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.listActivity("task-private", member)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.taskModel.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "task-private",
        project: { workspace: { memberships: { some: { userId: member.id } } } },
      },
    }));
    expect(prisma.taskComment.findMany).not.toHaveBeenCalled();
    expect(prisma.taskActivity.findMany).not.toHaveBeenCalled();
  });

  it("rejects invalid status transitions", async () => {
    prisma.task = taskFixture({ status: TaskStatus.TODO });

    await expect(service.updateTask("task-1", {
      status: TaskStatus.DONE,
      version: 1,
    }, owner)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.taskModel.updateMany).not.toHaveBeenCalled();
  });

  it("uses the task version for optimistic concurrency checks", async () => {
    prisma.taskModel.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.updateTask("task-1", {
      priority: TaskPriority.HIGH,
      version: 1,
    }, owner)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.taskModel.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "task-1", version: 1, project: { archivedAt: null } },
    }));
  });

  it("updates allowed transitions and increments the optimistic version", async () => {
    prisma.task = taskFixture({ status: TaskStatus.IN_PROGRESS });

    await service.updateTask("task-1", {
      status: TaskStatus.REVIEW,
      version: 1,
    }, owner);

    expect(prisma.taskModel.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: TaskStatus.REVIEW, version: { increment: 1 } },
    }));
    expect(prisma.taskModel.findUniqueOrThrow).toHaveBeenCalled();
  });

  it("deletes a task created by the requesting workspace member", async () => {
    prisma.membership = {
      id: "member-owner",
      workspaceId: "workspace-1",
      userId: owner.id,
      role: WorkspaceRole.MEMBER,
    };
    prisma.task = taskFixture();

    await expect(service.deleteTask("task-1", owner)).resolves.toBeUndefined();
    expect(prisma.taskModel.delete).toHaveBeenCalledWith({ where: { id: "task-1" } });
  });

  it("allows only the task creator or workspace manager to hard-delete a task", async () => {
    prisma.task = taskFixture({
      creatorMembershipId: "not-this-member",
      project: projectFixture(),
    });
    prisma.membership = {
      id: "member-ordinary",
      workspaceId: "workspace-1",
      userId: member.id,
      role: WorkspaceRole.MEMBER,
    };

    await expect(service.deleteTask("task-1", member)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.taskModel.delete).not.toHaveBeenCalled();
  });

  it("summarizes totals, statuses, priorities, and completion from stored rows", async () => {
    const result = await service.projectSummary("project-1", owner);

    expect(result).toEqual({
      projectId: "project-1",
      total: 2,
      byStatus: { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, DONE: 1 },
      byPriority: { LOW: 0, MEDIUM: 0, HIGH: 1 },
      overdue: 2,
      completedPercent: 50,
    });
  });
});
