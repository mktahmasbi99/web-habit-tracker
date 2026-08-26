import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const ok = (value: unknown, status = 200) => Promise.resolve(new Response(
  status === 204 ? null : JSON.stringify(value),
  { status, headers: { "Content-Type": "application/json" } },
));

describe("Habit Tracker", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/config") return ok({ today: "2026-08-26", timezone: "Europe/Warsaw" });
      if (url === "/api/unresolved") return ok([{ date: "2026-08-25", pendingCount: 1 }]);
      if (url.includes("/api/days/")) return ok([{ id: 1, name: "Read", startDate: "2026-08-26", status: "pending", currentStreak: 0, hasNote: false }]);
      if (url === "/api/statistics") return ok([]);
      if (url === "/api/notes") return ok([]);
      return ok({}, 204);
    }));
  });

  it("shows the server-owned day and habit actions", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Read" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pending" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Europe/Warsaw")).not.toBeInTheDocument();
  });

  it("navigates to an unresolved date", async () => {
    const user = userEvent.setup(); render(<App />);
    await screen.findByRole("heading", { name: "Today" });
    await user.click(screen.getByRole("button", { name: /Notifications/ }));
    await user.click(await screen.findByRole("button", { name: /25 Aug 2026/ }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Yesterday" })).toBeInTheDocument());
  });

  it("exposes database import in More", async () => {
    const user = userEvent.setup(); render(<App />);
    await screen.findByRole("heading", { name: "Today" });
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(await screen.findByRole("heading", { name: "Import legacy database" })).toBeInTheDocument();
    expect(screen.getByText("Europe/Warsaw")).toBeInTheDocument();
  });
});
