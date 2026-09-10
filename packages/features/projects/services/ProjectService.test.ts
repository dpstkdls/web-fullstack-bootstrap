import { AppError } from "@repo/lib/errors";
import { describe, expect, it } from "vitest";
import type { CreateProjectInput, ListProjectsQuery, ProjectDto, UpdateProjectInput } from "../dto";
import type { ProjectRepository } from "../repositories/ProjectRepository";
import { ProjectService } from "./ProjectService";

class InMemoryProjectRepository implements ProjectRepository {
  private rows: ProjectDto[] = [];
  private seq = 0;

  async findMany(query: ListProjectsQuery) {
    const filtered = this.rows.filter(
      (p) =>
        (query.q === undefined || p.name.toLowerCase().includes(query.q.toLowerCase())) &&
        (query.status === undefined || p.status === query.status),
    );
    const start = (query.page - 1) * query.pageSize;
    return { items: filtered.slice(start, start + query.pageSize), total: filtered.length };
  }

  async findById(id: string) {
    return this.rows.find((p) => p.id === id) ?? null;
  }

  async insert(input: CreateProjectInput) {
    const now = new Date();
    const row: ProjectDto = {
      id: `id-${++this.seq}`,
      name: input.name,
      description: input.description ?? null,
      status: input.status ?? "active",
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(row);
    return row;
  }

  async update(id: string, input: UpdateProjectInput) {
    const row = this.rows.find((p) => p.id === id);
    if (!row) return null;
    Object.assign(row, input, { updatedAt: new Date() });
    return row;
  }

  async delete(id: string) {
    const before = this.rows.length;
    this.rows = this.rows.filter((p) => p.id !== id);
    return this.rows.length < before;
  }
}

function makeService() {
  return new ProjectService(new InMemoryProjectRepository());
}

describe("ProjectService", () => {
  it("creates and reads back a project", async () => {
    const svc = makeService();
    const created = await svc.create({ name: "Alpha", description: null, status: "active" });
    const found = await svc.getById(created.id);
    expect(found.name).toBe("Alpha");
    expect(found.status).toBe("active");
  });

  it("getById throws AppError NOT_FOUND for missing id", async () => {
    const svc = makeService();
    await expect(svc.getById("nope")).rejects.toThrowError(AppError);
    await expect(svc.getById("nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lists with name filter, status filter and pagination", async () => {
    const svc = makeService();
    await svc.create({ name: "Website Redesign", description: null, status: "active" });
    await svc.create({ name: "Mobile App", description: null, status: "active" });
    await svc.create({ name: "Legacy Migration", description: null, status: "archived" });

    const byName = await svc.list({ q: "web", page: 1, pageSize: 20 });
    expect(byName.total).toBe(1);
    expect(byName.items[0]?.name).toBe("Website Redesign");

    const byStatus = await svc.list({ status: "archived", page: 1, pageSize: 20 });
    expect(byStatus.total).toBe(1);

    const page2 = await svc.list({ page: 2, pageSize: 2 });
    expect(page2.total).toBe(3);
    expect(page2.items).toHaveLength(1);
  });

  it("update patches only given fields and bumps nothing else", async () => {
    const svc = makeService();
    const created = await svc.create({ name: "Alpha", description: "old", status: "active" });
    const updated = await svc.update(created.id, { name: "Beta" });
    expect(updated.name).toBe("Beta");
    expect(updated.description).toBe("old");
    expect(updated.status).toBe("active");
  });

  it("update with empty patch returns current row unchanged", async () => {
    const svc = makeService();
    const created = await svc.create({ name: "Alpha", description: null, status: "active" });
    const updated = await svc.update(created.id, {});
    expect(updated).toMatchObject({ id: created.id, name: "Alpha" });
  });

  it("update and delete throw NOT_FOUND for missing id", async () => {
    const svc = makeService();
    await expect(svc.update("nope", { name: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(svc.delete("nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("delete removes the row", async () => {
    const svc = makeService();
    const created = await svc.create({ name: "Alpha", description: null, status: "active" });
    await svc.delete(created.id);
    await expect(svc.getById(created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
