import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import ActivityLogNotesView from "./ActivityLogNotesView";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({ api: { activityLogDetail: vi.fn(), activityLogNotes: vi.fn(), activityLogNote: vi.fn(), activityLogs: vi.fn() } }));
const openNote = vi.fn();
const props = { activityId: 8, activityName: "Archived log", today: "2026-10-18", refresh: 0, active: true, onClose: vi.fn(), openNote, reportError: vi.fn() };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.activityLogDetail).mockResolvedValue({ id: 8, name: "Archived log", archived: true } as Awaited<ReturnType<typeof api.activityLogDetail>>);
  vi.mocked(api.activityLogNotes).mockResolvedValue([{ activityId: 8, activityName: "Archived log", date: "2026-10-17", body: "Old log note" }]);
});

it("shows saved notes for an archived activity log without the add action", async () => {
  const user = userEvent.setup(); render(<ActivityLogNotesView {...props} />);
  await user.click(await screen.findByRole("button", { name: /Old log note/ }));
  expect(screen.queryByRole("button", { name: "Add activity log note" })).not.toBeInTheDocument();
  expect(openNote).toHaveBeenCalledWith("2026-10-17", false);
});
