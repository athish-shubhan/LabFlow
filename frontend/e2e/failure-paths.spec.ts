import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = "admin@acme-labs.dev";
const ADMIN_PASSWORD = "labflow-demo";

test("rejects an incorrect password with a visible error and no session", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill("not-the-right-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.locator("#login-error")).toContainText("Incorrect email or password");
  await expect(page).toHaveURL(/\/login/);

  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === "labflow_session")).toBeUndefined();
});

test("rejects an empty project name client-side before any request is sent", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");

  await page.getByRole("link", { name: "Projects", exact: true }).click();
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/bff/api/")) requests.push(r.url());
  });

  await page.getByRole("button", { name: "New project" }).click();
  await page.getByRole("button", { name: "Create project" }).click();

  await expect(page.getByText("Name is required")).toBeVisible();
  expect(requests).toHaveLength(0);
});

test("guessing another organization's project id returns not-found, not the data", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");

  // Fermentation Scale-Up belongs to Helix Biosciences, a different organization than
  // the signed-in Acme Labs admin. The backend's tenant filter must 404 this, not 403
  // (which would confirm the id exists) and not 200 with the other tenant's data.
  const otherOrgsProjectId = "d0529a44-9147-40e0-969c-ed54b020a6ee";
  await page.goto(`/projects/${otherOrgsProjectId}`);

  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
  await expect(page.getByText("belongs to a workspace you don't have access to")).toBeVisible();
  await expect(page.getByText("Fermentation")).toHaveCount(0);
});
