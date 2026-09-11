import { expect, test } from "@playwright/test";

test("signup → create → list → delete project", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  const projectName = `E2E Project ${Date.now()}`;

  await page.goto("/signup");
  await page.getByLabel(/이름|Name/).fill("E2E Tester");
  await page.getByLabel(/이메일|Email/).fill(email);
  await page.getByLabel(/비밀번호|Password/).fill("password1234");
  await page.getByRole("button", { name: /가입하기|Sign up/ }).click();
  await expect(page).toHaveURL(/\/projects/);

  await page.getByRole("link", { name: /새 프로젝트|New project/ }).click();
  await page.getByLabel(/^이름$|^Name$/).fill(projectName);
  await page.getByRole("button", { name: /저장|Save/ }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);

  await page.goto("/projects");
  await expect(page.getByRole("link", { name: projectName })).toBeVisible();

  await page.getByRole("link", { name: projectName }).click();
  await page
    .getByRole("button", { name: /삭제|Delete/ })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /삭제|Delete/ })
    .click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole("link", { name: projectName })).toHaveCount(0);
});
