import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = "admin@acme-labs.dev";
const ADMIN_PASSWORD = "labflow-demo";

// Full workflow against the real stack: sign in, open a project, create an experiment,
// add a sample, record a measurement, chart it, then edit the experiment. Each step
// asserts on data returned from the actual backend/Postgres, not fixtures.
test("sign in, create an experiment, record and chart a measurement, then edit it", async ({ page }) => {
  const stamp = Date.now();

  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("complementary").getByText("Acme Labs")).toBeVisible();

  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await expect(page).toHaveURL("/projects");
  // The sidebar also links to each project by name; scope to the main content so
  // `.first()` resolves to the project card (which has the nested `h2`), not the sidebar link.
  const firstProject = page.getByRole("main").getByRole("link", { name: /Catalyst Screening|Polymer Curing/ }).first();
  const projectName = (await firstProject.locator("h2").textContent())!.trim();
  await firstProject.click();
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

  const experimentName = `E2E Experiment ${stamp}`;
  await page.getByRole("button", { name: "New experiment" }).click();
  await page.getByLabel("Name").fill(experimentName);
  await page.getByRole("button", { name: "Create experiment" }).click();

  await expect(page).toHaveURL(/\/experiments\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: experimentName })).toBeVisible();
  await expect(page.getByText("No samples yet")).toBeVisible();

  const sampleName = `Sample-${stamp}`;
  await page.getByRole("button", { name: "New sample" }).click();
  await page.getByLabel("Name").fill(sampleName);
  await page.getByLabel("Type").fill("e2e-culture");
  await page.getByRole("button", { name: "Add sample" }).click();

  await expect(page.getByRole("cell", { name: sampleName, exact: true })).toBeVisible();

  const metric = `e2e_metric_${stamp}`;
  await page.getByRole("button", { name: "Add measurement" }).click();
  await page.getByLabel("Metric").fill(metric);
  await page.getByLabel("Value").fill("42.5");
  await page.getByLabel("Unit").fill("units");
  await page.getByRole("button", { name: "Save measurement" }).click();

  await expect(page.getByText(new RegExp(`Recorded ${metric}`))).toBeVisible();

  const tabs = page.getByRole("navigation", { name: "Experiment sections" });
  await tabs.getByRole("link", { name: "Analytics" }).click();
  await expect(page).toHaveURL(/\/analytics$/);
  await page.getByLabel("Metric", { exact: true }).selectOption(metric);
  await expect(page.getByText(/1 metric/)).toBeVisible();
  await expect(page.locator("svg.recharts-surface")).toBeVisible();

  await tabs.getByRole("link", { name: "Overview" }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Description").fill("Updated by the end-to-end test.");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByText("Updated by the end-to-end test.")).toBeVisible();
});
