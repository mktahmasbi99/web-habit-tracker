import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import HabitNotesView from "./HabitNotesView";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({ api: { habitDetail: vi.fn(), habitNotes: vi.fn(), note: vi.fn(), habits: vi.fn() } }));
const openNote = vi.fn();
const props = { habitId: 1, today: "2026-08-26", refresh: 0, active: true, onClose: vi.fn(), openNote };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.habitDetail).mockResolvedValue({ id: 1, name: "Read" } as Awaited<ReturnType<typeof api.habitDetail>>);
  vi.mocked(api.habitNotes).mockResolvedValue([]);
  vi.mocked(api.note).mockResolvedValue({ exists: false } as Awaited<ReturnType<typeof api.note>>);
  vi.mocked(api.habits).mockResolvedValue([{ id: 1 }] as Awaited<ReturnType<typeof api.habits>>);
});
it("opens history without creating a note and opens today directly without a calendar", async () => {
  const user = userEvent.setup(); render(<HabitNotesView {...props} />);
  expect(await screen.findByText("No notes yet")).toBeInTheDocument();
  expect(openNote).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Add habit note" }));
  expect(screen.queryByText("Choose a note date")).not.toBeInTheDocument();
  await waitFor(() => expect(openNote).toHaveBeenCalledWith("2026-08-26", true));
});
it("blocks a new note in an inactive period but allows an existing note there", async () => {
  vi.mocked(api.habits).mockResolvedValue([]);
  const user = userEvent.setup(); render(<HabitNotesView {...props} />);
  await screen.findByText("No notes yet");
  await user.click(screen.getByRole("button", { name: "Add habit note" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("not active");
  expect(openNote).not.toHaveBeenCalled();
  vi.mocked(api.note).mockResolvedValue({ exists: true, body: "Saved" } as Awaited<ReturnType<typeof api.note>>);
  await user.click(screen.getByRole("button", { name: "Add habit note" }));
  await waitFor(() => expect(openNote).toHaveBeenCalledWith("2026-08-26", true));
});
it("retries failed history reads and refreshes after note changes", async () => {
  vi.mocked(api.habitNotes).mockRejectedValueOnce(new Error("Cannot reach server"));
  const user = userEvent.setup(); const view = render(<HabitNotesView {...props} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Cannot reach server");
  await user.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByText("No notes yet");
  vi.mocked(api.habitNotes).mockResolvedValue([{ habitId: 1, habitName: "Read", date: "2026-08-25", body: "Earlier note" }]);
  view.rerender(<HabitNotesView {...props} refresh={1} />);
  await user.click(await screen.findByRole("button", { name: /Earlier note/ }));
  expect(openNote).toHaveBeenCalledWith("2026-08-25", false);
  expect(api.habitNotes).toHaveBeenCalledWith(1);
});
it("keeps archived habit notes readable without offering a new-note action", async () => {
  vi.mocked(api.habitDetail).mockResolvedValue({ id: 1, name: "Read", archived: true } as Awaited<ReturnType<typeof api.habitDetail>>);
  vi.mocked(api.habitNotes).mockResolvedValue([{ habitId: 1, habitName: "Read", date: "2026-08-25", body: "Earlier note" }]);
  const user = userEvent.setup(); render(<HabitNotesView {...props} />);
  await user.click(await screen.findByRole("button", { name: /Earlier note/ }));
  expect(screen.queryByRole("button", { name: "Add habit note" })).not.toBeInTheDocument();
  expect(openNote).toHaveBeenCalledWith("2026-08-25", false);
});
