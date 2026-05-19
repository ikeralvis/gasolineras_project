import { test, expect } from "@playwright/test";

test("home loads and shows main headline", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/TankGo/i);
  await expect(
    page.getByRole("heading", { name: /Todo tu viaje en una sola app/i })
  ).toBeVisible();
});

test("login page renders form", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: /Bienvenido de nuevo/i })
  ).toBeVisible();
  await expect(page.locator("input[type=\"email\"]")).toBeVisible();
  await expect(page.locator("input[type=\"password\"]")).toBeVisible();
});
