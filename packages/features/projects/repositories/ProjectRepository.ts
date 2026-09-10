import type { CreateProjectInput, ListProjectsQuery, ProjectDto, UpdateProjectInput } from "../dto";

export interface ProjectRepository {
  findMany(query: ListProjectsQuery): Promise<{ items: ProjectDto[]; total: number }>;
  findById(id: string): Promise<ProjectDto | null>;
  insert(input: CreateProjectInput): Promise<ProjectDto>;
  update(id: string, input: UpdateProjectInput): Promise<ProjectDto | null>;
  delete(id: string): Promise<boolean>;
}
