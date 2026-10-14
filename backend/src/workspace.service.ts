import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, WorkspaceRole } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import type { AuthenticatedUser } from "./auth.types";
import { PrismaService } from "./prisma.service";

const INVITATION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class WorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthenticatedUser) {
    const memberships = await this.prisma.workspaceMembership.findMany({
      where: { userId: user.id },
      include: { workspace: true },
      orderBy: { workspace: { createdAt: "asc" } },
    });
    return memberships.map(({ workspace, role }) => ({
      id: workspace.id,
      name: workspace.name,
      role,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    }));
  }

  async create(name: string, user: AuthenticatedUser) {
    return this.prisma.$transaction(async (transaction) => {
      const workspace = await transaction.workspace.create({ data: { name } });
      await transaction.workspaceMembership.create({
        data: { workspaceId: workspace.id, userId: user.id, role: WorkspaceRole.OWNER },
      });
      return { ...workspace, role: WorkspaceRole.OWNER };
    });
  }

  async get(workspaceId: string, user: AuthenticatedUser) {
    const membership = await this.requireMembership(workspaceId, user.id);
    const workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) throw this.workspaceNotFound();
    return { ...workspace, role: membership.role };
  }

  async update(workspaceId: string, name: string, user: AuthenticatedUser) {
    await this.requireManager(workspaceId, user.id);
    return this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { name },
    });
  }

  async remove(workspaceId: string, user: AuthenticatedUser): Promise<void> {
    const membership = await this.requireMembership(workspaceId, user.id);
    if (membership.role !== WorkspaceRole.OWNER) {
      throw new ForbiddenException("Only a workspace owner can delete the workspace.");
    }
    await this.prisma.workspace.delete({ where: { id: workspaceId } });
  }

  async listMembers(workspaceId: string, user: AuthenticatedUser) {
    await this.requireMembership(workspaceId, user.id);
    return this.prisma.workspaceMembership.findMany({
      where: { workspaceId },
      select: {
        role: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    });
  }

  async updateMemberRole(
    workspaceId: string,
    memberId: string,
    role: WorkspaceRole,
    user: AuthenticatedUser,
  ): Promise<void> {
    await this.requireOwner(workspaceId, user.id);
    await this.runSerializable(async (transaction) => {
      const target = await transaction.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: memberId } },
      });
      if (!target) throw new NotFoundException("Workspace member not found.");
      if (target.role === WorkspaceRole.OWNER && role !== WorkspaceRole.OWNER) {
        const ownerCount = await transaction.workspaceMembership.count({
          where: { workspaceId, role: WorkspaceRole.OWNER },
        });
        if (ownerCount <= 1) {
          throw new ConflictException("The last workspace owner cannot be demoted.");
        }
      }
      await transaction.workspaceMembership.update({
        where: { id: target.id },
        data: { role },
      });
    });
  }

  async removeMember(
    workspaceId: string,
    memberId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    const actor = await this.requireManager(workspaceId, user.id);
    await this.runSerializable(async (transaction) => {
      const target = await transaction.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: memberId } },
      });
      if (!target) throw new NotFoundException("Workspace member not found.");
      if (actor.role === WorkspaceRole.ADMIN && target.role !== WorkspaceRole.MEMBER) {
        throw new ForbiddenException("Workspace admins can only remove members.");
      }
      if (target.role === WorkspaceRole.OWNER) {
        const ownerCount = await transaction.workspaceMembership.count({
          where: { workspaceId, role: WorkspaceRole.OWNER },
        });
        if (ownerCount <= 1) {
          throw new ConflictException("The last workspace owner cannot be removed.");
        }
      }
      await transaction.workspaceMembership.delete({ where: { id: target.id } });
    });
  }

  async createInvitation(
    workspaceId: string,
    email: string,
    requestedRole: WorkspaceRole | undefined,
    user: AuthenticatedUser,
  ) {
    const actor = await this.requireManager(workspaceId, user.id);
    const role = requestedRole ?? WorkspaceRole.MEMBER;
    if (role === WorkspaceRole.OWNER) {
      throw new BadRequestException("Use member role management to transfer workspace ownership.");
    }
    if (actor.role === WorkspaceRole.ADMIN && role !== WorkspaceRole.MEMBER) {
      throw new ForbiddenException("Workspace admins can only invite members.");
    }

    const existingMember = await this.prisma.workspaceMembership.findFirst({
      where: { workspaceId, user: { email } },
    });
    if (existingMember) throw new ConflictException("That user is already a workspace member.");

    const pendingInvitation = await this.prisma.workspaceInvitation.findFirst({
      where: { workspaceId, email, acceptedAt: null, expiresAt: { gt: new Date() } },
    });
    if (pendingInvitation) throw new ConflictException("An active invitation already exists for that email.");

    const token = randomBytes(32).toString("base64url");
    const invitation = await this.prisma.workspaceInvitation.create({
      data: {
        workspaceId,
        email,
        role,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(Date.now() + INVITATION_DURATION_MS),
        createdById: user.id,
      },
      include: { workspace: { select: { name: true } } },
    });
    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      workspaceName: invitation.workspace.name,
      token,
    };
  }

  async acceptInvitation(token: string, user: AuthenticatedUser) {
    const tokenHash = this.hashToken(token);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const invitation = await transaction.workspaceInvitation.findUnique({
          where: { tokenHash },
          include: { workspace: { select: { id: true, name: true } } },
        });
        if (!invitation || invitation.acceptedAt || invitation.expiresAt.getTime() <= Date.now()) {
          throw new BadRequestException("This invitation is invalid, expired, or already used.");
        }
        if (invitation.email !== user.email) {
          throw new ForbiddenException("Sign in with the email address this invitation was sent to.");
        }
        const existingMembership = await transaction.workspaceMembership.findUnique({
          where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: user.id } },
        });
        if (existingMembership) {
          throw new ConflictException("You are already a member of this workspace.");
        }

        const claimed = await transaction.workspaceInvitation.updateMany({
          where: { id: invitation.id, acceptedAt: null, expiresAt: { gt: new Date() } },
          data: { acceptedAt: new Date() },
        });
        if (claimed.count !== 1) {
          throw new BadRequestException("This invitation is invalid, expired, or already used.");
        }
        await transaction.workspaceMembership.create({
          data: {
            workspaceId: invitation.workspaceId,
            userId: user.id,
            role: invitation.role,
          },
        });
        return invitation.workspace;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("You are already a member of this workspace.");
      }
      throw error;
    }
  }

  private async requireMembership(workspaceId: string, userId: string) {
    const membership = await this.prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!membership) throw this.workspaceNotFound();
    return membership;
  }

  private async requireManager(workspaceId: string, userId: string) {
    const membership = await this.requireMembership(workspaceId, userId);
    if (membership.role !== WorkspaceRole.OWNER && membership.role !== WorkspaceRole.ADMIN) {
      throw new ForbiddenException("Workspace owner or admin permission is required.");
    }
    return membership;
  }

  private async requireOwner(workspaceId: string, userId: string) {
    const membership = await this.requireMembership(workspaceId, userId);
    if (membership.role !== WorkspaceRole.OWNER) {
      throw new ForbiddenException("Only a workspace owner can change member roles.");
    }
    return membership;
  }

  private async runSerializable<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        throw new ConflictException("Workspace membership changed concurrently. Please retry.");
      }
      throw error;
    }
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private workspaceNotFound(): NotFoundException {
    return new NotFoundException("Workspace not found.");
  }
}
