import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import * as cookieParser from "cookie-parser";
import request = require("supertest");
import { AppModule } from "./app.module";
import { SESSION_COOKIE } from "./auth.service";
import { HttpExceptionFilter } from "./http-exception.filter";
import { PrismaService } from "./prisma.service";

const ORIGIN = "http://localhost:3000";
const VALID_PASSWORD = "correct horse battery";
interface TestUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

interface TestSession {
  id: string;
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}

class InMemoryPrisma {
  private users: TestUser[] = [];
  private sessions: TestSession[] = [];

  expireAllSessions(): void {
    this.sessions.forEach((session) => {
      session.expiresAt = new Date(Date.now() - 1);
    });
  }

  readonly $transaction = jest.fn(
    async <T>(callback: (transaction: InMemoryPrisma) => Promise<T>) => callback(this),
  );

  readonly user = {
    create: jest.fn(async ({ data }: { data: Omit<TestUser, "id" | "createdAt"> }) => {
      if (this.users.some((user) => user.email === data.email)) {
        throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "test",
          meta: { target: ["email"] },
        });
      }
      const user = { ...data, id: `user-${this.users.length + 1}`, createdAt: new Date() };
      this.users.push(user);
      return user;
    }),
    findUnique: jest.fn(async ({ where }: { where: { email: string } }) => {
      return this.users.find((user) => user.email === where.email) ?? null;
    }),
  };

  readonly session = {
    create: jest.fn(async ({ data }: { data: Omit<TestSession, "id" | "createdAt"> }) => {
      const session = { ...data, id: `session-${this.sessions.length + 1}`, createdAt: new Date() };
      this.sessions.push(session);
      return session;
    }),
    findUnique: jest.fn(async ({ where }: { where: { tokenHash: string } }) => {
      const session = this.sessions.find((item) => item.tokenHash === where.tokenHash);
      if (!session) return null;
      return { ...session, user: this.users.find((user) => user.id === session.userId)! };
    }),
    delete: jest.fn(async ({ where }: { where: { id: string } }) => {
      this.sessions = this.sessions.filter((session) => session.id !== where.id);
      return { id: where.id };
    }),
    deleteMany: jest.fn(async ({ where }: { where: { tokenHash: string } }) => {
      const previousCount = this.sessions.length;
      this.sessions = this.sessions.filter((session) => session.tokenHash !== where.tokenHash);
      return { count: previousCount - this.sessions.length };
    }),
  };
}

describe("authentication API", () => {
  let app: INestApplication;
  let prisma: InMemoryPrisma;

  beforeEach(async () => {
    process.env.FRONTEND_ORIGIN = ORIGIN;
    prisma = new InMemoryPrisma();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = module.createNestApplication();
    app.getHttpAdapter().getInstance().set("trust proxy", 1);
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.FRONTEND_ORIGIN;
  });

  function post(path: string) {
    return request(app.getHttpServer()).post(path).set("Origin", ORIGIN);
  }

  async function register() {
    const response = await post("/auth/register").send({
      name: "Ada Lovelace",
      email: "  ADA@example.com ",
      password: VALID_PASSWORD,
    });
    return response;
  }

  it("registers a normalized email and stores only a password hash", async () => {
    const response = await register();

    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({ name: "Ada Lovelace", email: "ada@example.com" });
    expect(response.body.user.passwordHash).toBeUndefined();
    expect(prisma.user.create.mock.calls[0][0].data.passwordHash).not.toBe(VALID_PASSWORD);
    expect(prisma.user.create.mock.calls[0][0].data.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(response.headers["set-cookie"][0]).toContain("HttpOnly");
  });

  it("rejects duplicate emails after normalization", async () => {
    expect((await register()).status).toBe(201);

    const duplicate = await post("/auth/register").send({
      name: "Another User",
      email: "Ada@EXAMPLE.com",
      password: VALID_PASSWORD,
    });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toMatchObject({ statusCode: 409, error: "Conflict" });
  });

  it("returns the same generic failure for unknown accounts and incorrect passwords", async () => {
    await register();

    const incorrectPassword = await post("/auth/login").send({
      email: "ada@example.com",
      password: "incorrect password",
    });
    const unknownAccount = await post("/auth/login").send({
      email: "nobody@example.com",
      password: "incorrect password",
    });

    expect(incorrectPassword.status).toBe(401);
    expect(unknownAccount.status).toBe(401);
    expect(unknownAccount.body.message).toBe(incorrectPassword.body.message);
    expect(incorrectPassword.body.message).toBe("Email or password is incorrect.");
  });

  it("logs in and allows access to a protected current-user endpoint", async () => {
    await register();
    const response = await post("/auth/login").send({
      email: " ADA@EXAMPLE.COM ",
      password: VALID_PASSWORD,
    });
    const cookie = response.headers["set-cookie"][0].split(";")[0];

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ name: "Ada Lovelace", email: "ada@example.com" });
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    await request(app.getHttpServer())
      .get("/auth/me")
      .set("Cookie", cookie)
      .expect(200)
      .expect(({ body }) => expect(body.user.email).toBe("ada@example.com"));
  });

  it("rejects protected requests without a valid session", async () => {
    const response = await request(app.getHttpServer()).get("/auth/me");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ statusCode: 401, error: "Unauthorized" });
  });

  it("rejects unauthenticated workspace API requests", async () => {
    const [workspace, projects, tasks, task, comments, activity] = await Promise.all([
      request(app.getHttpServer()).get("/workspaces"),
      request(app.getHttpServer()).get("/workspaces/workspace-1/projects"),
      request(app.getHttpServer()).get("/projects/project-1/tasks"),
      request(app.getHttpServer()).get("/tasks/task-1"),
      request(app.getHttpServer()).get("/tasks/task-1/comments"),
      request(app.getHttpServer()).get("/tasks/task-1/activity"),
    ]);

    expect([workspace, projects, tasks, task, comments, activity]
      .every((response) => response.status === 401)).toBe(true);
  });

  it("sets a Secure, HTTP-only, SameSite cookie in production", async () => {
    const originalEnvironment = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const response = await register();
      const cookie = response.headers["set-cookie"][0];
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("SameSite=Lax");
    } finally {
      if (originalEnvironment === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalEnvironment;
    }
  });

  it("invalidates the session at logout", async () => {
    await register();
    const login = await post("/auth/login").send({
      email: "ada@example.com",
      password: VALID_PASSWORD,
    });
    const cookie = login.headers["set-cookie"][0].split(";")[0];

    await post("/auth/logout").set("Cookie", cookie).expect(204);
    const currentUser = await request(app.getHttpServer()).get("/auth/me").set("Cookie", cookie);

    expect(currentUser.status).toBe(401);
  });

  it("expires stale sessions and removes them from storage", async () => {
    const registration = await register();
    const cookie = registration.headers["set-cookie"][0].split(";")[0];
    prisma.expireAllSessions();
    const response = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Cookie", cookie);

    expect(response.status).toBe(401);
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(prisma.session.delete).toHaveBeenCalledWith({ where: { id: "session-1" } });
  });

  it("limits repeated login attempts", async () => {
    const attempts = await Promise.all(Array.from({ length: 6 }, () =>
      post("/auth/login").send({ email: "missing@example.com", password: VALID_PASSWORD }),
    ));

    expect(attempts.slice(0, 5).every((response) => response.status === 401)).toBe(true);
    expect(attempts[5].status).toBe(429);
    expect(attempts[5].body).toMatchObject({ statusCode: 429, error: "Too Many Requests" });
  });

  it("rejects state-changing requests from an untrusted origin", async () => {
    const response = await request(app.getHttpServer()).post("/auth/register")
      .set("Origin", "https://attacker.example")
      .send({ name: "Ada", email: "ada@example.com", password: VALID_PASSWORD });

    expect(response.status).toBe(403);
  });
});
