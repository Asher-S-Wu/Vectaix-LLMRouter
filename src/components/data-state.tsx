import Link from "next/link";

export function EmptyState({ title, description, href, action }: Readonly<{ title: string; description: string; href?: string; action?: string }>) {
  return (
    <div className="empty-state">
      <div aria-hidden="true" className="empty-radar"><span /></div>
      <h3>{title}</h3>
      <p>{description}</p>
      {href && action ? <Link className="text-link" href={href}>{action}</Link> : null}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="正在加载控制台数据" className="page-wrap skeleton-page">
      <div className="skeleton skeleton-heading" />
      <div className="privacy-grid">
        {Array.from({ length: 3 }, (_, index) => <div className="skeleton skeleton-card" key={index} />)}
      </div>
      <div className="skeleton skeleton-panel" />
    </div>
  );
}
