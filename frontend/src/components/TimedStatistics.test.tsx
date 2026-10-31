import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import TimedStatistics from "./TimedStatistics";

const props = {
  activityId: 10, activityStart: "2026-10-28", selectedDate: "2026-10-28",
  selectedMinutes: 90, refreshKey: 0, reportError: vi.fn(),
};

afterEach(() => vi.restoreAllMocks());

describe("TimedStatistics", () => {
  it("loads built-in periods from an activity's midweek and midmonth start", async () => {
    const user = userEvent.setup();
    const read = vi.spyOn(api, "timedStatistics").mockResolvedValue({
      startDate: props.activityStart, endDate: props.selectedDate,
      days: [{ date: props.selectedDate, minutes: 90 }],
    });
    render(<TimedStatistics {...props} />);
    await waitFor(() => expect(read).toHaveBeenCalledWith(10, "2026-10-28", "2026-10-28"));
    for (const period of ["month", "sixMonths", "year", "all"]) {
      await user.selectOptions(screen.getByLabelText("Chart period"), period);
      expect(screen.getByRole("img")).toHaveAccessibleName(/from 2026-10-28 to 2026-10-28/);
    }
    await waitFor(() => expect(screen.getAllByText("1h 30m").length).toBeGreaterThanOrEqual(2));
    await user.selectOptions(screen.getByLabelText("Chart period"), "custom");
    const previousReads = read.mock.calls.length;
    await user.clear(screen.getByLabelText("From"));
    await user.type(screen.getByLabelText("From"), "2026-10-27");
    expect(screen.getByText("Choose a valid date range within this activity.")).toBeInTheDocument();
    expect(read).toHaveBeenCalledTimes(previousReads);
  });

  it("reloads a mounted chart when its refresh key changes, even if the selected total is unchanged", async () => {
    const read = vi.spyOn(api, "timedStatistics").mockResolvedValue({
      startDate: props.activityStart, endDate: props.selectedDate,
      days: [{ date: props.selectedDate, minutes: 90 }],
    });
    const view = render(<TimedStatistics {...props} />);
    await waitFor(() => expect(screen.getAllByText("1h 30m").length).toBeGreaterThanOrEqual(2));
    read.mockResolvedValue({ startDate: props.activityStart, endDate: props.selectedDate,
      days: [{ date: props.selectedDate, minutes: 100 }] });
    view.rerender(<TimedStatistics {...props} refreshKey={1} />);
    await screen.findByRole("button", { name: "28 Oct total: 1h 40m" });
    expect(read).toHaveBeenCalledTimes(2);
    expect(within(screen.getByRole("img")).getByRole("button")).toHaveAccessibleName("28 Oct total: 1h 40m");
  });
});
