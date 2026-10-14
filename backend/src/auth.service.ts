import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Prisma, User } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "./prisma.service";
import type { AuthenticatedUser } from "./auth.types";

export const SESSION_COOKIE = "teamflow_session";
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;
const SESSION_TOKEN_BYTES = 32;

@Injectable()
export class AuthService {
  private readonly dummyPasswordHash = bcrypt.hash(
    randomBytes(32).toString("hex"),
    BCRYPT_ROUNDS,
  );

  constructor(private readonly prisma: PrismaService) {}

  async register(
    name: string,
    email: string,
    password: string,
  ): Promise<{ user: AuthenticatedUser; token: string }> {
    this.assertBcryptPasswordSize(password);
    if (!name.trim()) {
      throw new BadRequestException("Name must not be empty.");
    }
    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const token = randomBytes(SESSION_TOKEN_BYTES).toString("base64url");

    try {
      const user = await this.prisma.$transaction(async (transaction) => {
        const createdUser = await transaction.user.create({
          data: { name: name.trim(), email: normalizedEmail, passwordHash },
        });
        await transaction.session.create({
          data: {
            tokenHash: this.hashToken(token),
            userId: createdUser.id,
            expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
          },
        });
        return createdUser;
      });
      return { user: this.toPublicUser(user), token };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException({
          statusCode: 409,
          error: "Conflict",
          message: "An account with that email already exists.",
        });
      }
      throw error;
    }
  }

  async login(email: string, password: string): Promise<{ user: AuthenticatedUser; token: string }> {
    this.assertBcryptPasswordSize(password);
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    const passwordHash = user?.passwordHash ?? await this.dummyPasswordHash;
    const passwordMatches = await bcrypt.compare(password, passwordHash);

    if (!user || !passwordMatches) {
      throw new UnauthorizedException({
        statusCode: 401,
        error: "Unauthorized",
        message: "Email or password is incorrect.",
      });
    }

    const token = randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
    await this.prisma.session.create({
      data: {
        tokenHash: this.hashToken(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
      },
    });
    return { user: this.toPublicUser(user), token };
  }

  async currentUser(token: string | undefined): Promise<AuthenticatedUser> {
    if (!token) throw this.invalidSession();

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: this.hashToken(token) },
      include: { user: true },
    });
    if (!session || session.expiresAt.getTime() <= Date.now()) {
      if (session) await this.prisma.session.delete({ where: { id: session.id } });
      throw this.invalidSession();
    }
    return this.toPublicUser(session.user);
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.prisma.session.deleteMany({ where: { tokenHash: this.hashToken(token) } });
  }

  private assertBcryptPasswordSize(password: string): void {
    if (Buffer.byteLength(password, "utf8") > 72) {
      throw new BadRequestException({
        statusCode: 400,
        error: "Bad Request",
        message: "Password must be no more than 72 bytes.",
      });
    }
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private toPublicUser(user: User): AuthenticatedUser {
    return { id: user.id, name: user.name, email: user.email };
  }

  private invalidSession(): UnauthorizedException {
    return new UnauthorizedException({
      statusCode: 401,
      error: "Unauthorized",
      message: "Authentication required.",
    });
  }
}
