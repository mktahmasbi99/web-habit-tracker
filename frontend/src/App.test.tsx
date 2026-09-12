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
let activityLogs: unknown[];

describe("Habit Tracker", () => {
  beforeEach(() => {
    document.documentElement.dataset.theme = "";
    noteResponse = { habitId: 1, habitName: "Read", date: "2026-08-26", body: "", exists: false, archived: false };
    noteSummaries = [];
    habitNotes = [];
    habitName = "Read";
    timedActivities = [];
    activityLogs = [];
    window.history.replaceState(null, "", "/");
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/config") return ok({ today: "2026-08-26", timezone: "Europe/Warsaw", theme: "system" });
      if (url === "/api/settings/theme") return ok({ theme: JSON.parse(String(init?.body)).theme });
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
      if (url === "/api/activity-logs") return ok([]);
      if (/^\/api\/activity-logs\/\d+\/days\/\d{4}-\d{2}-\d{2}\/completion$/.test(url)) {
        const body = JSON.parse(String(init?.body)) as { status: string };
        activityLogs = (activityLogs as Array<Record<string, unknown>>).map(item => ({ ...item, completed: body.status === "done", lastCompletedDate: body.status === "done" ? "2026-08-26" : null }));
        return ok(undefined, 204);
      }
      if (/^\/api\/days\/\d{4}-\d{2}-\d{2}\/activity-logs$/.test(url)) return ok(activityLogs);
      if (/^\/api\/days\/\d{4}-\d{2}-\d{2}\/timed-activities$/.test(url)) return ok(timedActivities);
      if (url.includes("/api/days/")) return ok([{ id: 1, name: habitName, startDate: "2026-08-26", status: "pending", currentStreak: 0, hasNote: Boolean((noteResponse as { exists?: boolean }).exists) }]);
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

  it("reuses the notification badge data when opening Alerts", async () => {
    const user = userEvent.setup(); render(<App />);
    await screen.findByRole("heading", { name: "Today" });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/unresolved", expect.anything()));
    const callsBeforeOpeningAlerts = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) => url === "/api/unresolved").length;
    await user.click(screen.getByRole("button", { name: "Notifications, 1 unresolved dates" }));
    expect(await screen.findByRole("heading", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByText("25 Aug 2026")).toBeInTheDocument();
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([url]) => url === "/api/unresolved")).toHaveLength(callsBeforeOpeningAlerts);
  });

  it("refreshes notification counts on resume without reloading Today", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Today" });
    const mockedFetch = fetch as ReturnType<typeof vi.fn>;
    const todayCalls = () => mockedFetch.mock.calls.filter(([url]) => String(url).includes("/api/days/2026-08-26/")).length;
    const beforeResume = todayCalls();

    window.dispatchEvent(new Event("focus"));

    await waitFor(() => expect(mockedFetch.mock.calls.filter(([url]) => url === "/api/config")).toHaveLength(2));
    expect(todayCalls()).toBe(beforeResume);
    expect(screen.queryByText("Loading habits…")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Read" })).toBeInTheDocument();
  });

  it("toggles an activity-log Done button without daily status choices", async () => {
    activityLogs = [{ id: 8, name: "Change vase water", startDate: "2026-08-01", lastCompletedDate: "2026-08-22", completed: false, hasNote: false, archived: false }];
    const user = userEvent.setup(); render(<App />);
    const done = await screen.findByRole("button", { name: "Mark Change vase water done" });
    expect(done).toHaveTextContent("Done");
    expect(done).toHaveAttribute("aria-pressed", "false");
    await user.click(done);
    await waitFor(() => expect(screen.getByRole("button", { name: "Mark Change vase water not done" })).toHaveAttribute("aria-pressed", "true"));
  });

  it("uses in-sheet radio choices for the activity type", async () => {
    const user = userEvent.setup(); render(<App />);
    await user.click(await screen.findByRole("button", { name: "Add habit" }));
    const dialog = screen.getByRole("dialog", { name: "New activity" });
    expect(dialog.querySelector("select")).toBeNull();
    const daily = screen.getByRole("radio", { name: "Daily habit" });
    const timed = screen.getByRole("radio", { name: "Timed activity" });
    expect(daily).toBeChecked();
    await user.click(timed);
    expect(timed).toBeChecked();
    expect(screen.getByRole("textbox", { name: "Activity name" })).toBeInTheDocument();
    expect(screen.queryByText("Daily habit (done or missed)")).not.toBeInTheDocument();
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

  it("keeps daily streaks glanceable and places timed statistics in the activity sheet", async () => {
    const user = userEvent.setup();
    timedActivities = [{ id: 10, name: "Study", startDate: "2026-08-26", dayMinutes: 90, weekMinutes: 90, hasNote: false, archived: false }];
    render(<App />);
    expect(await screen.findByText("0 streak")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stats" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open Study" }));
    expect(await screen.findByRole("heading", { name: "Weekly statistics" })).toBeInTheDocument();
    expect(screen.getByText("Week through this day")).toBeInTheDocument();
    expect(screen.getAllByText("1h 30m").length).toBeGreaterThanOrEqual(2);
  });

  it("starts duration fields empty and converts total minutes into hours and minutes", async () => {
    const user = userEvent.setup();
    timedActivities = [{ id: 10, name: "Study", startDate: "2026-08-26", dayMinutes: 90, weekMinutes: 90, hasNote: false, archived: false }];
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Open Study" }));
    const hours = await screen.findByRole("spinbutton", { name: "Hours" });
    const minutes = screen.getByRole("spinbutton", { name: "Minutes" });
    expect(hours).toHaveValue(null);
    expect(minutes).toHaveValue(null);
    expect(hours).toHaveAttribute("placeholder", "0");
    expect(minutes).toHaveAttribute("placeholder", "0");
    await user.type(minutes, "100");
    expect(minutes).toHaveValue(100);
    await user.click(hours);
    await waitFor(() => {
      expect(hours).toHaveValue(1);
      expect(minutes).toHaveValue(40);
    });
    await user.clear(hours);
    await user.clear(minutes);
    await user.type(minutes, "1440");
    await user.click(hours);
    await waitFor(() => {
      expect(hours).toHaveValue(24);
      expect(minutes).toHaveValue(0);
    });
  });

  it("replaces the timed activity title with its focused editor", async () => {
    const user = userEvent.setup();
    timedActivities = [{ id: 10, name: "Study", startDate: "2026-08-26", dayMinutes: 90, weekMinutes: 90, hasNote: false, archived: false }];
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Open Study" }));
    await user.click(screen.getByRole("button", { name: "Edit timed activity" }));
    const name = screen.getByRole("textbox", { name: "Activity name" });
    expect(name).toHaveFocus();
    expect(name).toHaveValue("Study");
    expect(screen.queryByRole("heading", { name: "Study" })).not.toBeInTheDocument();
  });

  it("replaces the activity-log title with its focused editor", async () => {
    const user = userEvent.setup();
    activityLogs = [{ id: 8, name: "Change vase water", startDate: "2026-08-01", lastCompletedDate: null, completed: false, hasNote: false, archived: false }];
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Open Change vase water" }));
    await user.click(screen.getByRole("button", { name: "Edit activity log" }));
    const name = screen.getByRole("textbox", { name: "Activity name" });
    expect(name).toHaveFocus();
    expect(name).toHaveValue("Change vase water");
    expect(screen.queryByRole("heading", { name: "Change vase water" })).not.toBeInTheDocument();
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

  it("switches between the experimental retro themes", async () => {
    const user = userEvent.setup(); render(<App />);
    await screen.findByRole("heading", { name: "Today" });
    await user.click(screen.getByRole("button", { name: "More" }));
    const arcade = await screen.findByRole("radio", { name: "16-bit Arcade" });
    expect(screen.getByRole("radio", { name: "System" })).toBeChecked();
    await user.click(arcade);
    expect(arcade).toBeChecked();
    expect(document.documentElement).toHaveAttribute("data-theme", "arcade");
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/settings/theme", expect.objectContaining({ method: "PUT", body: JSON.stringify({ theme: "arcade" }) })));
    const crt = screen.getByRole("radio", { name: "CRT Fighter" });
    await user.click(crt);
    expect(crt).toBeChecked();
    expect(document.documentElement).toHaveAttribute("data-theme", "crt");
    const neon = screen.getByRole("radio", { name: "Neon Brawler" });
    await user.click(neon);
    expect(neon).toBeChecked();
    expect(document.documentElement).toHaveAttribute("data-theme", "neon");
    const desert = screen.getByRole("radio", { name: "Desert Quest" });
    await user.click(desert);
    expect(desert).toBeChecked();
    expect(document.documentElement).toHaveAttribute("data-theme", "desert");
    const cartridge = screen.getByRole("radio", { name: "Cartridge Mode" });
    await user.click(cartridge);
    expect(cartridge).toBeChecked();
    expect(document.documentElement).toHaveAttribute("data-theme", "cartridge");
    expect(screen.getByText(/shared by every device/)).toBeInTheDocument();
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
