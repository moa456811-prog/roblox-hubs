"use client";

import { Icon } from "./icon";

export function ErrorState({ message, title = "Something needs your attention", onRetry, onDismiss }: { message: string; title?: string; onRetry?: () => void; onDismiss?: () => void }) {
  return <div className="error-state" role="alert"><Icon name="alert" size={21} /><div className="error-state-content"><h3>{title}</h3><p>{message}</p>{onRetry && <button type="button" className="button secondary small" onClick={onRetry}>Try again</button>}</div>{onDismiss && <button type="button" className="icon-button" aria-label="Dismiss error" onClick={onDismiss}><Icon name="close" size={17} /></button>}</div>;
}

export default ErrorState;
