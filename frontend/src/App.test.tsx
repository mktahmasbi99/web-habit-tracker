import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const ok = (value: unknown, status = 200) => Promise.resolve(new Response(
  status === 204 ? null : JSON.stringify(value),
  { status, headers: { "Content-Type": "application/json" } },
));
let noteResponse: unknown;
let noteSummaries: unknown[];
let habitNotes: unknown[];
let habitName: string;
let timedActivities: unknown[];

describe("Habit Tracker", () => {
  beforeEach(() => {
    noteResponse = { habitId: 1, habitName: "Read", date: "2026-08-26", body: "", exists: false, archived: false };
    noteSummaries = [];
    habitNotes = [];
    habitName = "Read";
    timedActivities = [];
    window.history.replaceState(null, "", "/");
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/config") return ok({ today: "2026-08-26", timezone: "Europe/Warsaw" });
      if (url === "/api/unresolved") return ok([{ date: "2026-08-25", pendingCount: 1 }]);
      if (url === "/api/system-notifications") return ok([]);
      if (url === "/api/backups") return ok([]);
      if (url === "/api/backups/settings") return ok({ dailyEnabled: true, dailyTime: "01:00", dailyRetention: 7, weeklyEnabled: true, weeklyDay: 6, weeklyTime: "01:00", weeklyRetention: 8, safetyRetention: 8 });
      if (url === "/api/habits") return ok([{ id: 1, name: "Read", startDate: "2026-08-26", archived: false, archivedAt: null, latestActiveRange: null, noteCount: 0 }, { id: 2, name: "Run", startDate: "2026-07-01", archived: true, archivedAt: "2026-08-20", latestActiveRange: { startDate: "2026-07-01", endDate: "2026-08-20" }, noteCount: 1 }]);
      if (url === "/api/habits/1") {
        if (init?.method === "PATCH") habitName = JSON.parse(String(init.body)).name;
        return ok({ id: 1, name: habitName, startDate: "2026-08-26", archived: false, archivedAt: null, latestActiveRange: null, noteCount: 0, currentStreak: 0, longestStreak: null, streaks: [] });
      }
      if (url === "/api/habits/2") return ok({ id: 2, name: "Run", startDate: "2026-07-01", archived: true, archivedAt: "2026-08-20", latestActiveRange: { startDate: "2026-07-01", endDate: "2026-08-20" }, noteCount: 1, currentStreak: 3, longestStreak: { startDate: "2026-08-18", endDate: "2026-08-20", length: 3 }, streaks: [] });
      if (url === "/api/habits/2/archive-periods") return ok([]);
      if (url === "/api/habits/1/days/2026-08-26/note") return ok(noteResponse);
      if (url === "/api/timed-activities/10/weeks/2026-08-26") return ok({ id: 10, name: "Study", startDate: "2026-08-26", selectedDate: "2026-08-26", days: [{ date: "2026-08-26", minutes: 90, entries: [{ id: 100, minutes: 90 }], active: true }], note: "" });
      if (url === "/api/timed-activities" || url === "/api/timed-activities/notes/summaries") return ok([]);
      if (/^\/api\/days\/\d{4}-\d{2}-\d{2}\/timed-activities$/.test(url)) return ok(timedActivities);
      if (url.includes("/api/days/")) return ok([{ id: 1, name: habitName, startDate: "2026-08-26", status: "pending", currentStreak: 0, hasNote: Boolean((noteResponse as { exists?: boolean }).exists) }]);
      if (url === "/api/statistics") return ok([]);
      if (url === "/api/notes") return ok(noteSummaries);
      if (url === "/api/habits/1/notes") return ok(habitNotes);
      return ok({}, 204);
    }));
  });

  it("shows the server-owned day and habit actions", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByText("2026-08-26")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Read" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pending" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Europe/Warsaw")).not.toBeInTheDocument();
  });

  it("shows selected-day totals and prioritizes logging in the timed activity sheet", async () => {
    const user = userEvent.setup();
    timedActivities = [
      { id: 10, name: "Study", startDate: "2026-08-26", dayMinutes: 90, weekMinutes: 90, hasNote: false, archived: false },
      { id: 11, name: "Offline", startDate: "2026-08-26", dayMinutes: 0, weekMinutes: 0, hasNote: false, archived: false },
    ];
    render(<App />);
    expect(await screen.findByText("1h 30m")).toBeInTheDocument();
    expect(screen.getByText("0m")).toBeInTheDocument();
    expect(screen.queryByText("Timed activity")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open Study" }));
    const hours = await screen.findByRole("spinbutton", { name: "Hours" });
    const entries = screen.getByRole("heading", { name: "Entries" });
    expect(hours.compareDocumentPosition(entries) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelector(".timed-title-total")).toHaveTextContent("1h 30m");
  });

  it("refreshes the Today card after renaming a daily habit", async () => {
    const user = userEvent.setup(); render(<App />);
    await user.click(await screen.findByRole("button", { name: "Open Read" }));
    await user.click(await screen.findByRole("button", { name: "Edit habit" }));
    const name = screen.getByRole("textbox", { name: "Habit name" });
    await user.clear(name); await user.type(name, "Read books");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Read books", level: 1 })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Close habit details" }));
    expect(await screen.findByRole("button", { name: "Open Read books" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Read" })).not.toBeInTheDocument();
  });

  it("only shows the date subtitle for today, yesterday, and tomorrow", async () => {
    const user = userEvent.setup(); render(<App />);
    await screen.findByRole("heading", { name: "Today" });
    await user.click(screen.getByRole("button", { name: "Previous day" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Yesterday" })).toBeInTheDocument());
    expect(screen.getByText("2026-08-25")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous day" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "24 Aug 2026" })).toBeInTheDocument());
    expect(screen.queryByText("2026-08-24")).not.toBeInTheDocument();
  });

  it("navigates to an unresolved date", async () => {
    const user = userEvent.setup(); render(<App />);
    await screen.findByRole("heading", { name: "Today" });
    await user.click(screen.getByRole("button", { name: /Notifications/ }));
    await user.click(await screen.findByRole("button", { name: /25 Aug 2026/ }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Yesterday" })).toBeInTheDocument());
  });

  it("saves an open note with Ctrl+Enter", async () => {
    const user = userEvent.setup(); render(<App />);
    await screen.findByRole("heading", { name: "Read" });
    await user.click(screen.getByRole("button", { name: /note for Read/ }));
    const note = await screen.findByRole("textbox", { name: "Note" });
    await user.type(note, "Finished a chapter");
    await user.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/habits/1/days/2026-08-26/note",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ body: "Finished a chapter" }) }),
    ));
  });

  it("opens an existing note read-only, cancels edits, and confirms deletion without typed text", async () => {
    noteResponse = { habitId: 1, habitName: "Read", date: "2026-08-26", body: "Original note", exists: true, archived: false };
    const user = userEvent.setup(); render(<App />);
    await screen.findByRole("heading", { name: "Read" });
    await user.click(screen.getByRole("button", { name: "View note for Read" }));
    expect(await screen.findByText("Original note")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Note" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit note" }));
    const editor = screen.getByRole("textbox", { name: "Note" });
    await user.clear(editor); await user.type(editor, "Changed");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Original note")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "More note options" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(screen.getByText("Delete this note?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/habits/1/days/2026-08-26/note",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ body: "" }) }),
    ));
  });

  it("shows a clear missing-note state for a stale direct URL", async () => {
    window.history.replaceState(null, "", "/habits/1/notes/2026-08-26");
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Note not found" })).toBeInTheDocument();
    expect(screen.getByText(/deleted or removed by a database restore/)).toBeInTheDocument();
  });

  it("replaces the note-history mask with the selected note and restores it on close", async () => {
    noteSummaries = [{ id: 1, name: "Read", startDate: "2026-08-26", archived: false, noteCount: 1 }];
    habitNotes = [{ habitId: 1, habitName: "Read", date: "2026-08-26", body: "Finished a chapter" }];
    noteResponse = { habitId: 1, habitName: "Read", date: "2026-08-26", body: "Finished a chapter", exists: true, archived: false };
    const user = userEvent.setup(); render(<App />);
    await screen.findByRole("heading", { name: "Today" });
    await user.click(screen.getByRole("button", { name: "Notes" }));
    await user.click(await screen.findByRole("button", { name: /Read/ }));
    expect(screen.getByRole("dialog", { name: "Read" })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /Finished a chapter/ }));
    expect(await screen.findByText("Finished a chapter")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Read" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Note" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close note" }));
    expect(await screen.findByRole("dialog", { name: "Read" })).toBeInTheDocument();
  });

  it("places database import in the collapsed Backup and restore advanced section", async () => {
    const user = userEvent.setup(); render(<App />);
    await screen.findByRole("heading", { name: "Today" });
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(await screen.findByRole("heading", { name: "Data" })).toBeInTheDocument();
    const backup = screen.getByRole("button", { name: "Backup and restore" });
    expect(backup).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Create backup" })).not.toBeInTheDocument();
    await user.click(backup);
    expect(backup).toHaveAttribute("aria-expanded", "true");
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
    expect(screen.getByRole("heading", { name: "Server time" })).toBeInTheDocument();
    expect(screen.getByText(/timezone comes from the server/)).toBeInTheDocument();
    expect(screen.getByText("Europe/Warsaw")).toBeInTheDocument();
  });

  it("preserves the archived disclosure while a habit detail opens and closes", async () => {
    const user = userEvent.setup(); render(<App />);
    await screen.findByRole("heading", { name: "Today" });
    await user.click(screen.getByRole("button", { name: "Manage" }));
    const active = await screen.findByRole("button", { name: "Active" });
    const archived = screen.getByRole("button", { name: "Archived" });
    expect(active).toHaveAttribute("aria-expanded", "true");
    expect(archived).toHaveAttribute("aria-expanded", "false");
    await user.click(archived);
    await user.click(await screen.findByRole("button", { name: /Run/ }));
    expect(await screen.findByRole("heading", { name: "Run" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close habit details" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Close habit details" })).not.toBeInTheDocument());
    expect(archived).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /Run/ })).toBeInTheDocument();
  });
});
