import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import TimedActivityNotesView from "./TimedActivityNotesView";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({ api: { timedActivityDetail: vi.fn(), timedActivityNotes: vi.fn(), timedNote: vi.fn(), timedActivities: vi.fn() } }));
const openNote = vi.fn();
const props = { activityId: 3, today: "2026-10-18", refresh: 0, active: true, onClose: vi.fn(), openNote, reportError: vi.fn() };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.timedActivityDetail).mockResolvedValue({ id: 3, name: "Archived activity", archived: true } as Awaited<ReturnType<typeof api.timedActivityDetail>>);
  vi.mocked(api.timedActivityNotes).mockResolvedValue([{ activityId: 3, activityName: "Archived activity", date: "2026-10-17", body: "Old note" }]);
});

it("shows saved notes for an archived timed activity without the add action", async () => {
  const user = userEvent.setup(); render(<TimedActivityNotesView {...props} />);
  await user.click(await screen.findByRole("button", { name: /Old note/ }));
  expect(screen.queryByRole("button", { name: "Add timed activity note" })).not.toBeInTheDocument();
  expect(openNote).toHaveBeenCalledWith("2026-10-17", false, "Archived activity");
});
