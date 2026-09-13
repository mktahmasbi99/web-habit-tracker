import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import Calendar from "./Calendar";

it("renders a Monday-first month and returns the selected ISO date", async () => {
  const select = vi.fn();
  const user = userEvent.setup();
  render(<Calendar selected="2026-08-26" today="2026-08-26" onSelect={select} onJumpToToday={vi.fn()} />);
  const weekdays = screen.getAllByText(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/);
  expect(weekdays[0]).toHaveTextContent("Mon");
  await user.click(screen.getByRole("button", { name: "2026-08-15" }));
  expect(select).toHaveBeenCalledWith("2026-08-15");
});

it("offers a dedicated action to return to today without completion markers", async () => {
  const jumpToToday = vi.fn();
  const user = userEvent.setup();
  render(<Calendar selected="2026-08-15" today="2026-08-26" onSelect={vi.fn()} onJumpToToday={jumpToToday} />);

  expect(document.querySelector(".done-dot, .missed-dot, .markers")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Jump to today" }));
  expect(jumpToToday).toHaveBeenCalledOnce();
});
