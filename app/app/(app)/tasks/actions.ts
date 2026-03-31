"use server";

import { TaskStatus, TaskType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUserAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { getActiveEditionId, getRequiredString } from "@/lib/server-action-helpers";

export async function resolveTaskAction(formData: FormData) {
  const access = await getCurrentUserAccess();
  const taskId = getRequiredString(formData, "taskId");

  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });

  // Users can only resolve tasks assigned to them; admins can also resolve role-scoped tasks
  const canResolve =
    task.assignedToUserId === access.id ||
    (task.assignedToRole !== null && access.role === task.assignedToRole);

  if (!canResolve) {
    throw new Error("You are not authorised to resolve this task.");
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { status: TaskStatus.DONE, resolvedById: access.id, resolvedAt: new Date() },
  });

  revalidatePath("/tasks");
  revalidatePath("/");
}

async function getManagedTodoForUser(todoId: string, userId: string) {
  const todo = await prisma.todo.findUnique({
    where: { id: todoId },
    select: {
      id: true,
      createdById: true,
    },
  });

  if (!todo) {
    throw new Error("Todo not found.");
  }

  if (todo.createdById !== userId) {
    throw new Error("You can only manage your own todos.");
  }

  return todo;
}

function parseOptionalDueDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid due date.");
  }

  return date;
}

function parseOptionalAssigneeId(formData: FormData, isAdmin: boolean) {
  const value = String(formData.get("assignedToUserId") ?? "").trim();
  if (!isAdmin) {
    return null;
  }

  return value || null;
}

export async function createTodoAction(formData: FormData) {
  const access = await getCurrentUserAccess();
  const editionId = await getActiveEditionId();

  const title = getRequiredString(formData, "title");
  const description = String(formData.get("description") ?? "").trim() || null;
  const assignedToUserId = parseOptionalAssigneeId(formData, access.role === "ADMIN");

  await prisma.todo.create({
    data: {
      editionId,
      title,
      description,
      createdById: access.id,
      assignedToUserId: assignedToUserId ?? access.id,
    },
  });

  revalidatePath("/tasks");
  revalidatePath("/calendar");
}

export async function updateTodoAction(formData: FormData) {
  const access = await getCurrentUserAccess();
  const todoId = getRequiredString(formData, "todoId");

  await getManagedTodoForUser(todoId, access.id);

  const title = getRequiredString(formData, "title");
  const description = String(formData.get("description") ?? "").trim() || null;
  const assignedToUserId = parseOptionalAssigneeId(formData, access.role === "ADMIN");

  await prisma.todo.update({
    where: { id: todoId },
    data: {
      title,
      description,
      ...(access.role === "ADMIN" ? { assignedToUserId } : {}),
    },
  });

  revalidatePath("/tasks");
  revalidatePath("/calendar");
}

export async function deleteTodoAction(formData: FormData) {
  const access = await getCurrentUserAccess();
  const todoId = getRequiredString(formData, "todoId");
  const confirmation = getRequiredString(formData, "confirmDelete");

  if (confirmation !== "delete") {
    throw new Error("Type 'delete' to confirm.");
  }

  await getManagedTodoForUser(todoId, access.id);
  await prisma.todo.delete({ where: { id: todoId } });

  revalidatePath("/tasks");
  revalidatePath("/calendar");
}

export async function createTodoTaskAction(formData: FormData) {
  const access = await getCurrentUserAccess();
  const editionId = await getActiveEditionId();
  const todoIdRaw = String(formData.get("todoId") ?? "").trim();

  if (todoIdRaw) {
    await getManagedTodoForUser(todoIdRaw, access.id);
  }

  const title = getRequiredString(formData, "title");
  const description = String(formData.get("description") ?? "").trim() || null;
  const dueDate = parseOptionalDueDate(String(formData.get("dueDate") ?? ""));
  const assignedToUserId = parseOptionalAssigneeId(formData, access.role === "ADMIN");

  const persistedAssignee = access.role === "ADMIN" ? assignedToUserId : access.id;

  await prisma.task.create({
    data: {
      type: TaskType.GENERAL,
      editionId,
      todoId: todoIdRaw || null,
      title,
      description,
      dueDate,
      createdById: access.id,
      assignedToUserId: persistedAssignee,
    },
  });

  revalidatePath("/tasks");
  revalidatePath("/calendar");
}

export async function updateTodoTaskAction(formData: FormData) {
  const access = await getCurrentUserAccess();
  const todoTaskId = getRequiredString(formData, "todoTaskId");

  const existingTask = await prisma.task.findUnique({
    where: { id: todoTaskId },
    select: {
      id: true,
      type: true,
      todoId: true,
      todo: {
        select: {
          createdById: true,
        },
      },
      createdById: true,
    },
  });

  if (!existingTask) {
    throw new Error("Todo task not found.");
  }

  if (existingTask.type !== TaskType.GENERAL) {
    throw new Error("Only manually created tasks can be edited here.");
  }

  const canManage = existingTask.todo
    ? existingTask.todo.createdById === access.id
    : existingTask.createdById === access.id;

  if (!canManage) {
    redirect("/tasks?error=task-manage-permission");
  }

  const title = getRequiredString(formData, "title");
  const description = String(formData.get("description") ?? "").trim() || null;
  const dueDate = parseOptionalDueDate(String(formData.get("dueDate") ?? ""));
  const assignedToUserId = parseOptionalAssigneeId(formData, access.role === "ADMIN");

  await prisma.task.update({
    where: { id: todoTaskId },
    data: {
      title,
      description,
      dueDate,
      ...(access.role === "ADMIN" ? { assignedToUserId } : {}),
    },
  });

  revalidatePath("/tasks");
  revalidatePath("/calendar");
}

export async function deleteTodoTaskAction(formData: FormData) {
  const access = await getCurrentUserAccess();
  const todoTaskId = getRequiredString(formData, "todoTaskId");

  const existingTask = await prisma.task.findUnique({
    where: { id: todoTaskId },
    select: {
      id: true,
      type: true,
      todo: {
        select: {
          createdById: true,
        },
      },
      createdById: true,
    },
  });

  if (!existingTask) {
    throw new Error("Todo task not found.");
  }

  if (existingTask.type !== TaskType.GENERAL) {
    throw new Error("Only manually created tasks can be deleted here.");
  }

  const canManage = existingTask.todo
    ? existingTask.todo.createdById === access.id
    : existingTask.createdById === access.id;

  if (!canManage) {
    redirect("/tasks?error=task-manage-permission");
  }

  await prisma.task.delete({ where: { id: todoTaskId } });

  revalidatePath("/tasks");
  revalidatePath("/calendar");
}

export async function setTodoTaskStatusAction(formData: FormData) {
  const access = await getCurrentUserAccess();
  const todoTaskId = getRequiredString(formData, "todoTaskId");
  const nextStatus = getRequiredString(formData, "status");

  if (nextStatus !== "PENDING" && nextStatus !== "DONE") {
    throw new Error("Invalid todo task status.");
  }

  const existingTask = await prisma.task.findUnique({
    where: { id: todoTaskId },
    select: {
      id: true,
      type: true,
      assignedToUserId: true,
      todo: {
        select: {
          createdById: true,
        },
      },
      createdById: true,
    },
  });

  if (!existingTask) {
    throw new Error("Todo task not found.");
  }

  if (existingTask.type !== TaskType.GENERAL) {
    throw new Error("Only manually created tasks can be updated here.");
  }

  const canManage = existingTask.todo
    ? existingTask.todo.createdById === access.id || existingTask.assignedToUserId === access.id
    : existingTask.createdById === access.id || existingTask.assignedToUserId === access.id;

  if (!canManage) {
    throw new Error("You can only manage your own todos or tasks assigned to you.");
  }

  await prisma.task.update({
    where: { id: todoTaskId },
    data: {
      status: nextStatus,
    },
  });

  revalidatePath("/tasks");
  revalidatePath("/calendar");
}
