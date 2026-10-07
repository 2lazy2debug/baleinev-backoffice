import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn();
const revalidatePath = vi.fn();
const prisma = {
  invoiceSettings: { upsert: vi.fn() },
};

vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock("@/lib/access", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/db", () => ({ prisma }));

const { updateInvoiceTemplateAction } = await import("./actions");

function form(templateHtml: string): FormData {
  const fd = new FormData();
  fd.set("templateHtml", templateHtml);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ id: "admin_1", role: "ADMIN" });
  prisma.invoiceSettings.upsert.mockResolvedValue({ id: "default" });
});

describe("updateInvoiceTemplateAction", () => {
  it("refuses a non-admin", async () => {
    requireAdmin.mockRejectedValue(new Error("Unauthorized."));
    expect(await updateInvoiceTemplateAction({ error: null }, form("<p>x</p>"))).toEqual({ error: "Unauthorized." });
    expect(prisma.invoiceSettings.upsert).not.toHaveBeenCalled();
  });

  it("refuses an empty template", async () => {
    const result = await updateInvoiceTemplateAction({ error: null }, form("   "));
    expect(result.error).toMatch(/templateHtml/);
    expect(prisma.invoiceSettings.upsert).not.toHaveBeenCalled();
  });

  it("writes the one settings row", async () => {
    expect(await updateInvoiceTemplateAction({ error: null }, form("<p>[[invoiceNumber]]</p>"))).toEqual({ error: null });
    expect(prisma.invoiceSettings.upsert).toHaveBeenCalledWith({
      where: { id: "default" },
      update: { templateHtml: "<p>[[invoiceNumber]]</p>" },
      create: { id: "default", templateHtml: "<p>[[invoiceNumber]]</p>" },
    });
  });
});
