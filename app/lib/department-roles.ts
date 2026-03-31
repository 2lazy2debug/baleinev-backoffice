import { prisma } from "@/lib/db";

export async function syncDepartmentRolesFromDepartments() {
  const departments = await prisma.department.findMany({
    distinct: ["name"],
    select: { name: true },
    orderBy: { name: "asc" },
  });

  await Promise.all(
    departments.map((department) =>
      prisma.departmentRole.upsert({
        where: { name: department.name },
        update: {},
        create: { name: department.name },
      }),
    ),
  );
}
