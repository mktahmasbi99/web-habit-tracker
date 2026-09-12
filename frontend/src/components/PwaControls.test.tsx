import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InstallAppPanel, PwaUpdatePrompt, type PwaInstallState } from "./PwaControls";

const serviceWorker = vi.hoisted(() => ({
  needRefresh: false,
  setNeedRefresh: vi.fn(),
  update: vi.fn(() => Promise.resolve()),
}));

vi.mock("../hooks/usePwaUpdate", () => ({
  usePwaUpdate: () => ({
    needRefresh: serviceWorker.needRefresh,
    setNeedRefresh: serviceWorker.setNeedRefresh,
    update: serviceWorker.update,
  }),
}));

const installState = (overrides: Partial<PwaInstallState> = {}): PwaInstallState => ({
  canPrompt: false,
  install: vi.fn(() => Promise.resolve()),
  installed: false,
  isIos: false,
  isSecure: true,
  ...overrides,
});

describe("PWA controls", () => {
  it("offers the captured browser installation prompt", async () => {
    const user = userEvent.setup();
    const install = vi.fn(() => Promise.resolve());
    render(<InstallAppPanel state={installState({ canPrompt: true, install })} />);
    await user.click(screen.getByRole("button", { name: "Install Habit Tracker" }));
    expect(install).toHaveBeenCalledOnce();
  });

  it("explains iOS, insecure, and installed states", () => {
    const { rerender } = render(<InstallAppPanel state={installState({ isIos: true })} />);
    expect(screen.getByText("In Safari, tap Share, then Add to Home Screen.")).toBeInTheDocument();
    rerender(<InstallAppPanel state={installState({ isSecure: false })} />);
    expect(screen.getByText(/requires the HTTPS Tailscale address/)).toBeInTheDocument();
    rerender(<InstallAppPanel state={installState({ installed: true })} />);
    expect(screen.getByRole("status")).toHaveTextContent("Installed on this device.");
  });

  it("reloads a waiting service worker only after confirmation", async () => {
    serviceWorker.needRefresh = true;
    const user = userEvent.setup();
    render(<PwaUpdatePrompt />);
    await user.click(screen.getByRole("button", { name: "Reload now" }));
    expect(serviceWorker.update).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Later" }));
    expect(serviceWorker.setNeedRefresh).toHaveBeenCalledWith(false);
    serviceWorker.needRefresh = false;
  });
});
