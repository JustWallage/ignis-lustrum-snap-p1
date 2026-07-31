import { SPAWN } from "../shared/map";
import { apiSignIn, expect, pressStart, test, TODAY } from "./fixtures";

test("the jury's dialogue chain is driveable from the Game Boy buttons alone", async ({
  page,
}) => {
  await apiSignIn(page);
  await page.goto("/");
  await pressStart(page);
  await expect(page.getByTestId("player-name")).toHaveText("tester");

  const pad = (dir: string) =>
    page.getByRole("button", { name: `Walk ${dir}` });
  const a = page.getByTestId("a-button");
  const b = page.getByRole("button", { name: "B — cancel" });
  const text = page.getByTestId("dialogue-text");

  await pad("right").click();
  await pad("right").click();
  await expect(page.getByTestId("player-pos")).toHaveAttribute(
    "data-x",
    String(SPAWN.x + 2),
  );

  await a.click();
  await expect(text).toContainText(TODAY.name.toUpperCase());
  const choices = page.getByTestId("dialogue-choices");
  for (let press = 0; press < 10 && !(await choices.isVisible()); press += 1) {
    await a.click();
  }

  const upload = choices.getByRole("button", { name: "Upload photo" });
  const cancel = choices.getByRole("button", { name: "Cancel" });
  await expect(upload).toHaveAttribute("data-selected", "true");
  await pad("down").click();
  await expect(cancel).toHaveAttribute("data-selected", "true");
  await expect(upload).toHaveAttribute("data-selected", "false");
  await pad("down").click();
  await expect(upload).toHaveAttribute("data-selected", "true");

  await b.click();
  await expect(text).toBeHidden();
  await expect(page.locator(".gb-window")).toBeHidden();

  await a.click();
  await expect(text).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(text).toBeHidden();

  await a.click();
  for (let press = 0; press < 10 && !(await choices.isVisible()); press += 1) {
    await a.click();
  }
  await pad("down").click();
  await expect(cancel).toHaveAttribute("data-selected", "true");
  await a.click();
  await expect(text).toBeHidden();
  await expect(page.locator(".gb-window")).toBeHidden();
});
