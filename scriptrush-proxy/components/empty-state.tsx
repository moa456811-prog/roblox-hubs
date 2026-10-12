import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";

export function EmptyState({ title, description, children, icon = "code" }: { title: string; description?: string; children?: ReactNode; icon?: IconName }) {
  return <div className="empty-state"><div className="empty-icon"><Icon name={icon} size={27} /></div><h3>{title}</h3>{description && <p>{description}</p>}{children && <div className="actions">{children}</div>}</div>;
}

export default EmptyState;
