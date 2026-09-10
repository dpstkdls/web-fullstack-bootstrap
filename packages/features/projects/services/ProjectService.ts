import { AppError } from "@repo/lib/errors";
import type {
  CreateProjectInput,
  ListProjectsQuery,
  ProjectDto,
  ProjectPage,
  UpdateProjectInput,
} from "../dto";
import type { ProjectRepository } from "../repositories/ProjectRepository";

export class ProjectService {
  constructor(private readonly repo: ProjectRepository) {}

  async list(query: ListProjectsQuery): Promise<ProjectPage> {
    const { items, total } = await this.repo.findMany(query);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getById(id: string): Promise<ProjectDto> {
    const found = await this.repo.findById(id);
    if (!found) throw new AppError("NOT_FOUND", `project ${id} not found`);
    return found;
  }

  async create(input: CreateProjectInput): Promise<ProjectDto> {
    return this.repo.insert(input);
  }

  async update(id: string, input: UpdateProjectInput): Promise<ProjectDto> {
    // undefined 키를 걸러야 "빈 패치"를 식별할 수 있고, drizzle .set({}) 예외도 막는다
    const patch = Object.fromEntries(
      Object.entries(input).filter(([, v]) => v !== undefined),
    ) as UpdateProjectInput;
    if (Object.keys(patch).length === 0) return this.getById(id);
    const updated = await this.repo.update(id, patch);
    if (!updated) throw new AppError("NOT_FOUND", `project ${id} not found`);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.repo.delete(id);
    if (!deleted) throw new AppError("NOT_FOUND", `project ${id} not found`);
  }
}
