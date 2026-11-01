import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import HabitAdherence from "./HabitAdherence";

it("shows inactive days before the habit start and opens active days by status", async () => {
  const user = userEvent.setup();
  const onNavigateToDate = vi.fn();
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify([
    { date: "2026-05-01", status: "done" },
    { date: "2026-05-02", status: "missed" },
    { date: "2026-05-03", status: "pending" },
  ]), { status: 200, headers: { "Content-Type": "application/json" } }))));

  render(<HabitAdherence habitId={1} startDate="2026-05-01" today="2026-05-03" period="year" customStart="2026-05-01" customEnd="2026-05-03" onCustomStart={vi.fn()} onCustomEnd={vi.fn()} onNavigateToDate={onNavigateToDate} onError={vi.fn()} />);

  expect(await screen.findByRole("gridcell", { name: "2026-04-30, Before habit start" })).toHaveClass("inactive");
  expect(screen.getByRole("gridcell", { name: "2026-05-01, Done" })).toHaveClass("done");
  expect(screen.getByRole("gridcell", { name: "2026-05-02, Missed" })).toHaveClass("missed");
  await user.click(screen.getByRole("gridcell", { name: "2026-05-03, Pending" }));
  expect(onNavigateToDate).toHaveBeenCalledWith("2026-05-03");
  expect(screen.getByText("Before start")).toBeInTheDocument();
});

it("uses one tab stop and moves through the heat map with arrow keys", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify([
    { date: "2026-05-01", status: "done" },
    { date: "2026-05-02", status: "missed" },
    { date: "2026-05-03", status: "pending" },
  ]), { status: 200, headers: { "Content-Type": "application/json" } }))));
  render(<HabitAdherence habitId={1} startDate="2026-05-01" today="2026-05-03" period="year" customStart="2026-05-01" customEnd="2026-05-03" onCustomStart={vi.fn()} onCustomEnd={vi.fn()} onNavigateToDate={vi.fn()} onError={vi.fn()} />);

  const done = await screen.findByRole("gridcell", { name: "2026-05-01, Done" });
  const missed = screen.getByRole("gridcell", { name: "2026-05-02, Missed" });
  expect(screen.getAllByRole("gridcell").filter(cell => cell.tagName === "BUTTON" && cell.tabIndex === 0)).toHaveLength(1);
  await user.tab();
  expect(done).toHaveFocus();
  await user.keyboard("{ArrowDown}");
  expect(missed).toHaveFocus();
});
