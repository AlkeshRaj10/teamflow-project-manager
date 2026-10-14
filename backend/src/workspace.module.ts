import { Module } from "@nestjs/common";
import { AuthModule } from "./auth.module";
import { AuthGuard } from "./auth.guard";
import { WorkspaceController } from "./workspace.controller";
import { WorkspaceService } from "./workspace.service";

@Module({
  imports: [AuthModule],
  controllers: [WorkspaceController],
  providers: [WorkspaceService, AuthGuard],
})
export class WorkspaceModule {}
