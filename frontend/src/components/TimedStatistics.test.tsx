import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import TimedStatistics from "./TimedStatistics";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({ api: { timedStatistics: vi.fn() } }));

const props = { activityId: 3, activityStart: "2026-08-24", selectedDate: "2026-08-30", selectedMinutes: 0, reportError: vi.fn() };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.timedStatistics).mockResolvedValue({ startDate: "2026-08-24", endDate: "2026-08-30", days: [
    { date: "2026-08-25", minutes: 10 },
    { date: "2026-08-26", minutes: 20 },
    { date: "2026-08-27", minutes: 30 },
    { date: "2026-08-28", minutes: 40 },
  ] });
});

it("scales daily shades to the selected period and supports arrow-key grid navigation", async () => {
  const user = userEvent.setup();
  render(<TimedStatistics {...props} />);
  await user.click(screen.getByRole("button", { name: "Heat map" }));

  const zero = await screen.findByRole("gridcell", { name: "2026-08-24, No time logged" });
  const ten = screen.getByRole("gridcell", { name: "2026-08-25, 10m logged" });
  const twenty = screen.getByRole("gridcell", { name: "2026-08-26, 20m logged" });
  expect(zero).toHaveAttribute("data-level", "0");
  expect(ten).toHaveAttribute("data-level", "1");
  expect(twenty).toHaveAttribute("data-level", "2");
  expect(screen.getByRole("gridcell", { name: "2026-08-27, 30m logged" })).toHaveAttribute("data-level", "3");
  expect(screen.getByRole("gridcell", { name: "2026-08-28, 40m logged" })).toHaveAttribute("data-level", "4");

  ten.focus();
  await user.keyboard("{ArrowDown}");
  expect(twenty).toHaveFocus();
});

it("moves month and year intervals across calendar boundaries", async () => {
  const user = userEvent.setup();
  render(<TimedStatistics {...props} activityStart="2025-01-01" selectedDate="2026-01-10" />);
  await user.selectOptions(screen.getByRole("combobox", { name: "Chart period" }), "month");
  await user.click(screen.getByRole("button", { name: "Previous chart interval" }));
  await waitFor(() => expect(api.timedStatistics).toHaveBeenLastCalledWith(3, "2025-12-01", "2025-12-31"));

  await user.selectOptions(screen.getByRole("combobox", { name: "Chart period" }), "year");
  await user.click(screen.getByRole("button", { name: "Previous chart interval" }));
  await waitFor(() => expect(api.timedStatistics).toHaveBeenLastCalledWith(3, "2025-01-01", "2025-12-31"));
});
