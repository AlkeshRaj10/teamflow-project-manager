import { Module } from "@nestjs/common";
import { AuthModule } from "./auth.module";
import { AuthGuard } from "./auth.guard";
import { WorkspaceController } from "./workspace.controller";
import { WorkspaceService } from "./workspace.service";
import { ProjectTaskController } from "./project-task.controller";
import { ProjectTaskService } from "./project-task.service";

@Module({
  imports: [AuthModule],
  controllers: [WorkspaceController, ProjectTaskController],
  providers: [WorkspaceService, ProjectTaskService, AuthGuard],
})
export class WorkspaceModule {}
