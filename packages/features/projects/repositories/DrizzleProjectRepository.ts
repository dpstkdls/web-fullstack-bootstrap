import type { Db } from "@repo/db/client";
import { projects } from "@repo/db/schema";
import { and, count, desc, eq, ilike } from "drizzle-orm";
import type { CreateProjectInput, ListProjectsQuery, ProjectDto, UpdateProjectInput } from "../dto";
import type { ProjectRepository } from "./ProjectRepository";

// DTO에 필요한 컬럼만 — select(*) 금지 규칙의 단일 정의 지점
const projectColumns = {
  id: projects.id,
  name: projects.name,
  description: projects.description,
  status: projects.status,
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
};

export class DrizzleProjectRepository implements ProjectRepository {
  constructor(private readonly db: Db) {}

  async findMany(query: ListProjectsQuery): Promise<{ items: ProjectDto[]; total: number }> {
    const where = and(
      query.q === undefined ? undefined : ilike(projects.name, `%${query.q}%`),
      query.status === undefined ? undefined : eq(projects.status, query.status),
    );
    const [items, totals] = await Promise.all([
      this.db
        .select(projectColumns)
        .from(projects)
        .where(where)
        .orderBy(desc(projects.createdAt), desc(projects.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db.select({ value: count() }).from(projects).where(where),
    ]);
    return { items, total: totals[0]?.value ?? 0 };
  }

  async findById(id: string): Promise<ProjectDto | null> {
    const rows = await this.db
      .select(projectColumns)
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async insert(input: CreateProjectInput): Promise<ProjectDto> {
    const rows = await this.db.insert(projects).values(input).returning(projectColumns);
    if (!rows[0]) throw new Error("insert returned no row");
    return rows[0];
  }

  async update(id: string, input: UpdateProjectInput): Promise<ProjectDto | null> {
    const rows = await this.db
      .update(projects)
      .set(input)
      .where(eq(projects.id, id))
      .returning(projectColumns);
    return rows[0] ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(projects)
      .where(eq(projects.id, id))
      .returning({ id: projects.id });
    return rows.length > 0;
  }
}
