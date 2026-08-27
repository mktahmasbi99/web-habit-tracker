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
      if (url === "/api/system-notifications") return ok([]);
      if (url === "/api/backups") return ok([]);
      if (url === "/api/backups/settings") return ok({ dailyEnabled: true, dailyTime: "01:00", dailyRetention: 7, weeklyEnabled: true, weeklyDay: 6, weeklyTime: "01:00", weeklyRetention: 8, safetyRetention: 8 });
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

  it("places database import in the collapsed Backup and restore advanced section", async () => {
    const user = userEvent.setup(); render(<App />);
    await screen.findByRole("heading", { name: "Today" });
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(await screen.findByRole("heading", { name: "Backup and restore" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create backup" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Server backups" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Restore from backup" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Backup scheduling" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Advanced" }));
    expect(screen.getByRole("heading", { name: "Backup scheduling" })).toBeInTheDocument();
    expect(screen.getAllByDisplayValue("01:00")).toHaveLength(2);
    expect(screen.queryByRole("heading", { name: "Import legacy database" })).not.toBeInTheDocument();
    const legacy = screen.getByRole("button", { name: "Import legacy database" });
    expect(legacy).toHaveAttribute("aria-expanded", "false");
    await user.click(legacy);
    expect(screen.getByRole("heading", { name: "Import legacy database" })).toBeInTheDocument();
    expect(screen.queryByText("Backup and restore", { selector: ".roadmap-row" })).not.toBeInTheDocument();
    expect(screen.getByText("Europe/Warsaw")).toBeInTheDocument();
  });
});
