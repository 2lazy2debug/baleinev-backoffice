import { TaskStatus, TaskType, UserRole } from "@prisma/client";

import { prisma } from "@/lib/db";

type AccessContext = {
  id: string;
  role: "ADMIN" | "DEPARTMENT";
};

export async function createAdminTask(type: TaskType, title: string, expenseReportId: string) {
  await prisma.task.create({
    data: { type, title, assignedToRole: UserRole.ADMIN, expenseReportId },
  });
}

export async function createUserTask({
  type,
  title,
  userId,
  staffAssignmentId,
  dueDate,
}: {
  type: TaskType;
  title: string;
  userId: string;
  staffAssignmentId?: string;
  dueDate?: Date;
}) {
  await prisma.task.create({
    data: { type, title, assignedToUserId: userId, staffAssignmentId, dueDate },
  });
}

/**
 * A user asking to join a department. Assigned to the ADMIN *role*, not to one
 * admin: every admin sees it, and the first one to mark it done clears it for
 * all of them. Nothing here grants anything — the membership is still assigned
 * by hand in `/users`, and resolving the task never touches it.
 *
 * Global rather than edition-scoped, like the department roles it points at.
 */
export async function createDepartmentAccessRequestTask({
  userId,
  userName,
  departmentRoleId,
  departmentRoleName,
}: {
  userId: string;
  userName: string;
  departmentRoleId: string;
  departmentRoleName: string;
}) {
  await prisma.task.create({
    data: {
      type: TaskType.DEPARTMENT_ACCESS_REQUEST,
      title: `${userName} asked to join ${departmentRoleName}`,
      assignedToRole: UserRole.ADMIN,
      createdById: userId,
      departmentRoleId,
    },
  });
}

/** Department ids the user has an unanswered request for — one request at a time each. */
export async function getPendingDepartmentAccessRequests(userId: string) {
  const requests = await prisma.task.findMany({
    where: {
      type: TaskType.DEPARTMENT_ACCESS_REQUEST,
      status: TaskStatus.PENDING,
      createdById: userId,
      departmentRoleId: { not: null },
    },
    select: { departmentRole: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return requests.flatMap((request) => (request.departmentRole ? [request.departmentRole] : []));
}

export async function resolvePendingTask({
  type,
  expenseReportId,
  staffAssignmentId,
  resolvedById,
}: {
  type: TaskType;
  expenseReportId?: string;
  staffAssignmentId?: string;
  resolvedById: string;
}) {
  const task = await prisma.task.findFirst({
    where: {
      type,
      status: TaskStatus.PENDING,
      ...(expenseReportId ? { expenseReportId } : {}),
      ...(staffAssignmentId ? { staffAssignmentId } : {}),
    },
  });

  if (!task) return;

  await prisma.task.update({
    where: { id: task.id },
    data: { status: TaskStatus.DONE, resolvedById, resolvedAt: new Date() },
  });
}

export async function getPendingTasksForUser(access: AccessContext) {
  return prisma.task.findMany({
    where: {
      status: TaskStatus.PENDING,
      OR: [
        { assignedToUserId: access.id },
        { assignedToRole: access.role as UserRole },
        { createdById: access.id, type: TaskType.GENERAL },
      ],
    },
    include: {
      expenseReport: {
        select: { id: true, description: true, amount: true },
      },
      staffAssignment: {
        include: {
          shift: {
            include: {
              eventDay: {
                include: {
                  event: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });
}

export async function getVisibleTodosForUser({
  userId,
  editionId,
}: {
  userId: string;
  editionId: string;
}) {
  return prisma.todo.findMany({
    where: {
      editionId,
      OR: [
        { createdById: userId },
        { assignedToUserId: userId },
      ],
    },
    include: {
      assignedToUser: {
        select: {
          id: true,
          name: true,
        },
      },
      tasks: {
        where: {
          type: TaskType.GENERAL,
        },
        include: {
          assignedToUser: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
}

export async function getDueDatedTodoTasksForCalendar({
  userId,
  editionId,
}: {
  userId: string;
  editionId: string;
}) {
  return prisma.task.findMany({
    where: {
      type: TaskType.GENERAL,
      editionId,
      status: TaskStatus.PENDING,
      dueDate: {
        not: null,
      },
      OR: [
        { createdById: userId },
        { assignedToUserId: userId },
      ],
    },
    select: {
      id: true,
      title: true,
      dueDate: true,
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });
}

export async function getStandaloneTodoTasksForUser({
  userId,
  role,
}: {
  userId: string;
  role: "ADMIN" | "DEPARTMENT";
}) {
  return prisma.task.findMany({
    where: {
      todoId: null,
      OR: [
        { type: TaskType.GENERAL, createdById: userId },
        { type: TaskType.GENERAL, assignedToUserId: userId },
        { status: TaskStatus.PENDING, assignedToUserId: userId },
        { status: TaskStatus.PENDING, assignedToRole: role as UserRole },
      ],
    },
    include: {
      expenseReport: {
        select: { id: true, description: true, amount: true },
      },
      staffAssignment: {
        include: {
          shift: {
            include: {
              eventDay: {
                include: {
                  event: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      },
      assignedToUser: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "asc" }],
  });
}

export type PendingTask = Awaited<ReturnType<typeof getPendingTasksForUser>>[number];
