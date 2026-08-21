-- Department access requests: a user asks to join a department and every admin
-- gets one task for it. The task is a *request* — resolving it grants nothing,
-- the membership is still assigned by hand in /users.
ALTER TYPE "TaskType" ADD VALUE 'DEPARTMENT_ACCESS_REQUEST';

-- The department that was asked for. Cascade: drop the department role and the
-- pending request goes with it, since there is nothing left to join.
ALTER TABLE "Task" ADD COLUMN "departmentRoleId" TEXT;

CREATE INDEX "Task_status_departmentRoleId_idx" ON "Task"("status", "departmentRoleId");

ALTER TABLE "Task" ADD CONSTRAINT "Task_departmentRoleId_fkey" FOREIGN KEY ("departmentRoleId") REFERENCES "DepartmentRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
