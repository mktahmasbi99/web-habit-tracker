import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import HabitStatusCalendar from "./HabitStatusCalendar";

it("shows one daily habit's done, missed, and pending statuses", async () => {
  const onError = vi.fn();
  const onNavigateToDate = vi.fn();
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({
    id: 1, name: "Read", startDate: "2026-08-01", month: "2026-08", days: [
      { date: "2026-08-01", active: true, status: "done" },
      { date: "2026-08-02", active: true, status: "missed" },
      { date: "2026-08-03", active: true, status: "pending" },
    ],
  }), { status: 200, headers: { "Content-Type": "application/json" } }))));

  const { rerender } = render(<HabitStatusCalendar habitId={1} today="2026-08-03" refreshKey="2026-08-03" onError={onError} onNavigateToDate={onNavigateToDate} />);

  expect(await screen.findByRole("gridcell", { name: "2026-08-01, done" })).toHaveClass("habit-status-day");
  expect(screen.getByRole("gridcell", { name: "2026-08-02, missed" }).querySelector(".missed-dot")).not.toBeNull();
  expect(screen.getByRole("gridcell", { name: "2026-08-03, pending" }).querySelector(".pending-dot")).not.toBeNull();
  expect(screen.getByText("Done")).toBeInTheDocument();
  expect(screen.getByText("Missed")).toBeInTheDocument();
  expect(screen.getByText("Pending")).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole("gridcell", { name: "2026-08-02, missed" }));
  expect(onNavigateToDate).toHaveBeenCalledWith("2026-08-02");

  rerender(<HabitStatusCalendar habitId={1} today="2026-08-03" refreshKey="2026-08-01" onError={onError} onNavigateToDate={onNavigateToDate} />);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
});
