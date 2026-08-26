import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import Calendar from "./Calendar";

it("renders a Monday-first month and returns the selected ISO date", async () => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("[]", { status: 200 }))));
  const select = vi.fn();
  const user = userEvent.setup();
  render(<Calendar selected="2026-08-26" today="2026-08-26" onSelect={select} />);
  const weekdays = screen.getAllByText(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/);
  expect(weekdays[0]).toHaveTextContent("Mon");
  await user.click(screen.getByRole("button", { name: "2026-08-15" }));
  expect(select).toHaveBeenCalledWith("2026-08-15");
});

