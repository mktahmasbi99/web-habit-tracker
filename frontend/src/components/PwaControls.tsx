import { usePwaUpdate } from "../hooks/usePwaUpdate";

export type PwaInstallState = {
  canPrompt: boolean;
  install: () => Promise<void>;
  installed: boolean;
  isIos: boolean;
  isSecure: boolean;
};

export function InstallAppPanel({ state }: { state: PwaInstallState }) {
  let content;
  if (state.installed) {
    content = <p className="settings-footnote" role="status">Installed on this device.</p>;
  } else if (!state.isSecure) {
    content = <p className="settings-footnote">Installation requires the HTTPS Tailscale address. This HTTP address can still be used in a browser.</p>;
  } else if (state.canPrompt) {
    content = <><button className="primary-settings-button" onClick={() => void state.install()}>Install Habit Tracker</button><p className="settings-footnote">Opens the browser’s installation confirmation.</p></>;
  } else if (state.isIos) {
    content = <p className="settings-footnote">In Safari, tap Share, then Add to Home Screen.</p>;
  } else {
    content = <p className="settings-footnote">Use your browser menu to install this app. If Install is not available yet, keep this page open briefly and try again.</p>;
  }
  return <div className="settings-group install-settings"><h2>Install app</h2>{content}</div>;
}

export function PwaUpdatePrompt() {
  const { needRefresh, setNeedRefresh, update } = usePwaUpdate();
  if (!needRefresh) return null;
  return <div className="pwa-update" role="status" aria-label="Application update available">
    <span>Update available.</span>
    <div><button onClick={() => void update()}>Reload now</button><button onClick={() => setNeedRefresh(false)}>Later</button></div>
  </div>;
}
