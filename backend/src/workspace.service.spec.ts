import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { WorkspaceRole } from "@prisma/client";
import { createHash } from "node:crypto";
import type { AuthenticatedUser } from "./auth.types";
import { PrismaService } from "./prisma.service";
import { WorkspaceService } from "./workspace.service";

interface MembershipRecord {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
}

interface InvitationRecord {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  tokenHash: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  workspace: { id: string; name: string };
}

class WorkspacePrismaDouble {
  memberships: MembershipRecord[] = [];
  invitations: InvitationRecord[] = [];
  readonly workspaceMembership = {
    findUnique: jest.fn(async ({ where }: { where: { workspaceId_userId: { workspaceId: string; userId: string } } }) =>
      this.memberships.find((item) =>
        item.workspaceId === where.workspaceId_userId.workspaceId &&
        item.userId === where.workspaceId_userId.userId,
      ) ?? null),
    findFirst: jest.fn(async () => null),
    findMany: jest.fn(async () => []),
    count: jest.fn(async ({ where }: { where: { workspaceId: string; role: WorkspaceRole } }) =>
      this.memberships.filter((item) => item.workspaceId === where.workspaceId && item.role === where.role).length),
    create: jest.fn(async ({ data }: { data: Omit<MembershipRecord, "id"> }) => {
      const membership = { ...data, id: `membership-${this.memberships.length + 1}` };
      this.memberships.push(membership);
      return membership;
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: { role: WorkspaceRole } }) => {
      const membership = this.memberships.find((item) => item.id === where.id)!;
      membership.role = data.role;
      return membership;
    }),
    delete: jest.fn(async ({ where }: { where: { id: string } }) => {
      const index = this.memberships.findIndex((item) => item.id === where.id);
      return this.memberships.splice(index, 1)[0];
    }),
  };
  readonly workspaceInvitation = {
    findUnique: jest.fn(async ({ where }: { where: { tokenHash: string } }) =>
      this.invitations.find((item) => item.tokenHash === where.tokenHash) ?? null),
    updateMany: jest.fn(async ({ where, data }: { where: { id: string }; data: { acceptedAt: Date } }) => {
      const invitation = this.invitations.find((item) => item.id === where.id && !item.acceptedAt);
      if (!invitation) return { count: 0 };
      invitation.acceptedAt = data.acceptedAt;
      return { count: 1 };
    }),
  };
  readonly $transaction = jest.fn(async <T>(
    operation: (transaction: WorkspacePrismaDouble) => Promise<T>,
  ) => operation(this));
}

describe("workspace authorization and invitations", () => {
  let prisma: WorkspacePrismaDouble;
  let service: WorkspaceService;
  const owner: AuthenticatedUser = { id: "owner-1", name: "Owner", email: "owner@example.com" };
  const member: AuthenticatedUser = { id: "member-1", name: "Member", email: "member@example.com" };

  beforeEach(() => {
    prisma = new WorkspacePrismaDouble();
    service = new WorkspaceService(prisma as unknown as PrismaService);
  });

  function addMember(userId: string, role: WorkspaceRole, workspaceId = "workspace-1") {
    prisma.memberships.push({
      id: `membership-${prisma.memberships.length + 1}`,
      workspaceId,
      userId,
      role,
    });
  }

  function addInvitation(token: string, expiresAt: Date, email = member.email) {
    prisma.invitations.push({
      id: "invitation-1",
      workspaceId: "workspace-1",
      email,
      role: WorkspaceRole.MEMBER,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt,
      acceptedAt: null,
      workspace: { id: "workspace-1", name: "TeamFlow" },
    });
  }

  it("hides workspaces and members from users outside the workspace", async () => {
    addMember(owner.id, WorkspaceRole.OWNER);

    await expect(service.get("workspace-1", member)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.listMembers("workspace-1", member)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.workspaceMembership.findMany).not.toHaveBeenCalled();
  });

  it("denies member role changes and unauthorized member removal", async () => {
    addMember(member.id, WorkspaceRole.MEMBER);

    await expect(service.updateMemberRole("workspace-1", member.id, WorkspaceRole.ADMIN, member))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.removeMember("workspace-1", member.id, member))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.workspaceMembership.delete).not.toHaveBeenCalled();
  });

  it("prevents admins from removing another admin", async () => {
    const admin: AuthenticatedUser = { id: "admin-1", name: "Admin", email: "admin@example.com" };
    addMember(admin.id, WorkspaceRole.ADMIN);
    addMember("another-admin", WorkspaceRole.ADMIN);

    await expect(service.removeMember("workspace-1", "another-admin", admin))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.workspaceMembership.delete).not.toHaveBeenCalled();
  });

  it("prevents removing or demoting the last owner", async () => {
    addMember(owner.id, WorkspaceRole.OWNER);

    await expect(service.removeMember("workspace-1", owner.id, owner))
      .rejects.toBeInstanceOf(ConflictException);
    await expect(service.updateMemberRole("workspace-1", owner.id, WorkspaceRole.MEMBER, owner))
      .rejects.toBeInstanceOf(ConflictException);
    expect(prisma.memberships[0].role).toBe(WorkspaceRole.OWNER);
  });

  it("rejects expired invitation tokens", async () => {
    addInvitation("expired-invite-token", new Date(Date.now() - 1));

    await expect(service.acceptInvitation("expired-invite-token", member))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.workspaceMembership.create).not.toHaveBeenCalled();
  });

  it("rejects duplicate membership when accepting an invitation", async () => {
    addInvitation("duplicate-invite-token", new Date(Date.now() + 60_000));
    addMember(member.id, WorkspaceRole.MEMBER);

    await expect(service.acceptInvitation("duplicate-invite-token", member))
      .rejects.toBeInstanceOf(ConflictException);
    expect(prisma.workspaceInvitation.updateMany).not.toHaveBeenCalled();
  });

  it("rejects invitation acceptance by a different email address", async () => {
    addInvitation("wrong-email-token", new Date(Date.now() + 60_000), "invited@example.com");

    await expect(service.acceptInvitation("wrong-email-token", member))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.workspaceMembership.create).not.toHaveBeenCalled();
  });

  it("accepts a valid invitation once and creates the assigned membership", async () => {
    addInvitation("valid-invite-token", new Date(Date.now() + 60_000));

    await expect(service.acceptInvitation("valid-invite-token", member))
      .resolves.toEqual({ id: "workspace-1", name: "TeamFlow" });
    expect(prisma.workspaceMembership.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace-1",
        userId: member.id,
        role: WorkspaceRole.MEMBER,
      },
    });
  });
});
